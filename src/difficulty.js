// Versioned task settings, shared by play, import validation and training.
export const PROTOCOL_VERSION = "recall-progressive-v1";
export const DIFFICULTIES = [
  {
    level: 1,
    name: "Foundation",
    objectCount: 3,
    studySeconds: 8,
    delaySeconds: 3,
    distraction: false,
  },
  {
    level: 2,
    name: "Association",
    objectCount: 4,
    studySeconds: 8,
    delaySeconds: 6,
    distraction: false,
  },
  {
    level: 3,
    name: "Extended recall",
    objectCount: 5,
    studySeconds: 8,
    delaySeconds: 9,
    distraction: false,
  },
  {
    level: 4,
    name: "Divided attention",
    objectCount: 5,
    studySeconds: 8,
    delaySeconds: 12,
    distraction: true,
  },
];
export const difficultyLevel = (trial) => trial?.difficultyLevel ?? 1;
export function difficultySettings(level = 1, condition = "quiet") {
  const setting = DIFFICULTIES.find((d) => d.level === level);
  if (!setting) throw Error("Unknown difficulty level.");
  return {
    ...setting,
    retentionSeconds: setting.delaySeconds + (condition === "delay" ? 6 : 0),
  };
}
export const itemCount = (trial) =>
  difficultySettings(difficultyLevel(trial)).objectCount;
export const taskSuccess = (trial) => trial.correct * 3 >= itemCount(trial) * 2;

// Use only complete, valid, automatic non-reference pairs. Aborted pairs and
// manually chosen challenges never cause progression. Recompute after restore.
export function progression(trials) {
  const groups = new Map();
  for (const t of trials) {
    if (t.transfer || !t.pairId || t.selection !== "adaptive") continue;
    const key = t.pairId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  let level = 1,
    streak = 0,
    completed = 0;
  for (const pair of groups.values()) {
    if (
      pair.length !== 2 ||
      pair.some((t) => !t.valid) ||
      new Set(pair.map((t) => t.order)).size !== 2 ||
      new Set(pair.map((t) => t.condition)).size !== 2 ||
      !pair.some((t) => t.condition === "quiet")
    )
      continue;
    const reference = completed % 4 === 3;
    const expectedLevel = reference ? 1 : level;
    if (
      pair.some(
        (t) =>
          difficultyLevel(t) !== expectedLevel ||
          Boolean(t.reference) !== reference,
      )
    )
      continue;
    completed++;
    if (reference) continue;
    const accuracy =
      pair.reduce((s, t) => s + t.correct, 0) /
      pair.reduce((s, t) => s + itemCount(t), 0);
    if (accuracy >= 0.8) {
      streak++;
      if (streak >= 2) {
        level = Math.min(4, level + 1);
        streak = 0;
      }
    } else {
      streak = 0;
      if (accuracy <= 0.4) level = Math.max(1, level - 1);
    }
  }
  const reference = completed % 4 === 3;
  return {
    level,
    nextLevel: reference ? 1 : level,
    reference,
    completed,
    streak,
  };
}

// A new, seeded number appears every three seconds during level-four retention.
export function distractionNumber(seed, index) {
  let n = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return 10 + (((n ^ (n >>> 15)) >>> 0) % 89);
}
export function validateDistraction(trial, raw = []) {
  const settings = difficultySettings(difficultyLevel(trial), trial.condition);
  const count = Math.ceil(settings.retentionSeconds / 3);
  if (!Array.isArray(raw) || raw.length > (settings.distraction ? count : 0))
    throw Error("Invalid distraction responses.");
  const seen = new Set();
  return raw.map((a) => {
    if (
      !Number.isInteger(a.index) ||
      a.index < 0 ||
      a.index >= count ||
      seen.has(a.index) ||
      !["even", "odd"].includes(a.answer) ||
      !Number.isFinite(a.elapsedMs) ||
      a.elapsedMs < 0 ||
      a.elapsedMs > 3000
    )
      throw Error("Invalid distraction responses.");
    seen.add(a.index);
    return {
      index: a.index,
      answer: a.answer,
      elapsedMs: a.elapsedMs,
      correct:
        (distractionNumber(trial.seed, a.index) % 2 === 0 ? "even" : "odd") ===
        a.answer,
    };
  });
}
