import { reconstructPredictions, learnerMetadata } from "./personalModel.js";

// Versioned, explicit experimental assumptions. Not a model of brain disease.
export const MODEL_VERSION = "task-hypotheses-v1";
export const ROOMS = [
  "Kitchen",
  "Study",
  "Bedroom",
  "Living room",
  "Entry",
  "Balcony",
];
export const OBJECTS = ["Key", "Book", "Mug", "Plant", "Camera", "Compass"];
export const CONDITIONS = {
  quiet: {
    name: "Quiet recall",
    short: "Quiet",
    delay: 3,
    interruptions: false,
    cues: false,
  },
  interruptions: {
    name: "With interruptions",
    short: "Interruptions",
    delay: 3,
    interruptions: true,
    cues: false,
  },
  delay: {
    name: "Longer delay",
    short: "Long delay",
    delay: 9,
    interruptions: false,
    cues: false,
  },
  cues: {
    name: "With location cues",
    short: "Cued",
    delay: 3,
    interruptions: false,
    cues: true,
  },
};
export const HYPOTHESES = [
  {
    id: "stable",
    name: "Similar across conditions",
    description:
      "The tested conditions have no systematic effect in this model.",
    effect: "No condition effect",
  },
  {
    id: "interruptions",
    name: "Interruptions matter",
    description:
      "Recall is less accurate when irrelevant visual notifications appear.",
    effect: "−20 percentage points with interruptions",
  },
  {
    id: "delay",
    name: "Delay matters",
    description: "Recall is less accurate after a longer retention interval.",
    effect: "−20 percentage points with longer delay",
  },
  {
    id: "cues",
    name: "Cues help",
    description:
      "Recall is more accurate when location candidates are narrowed.",
    effect: "+15 percentage points with cues",
  },
];
const BASELINES = [0.45, 0.65, 0.85];
const states = HYPOTHESES.flatMap((h, hi) =>
  BASELINES.map((p) => ({ h: hi, p })),
);
export function random(seed) {
  let n = seed >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(values, rng) {
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function makeTrial(
  seed,
  condition,
  { transfer = false, pairId = 0, order = 0 } = {},
) {
  if (!Object.hasOwn(CONDITIONS, condition) || !Number.isInteger(seed))
    throw Error("Invalid trial configuration");
  const rng = random(seed);
  const objects = shuffle(OBJECTS, rng).slice(0, 3),
    rooms = shuffle([0, 1, 2, 3, 4, 5], rng).slice(0, 3);
  return {
    seed,
    condition,
    transfer,
    pairId,
    order,
    layout: transfer ? "courtyard" : "apartment",
    placements: objects.map((object, i) => ({
      object,
      room: rooms[i],
      candidates: shuffle(
        [
          rooms[i],
          ...shuffle(
            [0, 1, 2, 3, 4, 5].filter((n) => n !== rooms[i]),
            rng,
          ).slice(0, 2),
        ],
        rng,
      ),
    })),
  };
}
export function successProbability(state, condition) {
  const penalty =
    HYPOTHESES[state.h].id === condition
      ? condition === "cues"
        ? 0.15
        : -0.2
      : 0;
  return Math.max(0.05, Math.min(0.95, state.p + penalty));
}
function binomial(k, n, p) {
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - i + 1)) / i;
  return c * p ** k * (1 - p) ** (n - k);
}
export function hypothesisMass(weights) {
  return HYPOTHESES.map((_, i) =>
    weights.reduce((s, w, j) => s + (states[j].h === i ? w : 0), 0),
  );
}
export function entropy(mass) {
  return -mass.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0);
}
export function posterior(trials = []) {
  let weights = states.map(() => 1 / states.length);
  for (const t of trials) {
    if (!t.valid || t.transfer) continue;
    const next = weights.map(
      (w, i) =>
        w * binomial(t.correct, 3, successProbability(states[i], t.condition)),
    );
    const z = next.reduce((a, b) => a + b, 0);
    weights = next.map((w) => w / z);
  }
  const mass = hypothesisMass(weights);
  return { weights, mass, entropy: entropy(mass) };
}
export function pairInformation(weights, contrast) {
  let expected = 0;
  for (let a = 0; a <= 3; a++)
    for (let b = 0; b <= 3; b++) {
      const joint = weights.map(
        (w, i) =>
          w *
          binomial(a, 3, successProbability(states[i], "quiet")) *
          binomial(b, 3, successProbability(states[i], contrast)),
      );
      const p = joint.reduce((s, w) => s + w, 0);
      if (p > 0)
        expected += p * entropy(hypothesisMass(joint.map((w) => w / p)));
    }
  return Math.max(0, entropy(hypothesisMass(weights)) - expected);
}
export function recommend(trials) {
  const p = posterior(trials);
  const candidates = ["interruptions", "delay", "cues"].map((condition) => {
    const count = trials.filter(
      (t) => t.valid && !t.transfer && t.condition === condition,
    ).length;
    return {
      condition,
      count,
      information: pairInformation(p.weights, condition),
    };
  });
  const min = Math.min(...candidates.map((c) => c.count));
  const eligible = candidates.filter((c) => c.count <= min + 1);
  eligible.sort((a, b) => b.information - a.information || a.count - b.count);
  return {
    ...eligible[0],
    candidates,
    reason: trials.some((t) => t.valid && !t.transfer)
      ? "Highest expected information among contrasts within one trial of the least-tested condition."
      : "Start with an informative matched comparison; all four hypotheses have equal prior weight.",
  };
}
export function makePair(seed, contrast, pairId) {
  const order = shuffle(["quiet", contrast], random(seed ^ 0xa531));
  return order.map((condition, i) =>
    makeTrial((seed + i * 7919) >>> 0, condition, { pairId, order: i }),
  );
}
export function summarize(trials) {
  const valid = trials.filter((t) => t.valid && !t.transfer);
  return Object.entries(CONDITIONS).map(([id, c]) => {
    const ts = valid.filter((t) => t.condition === id);
    const correct = ts.reduce((s, t) => s + t.correct, 0),
      n = ts.length * 3;
    let low = 0,
      high = 1;
    if (n) {
      const z = 1.96,
        ph = correct / n,
        d = 1 + (z * z) / n,
        center = (ph + (z * z) / (2 * n)) / d,
        margin =
          (z * Math.sqrt((ph * (1 - ph)) / n + (z * z) / (4 * n * n))) / d;
      low = Math.max(0, center - margin);
      high = Math.min(1, center + margin);
    }
    return {
      id,
      name: c.name,
      trials: ts.length,
      correct,
      total: n,
      accuracy: n ? correct / n : null,
      low,
      high,
    };
  });
}
export function scoreAnswers(trial, answers) {
  if (
    answers.length !== 3 ||
    answers.some(
      (a) =>
        !Number.isInteger(a.room) ||
        a.room < 0 ||
        a.room > 5 ||
        !Number.isFinite(a.elapsedMs) ||
        a.elapsedMs < 0,
    )
  )
    throw Error("Invalid answers");
  return answers.reduce(
    (s, a, i) => s + (a.room === trial.placements[i].room ? 1 : 0),
    0,
  );
}
export function importSession(raw) {
  if (
    !raw ||
    raw.modelVersion !== MODEL_VERSION ||
    !Array.isArray(raw.trials) ||
    raw.trials.length > 500
  )
    throw Error(
      "Expected a Recall Fieldnotes v1 session with at most 500 trials.",
    );
  const imported = raw.trials.map((t) => {
    if (
      !Number.isInteger(t.seed) ||
      t.seed < 0 ||
      t.seed > 4294967295 ||
      !Object.hasOwn(CONDITIONS, t.condition) ||
      typeof t.transfer !== "boolean" ||
      typeof t.valid !== "boolean" ||
      !Number.isSafeInteger(t.pairId) ||
      t.pairId < 0 ||
      t.pairId > 1000000 ||
      !Number.isInteger(t.order) ||
      t.order < 0 ||
      t.order > 1 ||
      typeof t.completedAt !== "string" ||
      !Number.isFinite(Date.parse(t.completedAt))
    )
      throw Error("Invalid trial metadata.");
    const canonical = makeTrial(t.seed, t.condition, {
      transfer: t.transfer,
      pairId: t.pairId,
      order: t.order,
    });
    if (!Array.isArray(t.answers) || t.answers.length !== 3)
      throw Error("Invalid trial answers.");
    const correct = scoreAnswers(canonical, t.answers);
    return {
      ...canonical,
      answers: t.answers.map((a) => ({ room: a.room, elapsedMs: a.elapsedMs })),
      correct,
      valid: t.valid,
      completedAt: t.completedAt,
      source: "imported",
      invalidReason: t.valid ? null : "Imported excluded trial",
    };
  });
  return reconstructPredictions(imported);
}
export function sessionExport(trials) {
  return {
    modelVersion: MODEL_VERSION,
    personalLearner: learnerMetadata(),
    exportedAt: new Date().toISOString(),
    source: "browser task observations; imported records marked individually",
    trials,
    assumptions: {
      baselineGrid: BASELINES,
      prior: "Uniform over 4 hypotheses × 3 baseline levels",
      likelihood:
        "Binomial with 3 conditionally independent item responses per trial; within-session dependencies and practice effects are not modeled",
      effects: HYPOTHESES.map((h) => ({ id: h.id, effect: h.effect })),
      scheduler:
        "Personal learner: expected reduction in recall-rate posterior variance, coverage-constrained, randomized within-pair order",
      transfer: "Excluded from posterior updates and scheduling",
    },
    limitations: [
      "Exploratory task model; no clinical or brain-network inference",
      "Fixed illustrative likelihoods, not learned or calibrated",
      "Adaptive sampling, route differences, device latency and practice can affect results",
      "Matched tasks are distinct routes, not perfectly equal difficulty",
      "Posterior weights describe assumed models, not medical confidence",
    ],
  };
}
