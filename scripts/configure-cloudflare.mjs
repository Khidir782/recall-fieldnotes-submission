import fs from "node:fs";
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((v, i, a) => (v.startsWith("--") ? [v.slice(2), a[i + 1]] : null))
    .filter(Boolean),
);
if (
  !["production", "staging"].includes(args.environment) ||
  !/^[0-9a-f-]{36}$/i.test(args["database-id"] || "") ||
  !args["pages-name"]
)
  throw Error(
    "Use --environment production|staging --database-id <returned D1 UUID> --pages-name <actual Pages project name> --origin <your HTTPS origin>.",
  );
const origin = args.origin;
if (
  !origin ||
  new URL(origin).origin !== origin ||
  !origin.startsWith("https://")
)
  throw Error("Use an exact HTTPS origin, without a trailing slash.");
const database = {
  binding: "DB",
  database_name: `recall-submission-${args.environment}`,
  database_id: args["database-id"],
  migrations_dir: "migrations",
};
const config = {
  name: args["pages-name"],
  pages_build_output_dir: "dist",
  compatibility_date: "2026-11-16",
  vars: { APP_ORIGIN: origin },
  d1_databases: [database],
};
fs.writeFileSync(
  `cloudflare.${args.environment}.json`,
  JSON.stringify(config, null, 2) + "\n",
);
fs.writeFileSync(
  `cloudflare.retention.${args.environment}.json`,
  JSON.stringify(
    {
      name: `recall-retention-${args.environment}`,
      main: "workers/retention.js",
      compatibility_date: "2026-11-16",
      workers_dev: false,
      triggers: { crons: ["17 3 * * *"] },
      d1_databases: [database],
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Created configuration for ${args.environment}. OAuth callback: ${origin}/api/auth/callback. No credentials were written.`,
);
