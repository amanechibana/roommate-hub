import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

export function loadDatabaseEnv() {
  for (const path of [".env", ".env.local"])
    if (existsSync(path)) process.loadEnvFile(path);
}
export function psqlEnv(connection) {
  const url = new URL(connection);
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGCONNECT_TIMEOUT: "10",
    PGGSSENCMODE: "disable",
    PGSSLMODE:
      url.searchParams.get("sslmode") ||
      (["localhost", "127.0.0.1", "::1"].includes(url.hostname)
        ? "disable"
        : "require"),
  };
  if (
    process.env.MIGRATION_POOLER_HOST &&
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  ) {
    const ref = url.hostname.match(/^db\.([a-z]+)\.supabase\.co$/)?.[1];
    if (
      !ref ||
      !/^aws-\d+-[a-z]+-[a-z]+-\d+\.pooler\.supabase\.com$/.test(
        process.env.MIGRATION_POOLER_HOST,
      )
    )
      throw Error("Invalid Supabase pooler configuration");
    env.PGHOST = process.env.MIGRATION_POOLER_HOST;
    env.PGUSER += "." + ref;
    env.PGPORT = "5432";
  }
  return env;
}
export function sql(env, input) {
  const result = spawnSync(
    "psql",
    ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"],
    {
      env,
      input,
      encoding: "utf8",
      timeout: 65000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    let message =
      result.stderr || result.error?.code || "Database command failed";
    for (const secret of [
      env.PGPASSWORD,
      process.env.HOUSEHOLD_DATA_TOKEN,
      process.env.HOUSEHOLD_ACCESS_CODE,
      process.env.HOUSEHOLD_SESSION_SECRET,
    ]) {
      if (secret) message = message.replaceAll(secret, "[redacted]");
    }
    throw Error(message);
  }
  return result.stdout.trim();
}
export const literal = (value) =>
  "'" + String(value).replaceAll("'", "''") + "'";
