import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialLearner,
  updateLearner,
  fitLearner,
  predictTrial,
  betaInterval,
  countProbabilities,
  recommendPersonal,
  evaluateLearner,
  reconstructPredictions,
  LEARNER_VERSION,
  brierError,
  logLoss,
} from "../src/personalModel.js";
const record = (condition, correct, seed = 1) => ({
  seed,
  condition,
  correct,
  valid: true,
  transfer: false,
  source: "live",
  completedAt: "2026-11-16T01:00:00Z",
});
function issue(state, trial) {
  return {
    ...trial,
    prediction: {
      ...predictTrial(state, trial.condition),
      provenance: "live",
      issuedAt: "2026-11-16T00:59:00Z",
    },
  };
}
test("fresh learner is broad and has normalized count predictions", () => {
  const p = predictTrial(initialLearner(), "quiet");
  assert.equal(p.probability, 0.5);
  assert.equal(p.expectedCorrect, 1.5);
  assert.ok(Math.abs(p.countProbabilities.reduce((a, b) => a + b) - 1) < 1e-12);
  assert.ok(Math.abs(p.interval.low - 0.0942993) < 0.001);
  assert.ok(Math.abs(p.interval.high - 0.9057007) < 0.001);
});
test("updates learn condition rates, preserve other conditions and do not mutate priors", () => {
  const before = initialLearner(),
    after = updateLearner(before, record("quiet", 3));
  assert.equal(after.conditions.quiet.alpha, 5);
  assert.equal(after.conditions.quiet.beta, 2);
  assert.equal(after.conditions.interruptions.alpha, 2);
  assert.equal(before.conditions.quiet.alpha, 2);
  assert.equal(predictTrial(after, "quiet").probability, 5 / 7);
  assert.equal(predictTrial(after, "interruptions").probability, 0.5);
  assert.equal(after.trainingTrials, 1);
});
test("excluded trials and probes never train or enter evaluation", () => {
  const state = initialLearner();
  for (const t of [
    { ...record("quiet", 3), valid: false },
    { ...record("quiet", 3), transfer: true },
  ]) {
    assert.strictEqual(updateLearner(state, t), state);
    assert.equal(evaluateLearner([issue(state, t)]).liveTrials, 0);
  }
});
test("predictions are evaluated against past state, never the answer being scored", () => {
  const a = issue(initialLearner(), record("quiet", 3));
  const b = issue(fitLearner([a]), record("quiet", 0, 2));
  const scored = evaluateLearner([a, b]);
  assert.equal(scored.liveTrials, 2);
  assert.equal(scored.rows[0].probability, 0.5);
  assert.equal(scored.rows[1].probability, 5 / 7);
  assert.equal(a.prediction.probability, 0.5);
  assert.equal(scored.rows[1].brier, (5 / 7) ** 2);
  const modified = { ...b, correct: 3 };
  assert.equal(evaluateLearner([a, modified]).rows[1].probability, 5 / 7);
});
test("tampered or post-outcome predictions cannot count as live forecasts", () => {
  const a = issue(initialLearner(), record("quiet", 3));
  for (const p of [
    { ...a.prediction, probability: 1 },
    { ...a.prediction, historyFingerprint: 0 },
    { ...a.prediction, issuedAt: "2026-11-17T00:00:00Z" },
    { ...a.prediction, version: "wrong" },
  ])
    assert.equal(evaluateLearner([{ ...a, prediction: p }]).liveTrials, 0);
});
test("replay ignores supplied forecasts and preserves honest imported provenance", () => {
  const original = [record("quiet", 3), record("quiet", 0, 2)];
  const replay = reconstructPredictions(
    original.map((t) => ({
      ...t,
      source: "imported",
      prediction: { probability: 1 },
    })),
  );
  assert.equal(replay[0].prediction.probability, 0.5);
  assert.equal(replay[1].prediction.probability, 5 / 7);
  assert.equal(replay[0].prediction.provenance, "reconstructed");
  assert.equal(evaluateLearner(replay).liveTrials, 0);
  assert.equal(evaluateLearner(replay).reconstructedTrials, 2);
  assert.deepEqual(fitLearner(replay), fitLearner(original));
});
test("learner can beat or lose to the pooled baseline", () => {
  function sequence(conditions) {
    let state = initialLearner();
    return conditions.map(([c, k], i) => {
      const t = issue(state, record(c, k, i));
      state = updateLearner(state, t);
      return t;
    });
  }
  const differentiated = sequence(
    Array.from({ length: 40 }, (_, i) => [
      i % 2 ? "interruptions" : "quiet",
      i % 2 ? 0 : 3,
    ]),
  );
  const result = evaluateLearner(differentiated);
  assert.ok(result.brier < result.baselineBrier);
  const same = sequence(
    Array.from({ length: 8 }, (_, i) => [i % 2 ? "interruptions" : "quiet", 3]),
  );
  const identical = evaluateLearner(same);
  assert.ok(identical.brier > identical.baselineBrier);
});
test("intervals and count distribution remain finite for long histories", () => {
  for (const [alpha, beta] of [
    [1502, 2],
    [2, 1502],
    [752, 752],
  ]) {
    const interval = betaInterval({ alpha, beta });
    assert.ok(
      interval.low >= 0 && interval.high <= 1 && interval.low < interval.high,
    );
    assert.ok(
      Math.abs(
        countProbabilities({ alpha, beta }).reduce((a, b) => a + b) - 1,
      ) < 1e-10,
    );
  }
  assert.equal(brierError(0.5, 3), 0.25);
  assert.ok(Number.isFinite(logLoss(0, 3)));
});
test("scheduler is coverage constrained and learns rather than using fixed penalties", () => {
  const p = predictTrial(
    fitLearner([record("interruptions", 3)]),
    "interruptions",
  );
  assert.ok(p.probability > 0.5);
  const ts = Array.from({ length: 3 }, (_, i) => record("interruptions", 2, i));
  const next = recommendPersonal(ts);
  assert.notEqual(next.condition, "interruptions");
  assert.ok(next.uncertaintyReduction > 0);
  assert.equal(LEARNER_VERSION, "neuroarc-personal-beta-v2");
});

test("export/import restores learned state without accepting manufactured live metrics", async () => {
  const { makeTrial, sessionExport, importSession } =
    await import("../src/experiment.js");
  const canonical = makeTrial(241, "quiet", { pairId: 1 });
  const complete = {
    ...canonical,
    answers: canonical.placements.map((p) => ({
      room: p.room,
      elapsedMs: 900,
    })),
    correct: 3,
    valid: true,
    source: "live",
    completedAt: "2026-11-16T01:00:00Z",
  };
  const trial = issue(initialLearner(), complete);
  const exported = sessionExport([trial]);
  assert.equal(exported.personalLearner.version, LEARNER_VERSION);
  const imported = importSession({
    ...exported,
    trials: [
      {
        ...trial,
        correct: 0,
        prediction: { ...trial.prediction, probability: 1 },
      },
    ],
  });
  assert.equal(imported[0].correct, 3);
  assert.equal(imported[0].prediction.probability, 0.5);
  assert.equal(evaluateLearner(imported).liveTrials, 0);
  assert.deepEqual(fitLearner(imported), fitLearner([trial]));
  const next = issue(fitLearner(imported), record("quiet", 2, 242));
  assert.equal(evaluateLearner([...imported, next]).liveTrials, 1);
  assert.equal(next.prediction.probability, 5 / 7);
});
