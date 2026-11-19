// Generates pipeline-test data only. Never a human-performance validation set.
import fs from "node:fs";
import path from "node:path";
import { makeTrial, random } from "../src/experiment.js";
import { trainingExport } from "../src/taskPerformance.js";
const destination = process.argv[2];
if (!destination)
  throw Error("Usage: node ml/smoke-fixture.mjs <temporary-directory>");
fs.mkdirSync(destination, { recursive: true });
const conditions = ["quiet", "interruptions", "delay", "cues"];
for (let person = 0; person < 8; person++) {
  const rng = random(4100 + person),
    trials = [];
  for (let index = 0; index < 16; index++) {
    const condition = conditions[index % 4],
      seed = 500000 + person * 16 + index;
    const trial = makeTrial(seed, condition, {
      pairId: Math.floor(index / 2) + 1,
      order: index % 2,
      difficultyLevel: 1 + Math.floor(index / 4),
    });
    const p = { quiet: 0.85, interruptions: 0.25, delay: 0.45, cues: 0.75 }[
      condition
    ];
    const answers = trial.placements.map((placement) => ({
      room: rng() < p ? placement.room : (placement.room + 1) % 6,
      elapsedMs: 800 + Math.round(rng() * 2000),
    }));
    const correct = answers.reduce(
      (sum, answer, i) =>
        sum + (answer.room === trial.placements[i].room ? 1 : 0),
      0,
    );
    trials.push({
      ...trial,
      answers,
      correct,
      valid: true,
      source: "live",
      completedAt: new Date(
        Date.UTC(2026, 10, 16 + person, 0, index),
      ).toISOString(),
    });
  }
  const file = trainingExport(
    trials,
    `smoke-person-${person}`,
    `smoke-session-${person}`,
    true,
  );
  file.dataKind = "synthetic_smoke_test";
  fs.writeFileSync(
    path.join(destination, `smoke-${person}.json`),
    JSON.stringify(file),
  );
}
console.log(
  `Created eight explicitly synthetic smoke-test exports in ${destination}`,
);
