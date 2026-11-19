import fs from "node:fs";
import { validateTaskModel } from "../src/taskPerformance.js";
const [source, flag] = process.argv.slice(2);
if (!source || flag !== "--reviewed")
  throw Error(
    "Review the private evaluation report first. Then run: node scripts/release-model.mjs /path/to/task-model.json --reviewed",
  );
const model = validateTaskModel(JSON.parse(fs.readFileSync(source, "utf8")));
if (
  model.evaluation.modelBrier >= model.evaluation.baselineBrier ||
  model.evaluation.modelLogLoss >= model.evaluation.baselineLogLoss
)
  throw Error(
    "This release gate requires lower held-out Brier error and log loss than the baseline. Passing this gate is not evidence of generalization.",
  );
fs.mkdirSync("public/models", { recursive: true });
fs.writeFileSync(
  "public/models/current.json",
  JSON.stringify(model, null, 2) + "\n",
);
console.log(
  `Prepared ${model.modelId} for review and deployment. No raw data or private evaluation report was copied.`,
);
