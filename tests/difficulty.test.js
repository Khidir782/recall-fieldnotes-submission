import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIFFICULTIES,
  difficultySettings,
  itemCount,
  progression,
  distractionNumber,
  validateDistraction,
} from "../src/difficulty.js";
import {
  makeTrial,
  makePair,
  scoreAnswers,
  importSession,
  sessionExport,
  posterior,
  summarize,
} from "../src/experiment.js";
import {
  initialLearner,
  fitLearner,
  predictTrial,
  updateLearner,
  evaluateLearner,
  recommendPersonal,
  brierError,
} from "../src/personalModel.js";
import {
  FEATURE_NAMES,
  performanceFeatures,
  trainingExport,
  prepareTrainingDataset,
} from "../src/taskPerformance.js";

function complete(t, correct = itemCount(t)) {
  return {
    ...t,
    valid: true,
    source: "live",
    correct,
    completedAt: new Date(
      Date.UTC(2026, 10, 19, 0, t.pairId, t.order),
    ).toISOString(),
    answers: t.placements.map((p, i) => ({
      room: i < correct ? p.room : (p.room + 1) % 6,
      elapsedMs: 900,
    })),
    distractionAnswers: [],
  };
}
function autoPair(history, pairId, correct) {
  const next = progression(history);
  return makePair(100 + pairId, "delay", pairId, {
    difficultyLevel: next.nextLevel,
    selection: "adaptive",
    reference: next.reference,
  }).map((t) => complete(t, correct ?? itemCount(t)));
}

test("all difficulty levels generate reproducible unique routes and correctly score every item", () => {
  for (const d of DIFFICULTIES) {
    for (const condition of ["quiet", "delay", "interruptions", "cues"]) {
      const pair = makePair(
        12345,
        condition === "quiet" ? "cues" : condition,
        1,
        { difficultyLevel: d.level },
      );
      for (const t of pair) {
        assert.deepEqual(
          makeTrial(t.seed, t.condition, {
            pairId: 1,
            order: t.order,
            difficultyLevel: d.level,
          }),
          t,
        );
        assert.equal(t.placements.length, d.objectCount);
        assert.equal(
          new Set(t.placements.map((p) => p.room)).size,
          d.objectCount,
        );
        assert.equal(
          new Set(t.placements.map((p) => p.object)).size,
          d.objectCount,
        );
        assert.equal(scoreAnswers(t, complete(t).answers), d.objectCount);
        assert.throws(
          () => scoreAnswers(t, complete(t).answers.slice(1)),
          /Invalid/,
        );
      }
      assert.equal(
        pair[0].settings.studySeconds,
        pair[1].settings.studySeconds,
      );
    }
    assert.equal(
      difficultySettings(d.level, "delay").retentionSeconds,
      d.delaySeconds + 6,
    );
  }
});

test("progression requires complete automatic pairs, raises and lowers load, and inserts reference pairs", () => {
  let history = [];
  const first = autoPair(history, 1);
  assert.equal(progression([first[0]]).completed, 0);
  assert.equal(
    progression([first[0], { ...first[1], valid: false }]).completed,
    0,
  );
  assert.equal(
    progression(first.map((t) => ({ ...t, selection: "manual" }))).completed,
    0,
  );
  history.push(...first, ...autoPair(first, 2));
  assert.equal(progression(history).nextLevel, 2);
  history.push(...autoPair(history, 3));
  assert.equal(progression(history).nextLevel, 1);
  assert.equal(progression(history).reference, true);
  history.push(...autoPair(history, 4, 0));
  assert.equal(progression(history).nextLevel, 2); // reference result never demotes
  history.push(...autoPair(history, 5));
  assert.equal(progression(history).nextLevel, 3);
  history.push(...autoPair(history, 6, 0));
  assert.equal(progression(history).nextLevel, 2);
  assert.deepEqual(
    progression(importSession(sessionExport(history))),
    progression(history),
  );
});

test("legacy three-object files restore; progressive imports recompute settings, scores and distractions", () => {
  const legacy = complete(makeTrial(7, "quiet"));
  for (const key of [
    "protocolVersion",
    "difficultyLevel",
    "settings",
    "selection",
    "reference",
    "distractionAnswers",
  ])
    delete legacy[key];
  assert.equal(importSession(sessionExport([legacy]))[0].difficultyLevel, 1);
  const advanced = complete(makeTrial(8, "delay", { difficultyLevel: 4 }));
  const answer = distractionNumber(advanced.seed, 0) % 2 === 0 ? "even" : "odd";
  advanced.distractionAnswers = [
    { index: 0, answer, elapsedMs: 300, correct: false },
  ];
  const restored = importSession(
    sessionExport([
      { ...advanced, correct: 99, settings: { retentionSeconds: 0 } },
    ]),
  )[0];
  assert.equal(restored.correct, 5);
  assert.equal(restored.settings.retentionSeconds, 18);
  assert.equal(restored.distractionAnswers[0].correct, true);
  assert.equal(restored.prediction.objectCount, 5);
  assert.throws(() =>
    importSession(sessionExport([{ ...advanced, protocolVersion: "unknown" }])),
  );
  assert.throws(() =>
    importSession(sessionExport([{ ...advanced, difficultyLevel: null }])),
  );
  assert.throws(() =>
    importSession(
      sessionExport([{ ...advanced, answers: advanced.answers.slice(0, 3) }]),
    ),
  );
});

test("retention task rejects duplicate, out-of-window and inappropriate answers", () => {
  const advanced = makeTrial(8, "quiet", { difficultyLevel: 4 });
  const a = { index: 0, answer: "even", elapsedMs: 500 };
  assert.throws(() => validateDistraction(advanced, [a, a]));
  assert.throws(() => validateDistraction(advanced, [{ ...a, index: 4 }]));
  assert.throws(() =>
    validateDistraction(advanced, [{ ...a, elapsedMs: 3001 }]),
  );
  assert.throws(() => validateDistraction(makeTrial(8, "quiet"), [a]));
  assert.equal(validateDistraction(advanced, []).length, 0); // misses remain explicit
});

test("hard trials train their own Bayesian learner, never alter baseline hypotheses, and score live forecasts", () => {
  const baseline = complete(makeTrial(12, "quiet"));
  const t = complete(makeTrial(13, "quiet", { difficultyLevel: 3 }), 4);
  const forecast = {
    ...predictTrial(initialLearner(3), "quiet"),
    provenance: "live",
    issuedAt: "2026-11-18T00:00:00Z",
  };
  t.prediction = forecast;
  assert.equal(fitLearner([baseline, t], 1).trainingTrials, 1);
  const hard = fitLearner([baseline, t], 3);
  assert.equal(hard.conditions.quiet.alpha, 6);
  assert.equal(hard.conditions.quiet.beta, 3);
  assert.equal(updateLearner(initialLearner(1), t).trainingTrials, 0);
  assert.deepEqual(posterior([baseline, t]), posterior([baseline]));
  assert.equal(summarize([baseline, t], 3)[0].total, 5);
  assert.equal(evaluateLearner([baseline, t], 3).liveTrials, 1);
  assert.equal(evaluateLearner([baseline, t], 3).brier, brierError(0.5, 4, 5));
  for (const d of DIFFICULTIES) {
    const p = predictTrial(initialLearner(d.level), "quiet");
    assert.equal(p.expectedCorrect, d.objectCount / 2);
    assert.equal(p.countProbabilities.length, d.objectCount + 1);
    assert.ok(
      Math.abs(p.countProbabilities.reduce((a, b) => a + b, 0) - 1) < 1e-12,
    );
    assert.ok(recommendPersonal([], d.level).uncertaintyReduction > 0);
  }
});

test("training captures prescribed load and normalized outcomes without current-answer leakage", () => {
  const a = complete(
    makeTrial(10, "quiet", { difficultyLevel: 2, pairId: 1 }),
    2,
  );
  const b = complete(
    makeTrial(11, "delay", { difficultyLevel: 4, pairId: 2 }),
    4,
  );
  const build = (trials) =>
    prepareTrainingDataset([
      trainingExport(trials, "person-one", "session-one", true),
    ]);
  const data = build([a, b]);
  assert.equal(data.target, "recall_at_least_two_thirds");
  assert.equal(data.records[0].target, 0); // 2/4 is below two thirds
  assert.equal(data.records[1].target, 1); // 4/5 exceeds two thirds
  const features = Object.fromEntries(
    FEATURE_NAMES.map((key, i) => [key, data.records[1].features[i]]),
  );
  assert.equal(features.object_count, 5);
  assert.equal(features.retention_seconds, 18);
  assert.equal(features.retention_distraction, 1);
  assert.equal(features.prior_accuracy, 0.5);
  assert.equal(features.last_accuracy, 0.5);
  const changed = complete({ ...b }, 0);
  changed.answers.forEach((answer) => {
    answer.elapsedMs = 50000;
  });
  assert.deepEqual(
    build([a, changed]).records[1].features,
    data.records[1].features,
  );
  assert.equal(build([a, changed]).records[1].target, 0);
  assert.equal(
    performanceFeatures([], "quiet", 1).length,
    FEATURE_NAMES.length,
  );
});
