import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadDatabaseEnv, psqlEnv, sql, literal } from "./database.mjs";

const args = process.argv.slice(2);
if (!(
  args.length === 0 ||
  (args.length === 1 && args[0] === "--check") ||
  (args.length === 2 &&
    args[0] === "--baseline" &&
    /^(0?15|0?16|0?17)$/.test(args[1]))
)) {
  throw Error(
    "Usage: npm run migrate [-- --check | -- --baseline 015/016/017].",
  );
}
loadDatabaseEnv();
const connection =
  process.env.MIGRATION_DATABASE_URL || process.env.pg_connection_url;
if (!connection)
  throw Error("Set MIGRATION_DATABASE_URL or pg_connection_url (.env).");
const env = psqlEnv(connection);
env.PGOPTIONS = "-c lock_timeout=5s -c statement_timeout=60s";
const files = readdirSync("supabase/migrations")
  .filter((n) => /^\d+_.+\.sql$/.test(n))
  .sort();
const migrations = files.map((name) => {
  const source = readFileSync("supabase/migrations/" + name, "utf8");
  return {
    name,
    version: Number(name.split("_")[0]),
    source,
    checksum: createHash("sha256").update(source).digest("hex"),
  };
});
const table = "public.household_schema_migrations";
const exists = sql(env, `select to_regclass('${table}') is not null;`) === "t";
if (process.argv.includes("--check")) {
  if (!exists)
    throw Error(
      "Migration history missing. Explicitly baseline a verified existing installation first.",
    );
} else {
  sql(
    env,
    `begin; create table if not exists ${table} (version integer primary key,name text not null,checksum text not null,applied_at timestamptz not null default now()); alter table ${table} enable row level security; revoke all on ${table} from public,anon,authenticated; commit;`,
  );
}
const baselineIndex = process.argv.indexOf("--baseline");
if (baselineIndex >= 0) {
  const version = Number(process.argv[baselineIndex + 1]);
  if (![15, 16, 17].includes(version))
    throw Error(
      "Baseline supports verified legacy installations at 015, 016 or 017 only.",
    );
  if (sql(env, `select count(*) from ${table};`) !== "0")
    throw Error("Cannot baseline nonempty migration history.");
  const required = [
    "public.shared_home(text,text,jsonb)",
    "public.shared_expenses(text,text,jsonb)",
    "public.shared_push(text,text,jsonb)",
    "public.shared_agreements(text,text,jsonb)",
    ...(version >= 16 ? ["public.shared_handbook(text,text,jsonb)"] : []),
  ];
  const tables = [
    "public.shared_home_config",
    "public.deleted_entry_batches",
    "public.house_activity",
    "public.agreements",
    "public.agreement_events",
    "public.gym_logs",
    ...(version >= 16
      ? ["public.house_handbook_entries", "public.house_handbook_files"]
      : []),
  ];
  const conditions = [
    ...required.map((n) => `to_regprocedure(${literal(n)}) is not null`),
    ...tables.map((n) => `to_regclass(${literal(n)}) is not null`),
    `exists(select 1 from information_schema.columns where table_schema='public' and table_name='entries' and column_name='time_of_day')`,
    ...(version >= 17
      ? [
          `exists(select 1 from information_schema.columns where table_schema='public' and table_name='entries' and column_name='end_time')`,
        ]
      : []),
  ];
  if (sql(env, `select ${conditions.join(" and ")};`) !== "t")
    throw Error(
      "Baseline prerequisites missing; do not record migrations that have not been applied.",
    );
  sql(
    env,
    `begin; select pg_advisory_xact_lock(185019); ${migrations
      .filter((m) => m.version <= version)
      .map(
        (m) =>
          `insert into ${table}(version,name,checksum) values(${m.version},${literal(m.name)},${literal(m.checksum)});`,
      )
      .join("\n")} commit;`,
  );
  console.log(`Recorded explicitly verified legacy baseline ${version}.`);
}
const rows = sql(
  env,
  `select version||':'||checksum from ${table} order by version;`,
)
  .split("\n")
  .filter(Boolean);
const installed = new Map(
  rows.map((row) => {
    const [v, c] = row.split(":");
    return [Number(v), c];
  }),
);
for (const m of migrations) {
  if (installed.has(m.version)) {
    if (installed.get(m.version) !== m.checksum)
      throw Error(
        `Checksum changed for applied migration ${m.name}. Add a new migration instead.`,
      );
    continue;
  }
  if (process.argv.includes("--check"))
    throw Error(`Pending migration: ${m.name}`);
  if (
    m.version === 1 &&
    sql(env, "select to_regclass('public.households') is not null;") === "t"
  )
    throw Error(
      "Existing schema without history. Verify its installed version and use --baseline; never replay old migrations.",
    );
  const body = m.source
    .replace(/^begin;\s*$/gim, "")
    .replace(/^commit;\s*$/gim, "");
  const hash = createHash("sha256")
    .update(process.env.HOUSEHOLD_DATA_TOKEN || "")
    .digest("hex");
  if (m.version === 2 && !process.env.HOUSEHOLD_DATA_TOKEN)
    throw Error("Set server-only HOUSEHOLD_DATA_TOKEN before migration 002.");
  sql(
    env,
    `\\set gateway_hash ${hash}\nbegin; select pg_advisory_xact_lock(185019);\nselect not exists(select 1 from ${table} where version=${m.version}) as pending \\gset\n\\if :pending\n${body}\ninsert into ${table}(version,name,checksum) values(${m.version},${literal(m.name)},${literal(m.checksum)});\n\\endif\ncommit;`,
  );
  console.log(`Applied ${m.name}.`);
}
console.log("Schema is current; checksums verified.");
