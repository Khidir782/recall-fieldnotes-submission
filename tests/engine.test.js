import { test } from "node:test";
import assert from "node:assert/strict";
import { assess, simulate, presets } from "../src/engine.js";
import { execFileSync } from "node:child_process";
test("score bounds, reference, and attribution conservation", () => {
  for (const values of [
    [0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50],
    [100, 100, 100, 100, 100],
    ...presets.map((p) => p.values),
  ]) {
    const r = assess(values);
    assert.ok(r.score >= 0 && r.score <= 100);
    assert.ok(
      Math.abs(
        r.baseline + r.contributions.reduce((s, c) => s + c.value, 0) - r.score,
      ) < 0.005,
    );
  }
  assert.equal(assess([0, 0, 0, 0, 0]).score, 0);
  assert.equal(assess([100, 100, 100, 100, 100]).score, 100);
  assert.throws(() => assess([NaN, 0, 0, 0, 0]));
  assert.throws(() => assess([101, 0, 0, 0, 0]));
});
test("zero adherence has no offset; positive dose stays bounded", () => {
  const zero = simulate(presets[1].values, 0, 15);
  assert.equal(zero.difference, 0);
  assert.deepEqual(
    zero.points.map((p) => p.baseline),
    zero.points.map((p) => p.practice),
  );
  for (const values of presets.map((p) => p.values)) {
    const s = simulate(values, 100, 30);
    assert.equal(s.points.length, 13);
    assert.equal(s.points[0].practice, assess(values).score);
    assert.ok(s.points.every((p) => p.practice >= 0 && p.practice <= 100));
    assert.ok(s.difference > 0);
  }
});
test("Python and browser engines agree across profiles and doses", () => {
  const input = presets.flatMap((p) =>
    [0, 50, 100].map((adherence) => ({
      values: p.values,
      adherence,
      minutes: 20,
    })),
  );
  const py = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        'import json,sys; from backend.engine import assess,simulate; print(json.dumps([{ "assessment":assess(x["values"]), "simulation":simulate(**x)} for x in json.loads(sys.argv[1])]))',
        JSON.stringify(input),
      ],
      { encoding: "utf8" },
    ),
  );
  input.forEach((x, i) => {
    assert.equal(assess(x.values).score, py[i].assessment.score);
    assert.deepEqual(
      simulate(x.values, x.adherence, x.minutes).points,
      py[i].simulation.points,
    );
    assert.equal(
      simulate(x.values, x.adherence, x.minutes).difference,
      py[i].simulation.difference,
    );
  });
});
