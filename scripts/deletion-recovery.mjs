// Produce a reviewable SQL file; this command never modifies a database.
import fs from "node:fs";
import { uuid } from "../server/security.js";
const file = process.argv[2];
if (!file)
  throw Error("Pass the private JSON deletion-log export from Wrangler.");
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const rows = Array.isArray(data)
  ? data.flatMap((x) => (Array.isArray(x.results) ? x.results : [x]))
  : data.results;
if (!Array.isArray(rows)) throw Error("Invalid deletion-log export.");
console.log(
  "-- Reapply after a controlled backup restore, before allowing any traffic.",
);
console.log("PRAGMA foreign_keys = ON;");
for (const row of rows) {
  if (!uuid(row.target_id) || !["user", "session"].includes(row.kind))
    throw Error("Invalid deletion tombstone.");
  console.log(
    `DELETE FROM ${row.kind === "user" ? "users" : "task_sessions"} WHERE id='${row.target_id}';`,
  );
}
