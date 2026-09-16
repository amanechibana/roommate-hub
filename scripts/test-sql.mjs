import { readFileSync, readdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { psqlEnv, sql } from "./database.mjs";

const connection = process.env.SQL_TEST_DATABASE_URL;
if (!connection)
  throw Error(
    "Set SQL_TEST_DATABASE_URL to a disposable LOCAL PostgreSQL server (admin database postgres).",
  );
const env = psqlEnv(connection);
if (
  !["127.0.0.1", "localhost", "::1"].includes(env.PGHOST) ||
  env.PGDATABASE !== "postgres"
)
  throw Error(
    "SQL regression harness refuses remote or non-admin databases. Never use production credentials.",
  );
const database = "roommate_hub_test_" + randomUUID().replaceAll("-", "");
sql(env, `create database ${database};`);
const testEnv = { ...env, PGDATABASE: database };
sql(testEnv, readFileSync("supabase/tests/bootstrap-local.sql", "utf8"));
sql(
  testEnv,
  `create schema storage; create table storage.buckets (id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);`,
);
const suites = {
  1: ["isolation"],
  4: ["device-identity"],
  5: ["chores-bills-undo"],
  6: ["expenses"],
  7: ["covered-bills-note-conversion"],
  8: ["push-subscriptions"],
  12: ["house-activity"],
  13: ["pinned-notes"],
  14: ["personal-todos"],
  15: ["agreements"],
  16: ["house-handbook"],
  17: ["timed-house-status"],
  20: ["daily-life-gaps"],
  21: ["daily-life-gaps", "household-reliability"],
  22: ["household-life"],
};
let runnerDatabase;
try {
  for (const file of readdirSync("supabase/migrations")
    .filter((n) => /^\d+_.+\.sql$/.test(n))
    .sort()) {
    const version = Number(file.split("_")[0]);
    const hash = createHash("sha256").update("test-gateway").digest("hex");
    sql(
      testEnv,
      `\\set gateway_hash ${hash}\n` +
        readFileSync("supabase/migrations/" + file, "utf8"),
    );
    for (const suite of suites[version] || []) {
      sql(testEnv, readFileSync("supabase/tests/" + suite + ".sql", "utf8"));
      console.log(`Passed SQL: ${suite}`);
    }
    if (version === 16) {
      // Clone only our own disposable fixture, never the supplied admin DB.
      runnerDatabase =
        "roommate_hub_runner_" + randomUUID().replaceAll("-", "");
      sql(env, `create database ${runnerDatabase} template ${database};`);
      const runnerUrl = new URL(connection);
      runnerUrl.pathname = "/" + runnerDatabase;
      const runnerEnv = {
        ...process.env,
        MIGRATION_DATABASE_URL: runnerUrl.href,
        HOUSEHOLD_DATA_TOKEN: "test-gateway",
        MIGRATION_POOLER_HOST: "",
      };
      const run = (args, expectedSuccess = true) => {
        const result = spawnSync(
          process.execPath,
          ["scripts/migrate.mjs", ...args],
          { env: runnerEnv, encoding: "utf8", timeout: 120000 },
        );
        if ((result.status === 0) !== expectedSuccess)
          throw Error(
            "Migration runner regression failed: " +
              (result.stderr || "unexpected success"),
          );
      };
      run(["--check"], false);
      run(["--check", "--baseline", "016"], false);
      if (
        sql(
          { ...env, PGDATABASE: runnerDatabase },
          "select to_regclass('public.household_schema_migrations') is null;",
        ) !== "t"
      )
        throw Error("Read-only/invalid migration arguments wrote history");
      run(["--baseline", "016"]);
      run(["--check"]);
      run([]);
      if (
        sql(
          { ...env, PGDATABASE: runnerDatabase },
          "select max(version) from public.household_schema_migrations;",
        ) !==
        String(
          Math.max(
            ...readdirSync("supabase/migrations")
              .filter((n) => /^\d+_.+\.sql$/.test(n))
              .map((n) => Number(n.split("_")[0])),
          ),
        )
      )
        throw Error("Upgrade missed a migration");
      sql(env, `drop database ${runnerDatabase};`);
      runnerDatabase = undefined;
      console.log(
        "Passed SQL: migration runner baseline, ordered upgrade, checksum check, and rerun",
      );
    }
  }
  sql(env, `drop database ${database};`);
  console.log(
    "All SQL regression suites passed; disposable test database removed.",
  );
} catch (error) {
  console.error(`Disposable database retained for diagnosis: ${database}`);
  if (runnerDatabase)
    console.error(`Disposable runner database retained: ${runnerDatabase}`);
  throw error;
}
