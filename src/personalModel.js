// Recall Fieldnotes's online task-performance model. No disease or connectome inference.
export const LEARNER_VERSION = "neuroarc-personal-beta-v1";
export const CONDITION_KEYS = ["quiet", "interruptions", "delay", "cues"];
const PRIOR = { alpha: 2, beta: 2, trials: 0 };

export function initialLearner() {
  return {
    version: LEARNER_VERSION,
    conditions: Object.fromEntries(
      CONDITION_KEYS.map((key) => [key, { ...PRIOR }]),
    ),
    pooled: { ...PRIOR },
    trainingTrials: 0,
    fingerprint: 2166136261,
  };
}
function eligible(trial) {
  return (
    trial.valid === true &&
    !trial.transfer &&
    CONDITION_KEYS.includes(trial.condition) &&
    Number.isInteger(trial.correct) &&
    trial.correct >= 0 &&
    trial.correct <= 3
  );
}
function fingerprint(previous, trial) {
  // Reproducibility check, not a cryptographic signature or authenticity proof.
  let hash = previous;
  for (const char of `${trial.seed}|${trial.condition}|${trial.correct};`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return hash;
}
export function updateLearner(state, trial) {
  if (!eligible(trial)) return state;
  function update(parameters) {
    return {
      alpha: parameters.alpha + trial.correct,
      beta: parameters.beta + 3 - trial.correct,
      trials: parameters.trials + 1,
    };
  }
  return {
    ...state,
    conditions: {
      ...state.conditions,
      [trial.condition]: update(state.conditions[trial.condition]),
    },
    pooled: update(state.pooled),
    trainingTrials: state.trainingTrials + 1,
    fingerprint: fingerprint(state.fingerprint, trial),
  };
}
export function fitLearner(trials = []) {
  return trials.reduce(updateLearner, initialLearner());
}
export function betaMean({ alpha, beta }) {
  return alpha / (alpha + beta);
}
export function betaVariance({ alpha, beta }) {
  const sum = alpha + beta;
  return (alpha * beta) / (sum * sum * (sum + 1));
}
export function betaInterval({ alpha, beta }) {
  // Numerically integrate a stabilized beta density on a 2,000-bin grid.
  // All supported parameters are >=2. Resolution is 0.0005 in probability.
  const bins = 2000,
    logs = [];
  let peak = -Infinity;
  for (let i = 1; i < bins; i++) {
    const x = i / bins;
    const log = (alpha - 1) * Math.log(x) + (beta - 1) * Math.log1p(-x);
    logs.push(log);
    peak = Math.max(peak, log);
  }
  const density = [0, ...logs.map((log) => Math.exp(log - peak)), 0];
  const cumulative = [0];
  for (let i = 1; i <= bins; i++)
    cumulative.push(cumulative[i - 1] + (density[i - 1] + density[i]) / 2);
  const total = cumulative[bins];
  function quantile(q) {
    const target = total * q;
    let i = 1;
    while (i < bins && cumulative[i] < target) i++;
    const span = cumulative[i] - cumulative[i - 1];
    return (i - 1 + (span ? (target - cumulative[i - 1]) / span : 0)) / bins;
  }
  return { low: quantile(0.025), high: quantile(0.975) };
}
export function countProbabilities({ alpha, beta }) {
  const denominator = (alpha + beta) * (alpha + beta + 1) * (alpha + beta + 2);
  return [0, 1, 2, 3].map((k) => {
    let numerator = [1, 3, 3, 1][k];
    for (let i = 0; i < k; i++) numerator *= alpha + i;
    for (let i = 0; i < 3 - k; i++) numerator *= beta + i;
    return numerator / denominator;
  });
}
export function predictTrial(state, condition) {
  if (!CONDITION_KEYS.includes(condition))
    throw Error("Unknown task condition.");
  const parameters = state.conditions[condition];
  return {
    version: LEARNER_VERSION,
    condition,
    probability: betaMean(parameters),
    expectedCorrect: 3 * betaMean(parameters),
    interval: betaInterval(parameters),
    countProbabilities: countProbabilities(parameters),
    baselineProbability: betaMean(state.pooled),
    trainingTrials: state.trainingTrials,
    conditionTrials: parameters.trials,
    historyFingerprint: state.fingerprint,
  };
}
function varianceGain(parameters) {
  const outcomes = countProbabilities(parameters);
  const expectedAfter = outcomes.reduce(
    (sum, p, k) =>
      sum +
      p *
        betaVariance({
          alpha: parameters.alpha + k,
          beta: parameters.beta + 3 - k,
        }),
    0,
  );
  return Math.max(0, betaVariance(parameters) - expectedAfter);
}
export function recommendPersonal(trials) {
  const state = fitLearner(trials);
  const candidates = ["interruptions", "delay", "cues"].map((condition) => ({
    condition,
    count: state.conditions[condition].trials,
    uncertaintyReduction:
      varianceGain(state.conditions.quiet) +
      varianceGain(state.conditions[condition]),
    prediction: predictTrial(state, condition),
  }));
  const least = Math.min(...candidates.map((c) => c.count));
  const allowed = candidates.filter((c) => c.count <= least + 1);
  allowed.sort(
    (a, b) =>
      b.uncertaintyReduction - a.uncertaintyReduction || a.count - b.count,
  );
  return {
    ...allowed[0],
    candidates,
    reason: state.trainingTrials
      ? "This eligible comparison is expected to reduce uncertainty in learned recall rates the most. Coverage keeps conditions within one trial of the least-tested contrast."
      : "Start with a matched comparison. Each condition begins with the same broad prior; no interruption penalty or cue benefit is imposed on the personal learner.",
  };
}
export function reconstructPredictions(trials) {
  let state = initialLearner();
  return trials.map((trial) => {
    const prediction = trial.transfer
      ? null
      : {
          ...predictTrial(state, trial.condition),
          provenance: "reconstructed",
          issuedAt: null,
        };
    state = updateLearner(state, trial);
    return { ...trial, prediction };
  });
}
export function brierError(probability, correct) {
  return (
    (correct * (1 - probability) ** 2 + (3 - correct) * probability ** 2) / 3
  );
}
export function logLoss(probability, correct) {
  const p = Math.max(1e-12, Math.min(1 - 1e-12, probability));
  return -(correct * Math.log(p) + (3 - correct) * Math.log1p(-p)) / 3;
}
export function evaluateLearner(trials) {
  let state = initialLearner();
  const rows = [];
  for (let i = 0; i < trials.length; i++) {
    const trial = trials[i];
    if (!eligible(trial)) continue;
    const expected = predictTrial(state, trial.condition),
      stored = trial.prediction;
    const consistent =
      stored?.version === LEARNER_VERSION &&
      stored.condition === trial.condition &&
      stored.historyFingerprint === state.fingerprint &&
      stored.trainingTrials === state.trainingTrials &&
      Number.isFinite(stored.probability) &&
      Math.abs(stored.probability - expected.probability) < 1e-12 &&
      Number.isFinite(stored.baselineProbability) &&
      Math.abs(stored.baselineProbability - expected.baselineProbability) <
        1e-12;
    const issued = Date.parse(stored?.issuedAt),
      completed = Date.parse(trial.completedAt);
    const live =
      trial.source === "live" &&
      stored?.provenance === "live" &&
      consistent &&
      Number.isFinite(issued) &&
      Number.isFinite(completed) &&
      issued <= completed;
    const prediction = live ? stored : expected;
    rows.push({
      trialIndex: i,
      condition: trial.condition,
      correct: trial.correct,
      probability: prediction.probability,
      expectedCorrect: prediction.expectedCorrect,
      baselineProbability: prediction.baselineProbability,
      trainingTrials: prediction.trainingTrials,
      provenance: live ? "live" : "reconstructed",
      brier: brierError(prediction.probability, trial.correct),
      baselineBrier: brierError(prediction.baselineProbability, trial.correct),
      logLoss: logLoss(prediction.probability, trial.correct),
      baselineLogLoss: logLoss(prediction.baselineProbability, trial.correct),
    });
    state = updateLearner(state, trial);
  }
  const live = rows.filter((row) => row.provenance === "live");
  const mean = (key) =>
    live.length
      ? live.reduce((sum, row) => sum + row[key], 0) / live.length
      : null;
  return {
    rows,
    liveTrials: live.length,
    reconstructedTrials: rows.length - live.length,
    brier: mean("brier"),
    baselineBrier: mean("baselineBrier"),
    logLoss: mean("logLoss"),
    baselineLogLoss: mean("baselineLogLoss"),
  };
}
export function learnerMetadata() {
  return {
    version: LEARNER_VERSION,
    method:
      "Independent beta-binomial recall-rate learner by condition; Beta(2,2) priors, item-count updates",
    baseline: "Pooled Beta(2,2) learner ignoring condition",
    evaluation:
      "Predict before each trial, score completed valid live predictions, then update. Imported history is reconstructed and reported separately.",
    scheduler:
      "Expected posterior variance reduction in quiet and contrast recall rates, coverage constrained",
    limitations: [
      "Items within a trial may be dependent; model intervals can be too narrow.",
      "No fatigue, practice, device, response-time or participant-level covariates are fitted.",
      "Adaptive task selection changes the evaluated distribution. Evaluation is sequential, not an independent cohort test.",
      "More trials do not guarantee better predictions. No clinical or brain-network inference.",
    ],
  };
}
