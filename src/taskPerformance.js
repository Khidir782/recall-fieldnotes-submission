import { importSession, sessionExport } from "./experiment.js";

export const FEATURE_VERSION = "neuroarc-task-features-v1";
export const ARTIFACT_VERSION = "neuroarc-task-logreg-v1";
export const TRAINING_SCHEMA = "neuroarc-task-training-v1";
export const FEATURE_NAMES = [
  "quiet",
  "interruptions",
  "delay",
  "cues",
  "log_prior_trials",
  "prior_accuracy",
  "condition_accuracy",
  "last_accuracy",
  "recent_accuracy",
  "log_condition_trials",
  "prior_response_seconds",
];
const CONDITIONS = ["quiet", "interruptions", "delay", "cues"];
const eligible = (t) =>
  t.valid === true && !t.transfer && CONDITIONS.includes(t.condition);
const meanAccuracy = (ts) =>
  ts.length ? ts.reduce((sum, t) => sum + t.correct / 3, 0) / ts.length : 0.5;
export function performanceFeatures(history, condition) {
  if (!CONDITIONS.includes(condition)) throw Error("Unknown task condition.");
  const prior = history.filter(eligible),
    same = prior.filter((t) => t.condition === condition);
  const timings = prior
    .slice(-5)
    .flatMap((t) => t.answers.map((a) => Math.min(60, a.elapsedMs / 1000)))
    .sort((a, b) => a - b);
  const median = timings.length ? timings[Math.floor(timings.length / 2)] : 0;
  return [
    ...CONDITIONS.map((c) => (c === condition ? 1 : 0)),
    Math.log1p(prior.length),
    meanAccuracy(prior),
    meanAccuracy(same),
    prior.length ? prior.at(-1).correct / 3 : 0.5,
    meanAccuracy(prior.slice(-5)),
    Math.log1p(same.length),
    median,
  ];
}
function token(value, min, max) {
  return (
    typeof value === "string" &&
    value.length >= min &&
    value.length <= max &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)
  );
}
export function trainingExport(trials, participantKey, sessionKey, consented) {
  if (!token(participantKey, 3, 40))
    throw Error(
      "Use a 3–40 character anonymous participant key: letters, numbers, hyphens or underscores. Do not enter a name or email.",
    );
  if (!token(sessionKey, 3, 80)) throw Error("Invalid anonymous session key.");
  if (consented !== true)
    throw Error(
      "Confirm permission to use these task responses for model training.",
    );
  if (!trials.some(eligible))
    throw Error("Complete a valid task trial before exporting training data.");
  return {
    schema: TRAINING_SCHEMA,
    dataKind: "observed",
    participantKey,
    sessionKey,
    consent: { granted: true, version: "task-training-permission-v1" },
    session: sessionExport(trials),
  };
}
export function prepareTrainingDataset(exports) {
  if (!Array.isArray(exports) || !exports.length || exports.length > 200)
    throw Error("Provide 1–200 training exports.");
  const records = [],
    seen = new Map(),
    sources = { live: 0, imported: 0 };
  let duplicates = 0,
    excluded = 0;
  const kinds = new Set();
  for (const data of exports) {
    if (
      data?.schema !== TRAINING_SCHEMA ||
      !token(data.participantKey, 3, 40) ||
      !token(data.sessionKey, 3, 80) ||
      data.consent?.granted !== true ||
      data.consent?.version !== "task-training-permission-v1" ||
      !["observed", "synthetic_smoke_test"].includes(data.dataKind)
    )
      throw Error(
        "Invalid training export, provenance or recorded permission.",
      );
    kinds.add(data.dataKind);
    const trials = importSession(data.session),
      history = [];
    let previous = -Infinity;
    for (let i = 0; i < trials.length; i++) {
      const trial = trials[i],
        time = Date.parse(trial.completedAt);
      if (time < previous)
        throw Error(
          "Training history must be in chronological order within each export.",
        );
      previous = time;
      if (!eligible(trial)) {
        excluded++;
        continue;
      }
      const key = `${trial.seed}|${trial.condition}|${trial.completedAt}`;
      const original = data.session.trials[i];
      const signature = JSON.stringify({
        answers: trial.answers,
        valid: trial.valid,
        transfer: trial.transfer,
      });
      const existing = seen.get(key);
      if (
        existing &&
        (existing.participant !== data.participantKey ||
          existing.signature !== signature)
      )
        throw Error(
          "The same trial is assigned to different participants or has conflicting answers.",
        );
      const features = performanceFeatures(history, trial.condition);
      if (existing) duplicates++;
      else {
        seen.set(key, { participant: data.participantKey, signature });
        const source = original.source === "live" ? "live" : "imported";
        sources[source]++;
        records.push({
          participant: data.participantKey,
          session: data.sessionKey,
          condition: trial.condition,
          features,
          target: trial.correct >= 2 ? 1 : 0,
          trialKey: key,
          source,
        });
      }
      history.push(trial);
    }
  }
  if (kinds.size !== 1)
    throw Error("Do not mix observed and synthetic exports.");
  if (records.length > 100000)
    throw Error("Limit a training run to 100,000 task trials.");
  return {
    featureVersion: FEATURE_VERSION,
    featureNames: FEATURE_NAMES,
    target: "recall_at_least_2_of_3",
    dataKind: [...kinds][0],
    records,
    audit: {
      duplicates,
      excluded,
      sources,
      history:
        "Within-export prior valid trials only; no current-trial answers or timings are features.",
    },
  };
}
export function validateTaskModel(raw) {
  if (
    raw?.schema !== ARTIFACT_VERSION ||
    raw.featureVersion !== FEATURE_VERSION ||
    raw.algorithm !== "standardized_logistic_regression" ||
    raw.target !== "recall_at_least_2_of_3"
  )
    throw Error("Unsupported supervised model or feature schema.");
  if (raw.dataKind !== "observed")
    throw Error("Synthetic smoke-test models cannot be activated in this app.");
  if (
    !Array.isArray(raw.featureNames) ||
    raw.featureNames.join("|") !== FEATURE_NAMES.join("|")
  )
    throw Error("Model feature order does not match this app.");
  const vector = (x, positive = false) =>
    Array.isArray(x) &&
    x.length === FEATURE_NAMES.length &&
    x.every(
      (v) =>
        Number.isFinite(v) && Math.abs(v) <= 1e6 && (!positive || v > 1e-9),
    );
  if (
    !vector(raw.coefficients) ||
    !vector(raw.mean) ||
    !vector(raw.scale, true) ||
    !vector(raw.minimum) ||
    !vector(raw.maximum) ||
    raw.minimum.some((v, i) => v > raw.maximum[i]) ||
    !Number.isFinite(raw.intercept) ||
    Math.abs(raw.intercept) > 1e6
  )
    throw Error("Invalid model weights or preprocessing parameters.");
  if (
    typeof raw.modelId !== "string" ||
    !/^task-[a-f0-9]{12}$/.test(raw.modelId) ||
    !Number.isFinite(Date.parse(raw.trainedAt)) ||
    !Array.isArray(raw.conditions) ||
    !raw.conditions.length ||
    raw.conditions.some((c) => !CONDITIONS.includes(c))
  )
    throw Error("Invalid model identity or training coverage.");
  const e = raw.evaluation;
  if (
    e?.split !== "participant_holdout" ||
    !Number.isInteger(e.trainParticipants) ||
    e.trainParticipants < 3 ||
    !Number.isInteger(e.testParticipants) ||
    e.testParticipants < 2 ||
    !Number.isInteger(e.testTrials) ||
    e.testTrials < 10 ||
    ![
      e.modelBrier,
      e.baselineBrier,
      e.modelLogLoss,
      e.baselineLogLoss,
      e.auc,
    ].every(Number.isFinite) ||
    e.modelBrier < 0 ||
    e.modelBrier > 1 ||
    e.baselineBrier < 0 ||
    e.baselineBrier > 1 ||
    e.modelLogLoss < 0 ||
    e.baselineLogLoss < 0 ||
    e.auc < 0 ||
    e.auc > 1
  )
    throw Error("A participant-held-out evaluation report is required.");
  // Copy only supported JSON fields. No executable serialized model is loaded.
  return {
    schema: raw.schema,
    featureVersion: raw.featureVersion,
    algorithm: raw.algorithm,
    target: raw.target,
    dataKind: raw.dataKind,
    featureNames: [...raw.featureNames],
    modelId: raw.modelId,
    trainedAt: raw.trainedAt,
    conditions: [...raw.conditions],
    coefficients: [...raw.coefficients],
    mean: [...raw.mean],
    scale: [...raw.scale],
    minimum: [...raw.minimum],
    maximum: [...raw.maximum],
    intercept: raw.intercept,
    evaluation: {
      split: e.split,
      trainParticipants: e.trainParticipants,
      testParticipants: e.testParticipants,
      testTrials: e.testTrials,
      modelBrier: e.modelBrier,
      baselineBrier: e.baselineBrier,
      modelLogLoss: e.modelLogLoss,
      baselineLogLoss: e.baselineLogLoss,
      auc: e.auc,
      status: "pilot_only",
      ...(Number.isInteger(e.trainTrials) && e.trainTrials >= 0
        ? { trainTrials: e.trainTrials }
        : {}),
    },
  };
}
export function inferTaskModel(model, history, condition) {
  if (!model.conditions.includes(condition)) return null;
  const features = performanceFeatures(history, condition);
  const contributions = features.map(
    (x, i) => ((x - model.mean[i]) / model.scale[i]) * model.coefficients[i],
  );
  const logit = model.intercept + contributions.reduce((a, b) => a + b, 0);
  const probability =
    logit >= 0
      ? 1 / (1 + Math.exp(-logit))
      : Math.exp(logit) / (1 + Math.exp(logit));
  return {
    modelId: model.modelId,
    target: model.target,
    probability,
    historyTrials: history.filter(eligible).length,
    outsideTrainingRange: features.some(
      (x, i) => x < model.minimum[i] - 1e-9 || x > model.maximum[i] + 1e-9,
    ),
    features,
    contributions,
  };
}
