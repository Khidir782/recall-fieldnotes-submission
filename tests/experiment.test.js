import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeTrial,
  makePair,
  posterior,
  recommend,
  pairInformation,
  scoreAnswers,
  sessionExport,
  importSession,
  summarize,
} from "../src/experiment.js";
const record = (condition, correct, seed = 1) => ({
  ...makeTrial(seed, condition),
  valid: true,
  transfer: false,
  correct,
});
test("seeded routes reproduce, have unique objects/rooms, and contain correct cue candidate", () => {
  for (let seed = 0; seed < 100; seed++) {
    const t = makeTrial(seed, "cues");
    assert.deepEqual(t, makeTrial(seed, "cues"));
    assert.equal(new Set(t.placements.map((p) => p.room)).size, 3);
    assert.equal(new Set(t.placements.map((p) => p.object)).size, 3);
    assert.ok(
      t.placements.every(
        (p) =>
          p.candidates.includes(p.room) && new Set(p.candidates).size === 3,
      ),
    );
  }
});
test("pairs balance conditions, randomize order, hold load fixed", () => {
  const orders = new Set();
  for (let s = 0; s < 50; s++) {
    const p = makePair(s, "delay", 1);
    assert.deepEqual(p.map((t) => t.condition).sort(), ["delay", "quiet"]);
    assert.ok(p.every((t) => t.placements.length === 3));
    orders.add(p[0].condition);
  }
  assert.equal(orders.size, 2);
});
test("posterior conserves probability; transfer and invalid trials do not affect it", () => {
  const p = posterior();
  assert.deepEqual(p.mass, [0.25, 0.25, 0.25, 0.25]);
  const ts = [record("quiet", 3), record("interruptions", 0)];
  assert.ok(posterior(ts).mass[1] > 0.25);
  assert.deepEqual(
    posterior([
      { ...ts[0], transfer: true },
      { ...ts[1], valid: false },
    ]),
    p,
  );
  const many = posterior(
    Array.from({ length: 300 }, (_, i) =>
      record(i % 2 ? "interruptions" : "quiet", i % 2 ? 0 : 3),
    ),
  );
  assert.ok(many.mass.every(Number.isFinite));
  assert.ok(Math.abs(many.mass.reduce((a, b) => a + b) - 1) < 1e-10);
});
test("balanced strong performance weakens the interruption explanation", () => {
  const a = posterior([record("quiet", 3), record("interruptions", 0)]).mass[1];
  const b = posterior(
    Array.from({ length: 12 }, (_, i) =>
      record(i % 2 ? "interruptions" : "quiet", 3),
    ),
  ).mass[1];
  assert.ok(b < a);
});
test("scheduler information is finite and coverage limits repetition", () => {
  const p = posterior();
  for (const c of ["interruptions", "delay", "cues"])
    assert.ok(pairInformation(p.weights, c) > 0);
  const ts = Array.from({ length: 3 }, () => record("interruptions", 1));
  assert.notEqual(recommend(ts).condition, "interruptions");
});
test("import recomputes routes and scores instead of trusting forged derived fields", () => {
  const t = makeTrial(42, "quiet", { pairId: 1 });
  const answers = t.placements.map((p) => ({ room: p.room, elapsedMs: 1200 }));
  const trial = {
    ...t,
    answers,
    correct: 0,
    valid: true,
    completedAt: new Date().toISOString(),
  };
  assert.equal(scoreAnswers(t, answers), 3);
  const imported = importSession(sessionExport([trial]));
  assert.equal(imported[0].correct, 3);
  assert.equal(imported[0].source, "imported");
  assert.throws(() =>
    importSession({ ...sessionExport([]), modelVersion: "wrong" }),
  );
  assert.throws(() =>
    importSession(
      sessionExport([{ ...trial, answers: [{ room: 99, elapsedMs: 0 }] }]),
    ),
  );
  assert.equal(summarize(imported)[0].accuracy, 1);
});
