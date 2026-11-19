export const networks = [
  "Default mode",
  "Frontoparietal",
  "Salience",
  "Dorsal attention",
  "Limbic",
];
export const weights = [0.3, 0.25, 0.2, 0.15, 0.1];
export const presets = [
  {
    id: "SYN-001",
    label: "Balanced pattern",
    age: 64,
    values: [28, 35, 38, 30, 42],
  },
  {
    id: "SYN-002",
    label: "Mixed pattern",
    age: 68,
    values: [68, 58, 44, 62, 40],
  },
  {
    id: "SYN-003",
    label: "Elevated pattern",
    age: 72,
    values: [82, 74, 68, 60, 65],
  },
];
export function assess(values) {
  if (
    values.length !== 5 ||
    values.some((v) => !Number.isFinite(v) || v < 0 || v > 100)
  )
    throw Error("Five network values from 0 to 100 required.");
  const contributions = values.map((v, i) => ({
    network: networks[i],
    value: Number(((v - 50) * weights[i]).toFixed(6)),
  }));
  const score = Number(
    (50 + contributions.reduce((a, c) => a + c.value, 0)).toFixed(2),
  );
  return {
    score,
    contributions,
    baseline: 50,
    band:
      score < 40
        ? "Lower synthetic vulnerability"
        : score < 65
          ? "Intermediate synthetic pattern"
          : "Elevated synthetic vulnerability",
  };
}
export function simulate(values, adherence, minutes) {
  if (
    !Number.isFinite(adherence) ||
    adherence < 0 ||
    adherence > 100 ||
    !Number.isFinite(minutes) ||
    minutes < 5 ||
    minutes > 30
  )
    throw Error("Invalid dose");
  const score = assess(values).score,
    dose = ((adherence / 100) * minutes) / 20;
  const points = Array.from({ length: 13 }, (_, m) => ({
    month: m,
    baseline: +Math.min(100, score + (6 * m) / 12).toFixed(2),
    practice: +Math.max(
      0,
      Math.min(100, score + (6 * m) / 12 - (12 * dose * m) / 12),
    ).toFixed(2),
  }));
  return {
    points,
    difference: +(points[12].baseline - points[12].practice).toFixed(2),
  };
}
