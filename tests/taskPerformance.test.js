import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTrial, sessionExport } from "../src/experiment.js";
import {
  performanceFeatures,
  trainingExport,
  prepareTrainingDataset,
  validateTaskModel,
  inferTaskModel,
  FEATURE_NAMES,
  FEATURE_VERSION,
  ARTIFACT_VERSION,
} from "../src/taskPerformance.js";
function trial(seed, condition, correct) {
  const t = makeTrial(seed, condition);
  return {
    ...t,
    valid: true,
    transfer: false,
    correct,
    source: "live",
    completedAt: new Date(Date.UTC(2026, 10, 16, 0, seed)).toISOString(),
    answers: t.placements.map((p, i) => ({
      room: i < correct ? p.room : (p.room + 1) % 6,
      elapsedMs: 1000,
    })),
  };
}
function artifact() {
  return {
    schema: ARTIFACT_VERSION,
    featureVersion: FEATURE_VERSION,
    featureNames: FEATURE_NAMES,
    algorithm: "standardized_logistic_regression",
    target: "recall_at_least_2_of_3",
    dataKind: "observed",
    modelId: "task-123456abcdef",
    trainedAt: "2026-11-16T00:00:00Z",
    conditions: ["quiet", "interruptions", "delay", "cues"],
    coefficients: FEATURE_NAMES.map(() => 0),
    mean: FEATURE_NAMES.map(() => 0),
    scale: FEATURE_NAMES.map(() => 1),
    minimum: FEATURE_NAMES.map(() => 0),
    maximum: FEATURE_NAMES.map(() => 1000),
    intercept: 0,
    evaluation: {
      split: "participant_holdout",
      trainParticipants: 3,
      testParticipants: 2,
      testTrials: 20,
      modelBrier: 0.2,
      baselineBrier: 0.25,
      modelLogLoss: 0.6,
      baselineLogLoss: 0.7,
      auc: 0.7,
    },
  };
}
test("features use prior trials only and exclude invalid/probe observations", () => {
  const a = trial(1, "quiet", 3),
    b = trial(2, "delay", 0);
  assert.equal(performanceFeatures([], "quiet").length, FEATURE_NAMES.length);
  assert.equal(performanceFeatures([a], "quiet")[5], 1);
  assert.deepEqual(
    performanceFeatures(
      [a, { ...b, valid: false }, { ...b, transfer: true }],
      "quiet",
    ),
    performanceFeatures([a], "quiet"),
  );
  const data = trainingExport([a, b], "person-001", "session-001", true);
  const prepared = prepareTrainingDataset([data]);
  const changed = {
    ...data,
    session: sessionExport([
      a,
      {
        ...b,
        answers: b.placements.map((p) => ({ room: p.room, elapsedMs: 50000 })),
      },
    ]),
  };
  assert.deepEqual(
    prepareTrainingDataset([changed]).records[1].features,
    prepared.records[1].features,
  );
  assert.equal(prepared.records[1].target, 0);
  assert.equal(prepareTrainingDataset([changed]).records[1].target, 1);
});
test("training exports require permission, pseudonymous keys and chronological records", () => {
  assert.throws(() =>
    trainingExport(
      [trial(1, "quiet", 3)],
      "a@example.com",
      "session-001",
      true,
    ),
  );
  assert.throws(() =>
    trainingExport([trial(1, "quiet", 3)], "person-001", "session-001", false),
  );
  const data = trainingExport(
    [trial(2, "quiet", 2), trial(1, "delay", 0)],
    "person-001",
    "session-001",
    true,
  );
  assert.throws(() => prepareTrainingDataset([data]), /chronological/);
});
test("duplicate incremental exports are deduplicated; relabeling a trial across people is rejected", () => {
  const data = trainingExport(
    [trial(1, "quiet", 3)],
    "person-001",
    "session-001",
    true,
  );
  assert.equal(prepareTrainingDataset([data, data]).records.length, 1);
  assert.equal(prepareTrainingDataset([data, data]).audit.duplicates, 1);
  assert.throws(
    () =>
      prepareTrainingDataset([data, { ...data, participantKey: "person-002" }]),
    /different participants/,
  );
});
test("only supported observed-data artifacts can activate", () => {
  assert.equal(validateTaskModel(artifact()).modelId, "task-123456abcdef");
  const withPrivateMetadata = artifact();
  withPrivateMetadata.evaluation.participantEmails = ["private@example.test"];
  assert.equal(
    "participantEmails" in validateTaskModel(withPrivateMetadata).evaluation,
    false,
  );
  assert.throws(
    () =>
      validateTaskModel({ ...artifact(), dataKind: "synthetic_smoke_test" }),
    /Synthetic/,
  );
  assert.throws(() =>
    validateTaskModel({ ...artifact(), scale: FEATURE_NAMES.map(() => 0) }),
  );
  assert.throws(() =>
    validateTaskModel({
      ...artifact(),
      featureNames: [...FEATURE_NAMES].reverse(),
    }),
  );
  assert.throws(() =>
    validateTaskModel({
      ...artifact(),
      evaluation: { ...artifact().evaluation, split: "random_trials" },
    }),
  );
});
test("portable logistic inference applies training scaling and remains finite at extreme logits", () => {
  const m = validateTaskModel(artifact());
  assert.equal(inferTaskModel(m, [], "quiet").probability, 0.5);
  m.coefficients[0] = 2;
  m.mean[0] = 0.5;
  m.scale[0] = 0.5;
  m.intercept = -1;
  assert.ok(
    Math.abs(
      inferTaskModel(m, [], "quiet").probability - 1 / (1 + Math.exp(-1)),
    ) < 1e-12,
  );
  m.intercept = -10000;
  assert.equal(inferTaskModel(m, [], "quiet").probability, 0);
  assert.equal(
    inferTaskModel({ ...m, conditions: ["quiet"] }, [], "cues"),
    null,
  );
});
