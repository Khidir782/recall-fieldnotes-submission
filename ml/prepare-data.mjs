import fs from "node:fs";
import { prepareTrainingDataset } from "../src/taskPerformance.js";
try {
  const paths = process.argv.slice(2);
  const files = paths.flatMap((path) => {
    if (fs.statSync(path).size > 5_000_000)
      throw Error("Each input export must be under 5 MB.");
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    if (data.schema === "recall-training-bundle-v1") {
      if (!Array.isArray(data.exports)) throw Error("Invalid research bundle.");
      return data.exports;
    }
    return [data];
  });
  process.stdout.write(JSON.stringify(prepareTrainingDataset(files)));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
