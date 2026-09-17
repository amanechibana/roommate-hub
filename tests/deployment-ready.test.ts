import test from "node:test";
import assert from "node:assert/strict";
import { deploymentReady } from "../scripts/deployment-ready.mjs";
const env = {
  VERCEL_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://mock.example.test",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "mock",
  HOUSEHOLD_DATA_TOKEN: "mock",
};
test("production waits for the required schema while previews and demos continue", async () => {
  const response = (version: string) => async () =>
    new Response(JSON.stringify({ schema_version: version }));
  assert.equal(await deploymentReady(env, response("024")), false);
  assert.equal(await deploymentReady(env, response("026")), false);
  assert.equal(await deploymentReady(env, response("027")), true);
  assert.equal(await deploymentReady(env, response("invalid")), false);
  assert.equal(
    await deploymentReady(
      { ...env, HOUSEHOLD_DATA_TOKEN: "" },
      response("026"),
    ),
    false,
  );
  assert.equal(await deploymentReady({ VERCEL_ENV: "production" }), true);
  assert.equal(
    await deploymentReady({ ...env, VERCEL_ENV: "preview" }, async () => {
      throw Error("Must not call database");
    }),
    true,
  );
});
test("a failed database check keeps the current production app in service", async () => {
  assert.equal(
    await deploymentReady(
      env,
      async () => new Response("Unavailable", { status: 503 }),
    ),
    false,
  );
  assert.equal(
    await deploymentReady(env, async () => {
      throw Error("Offline");
    }),
    false,
  );
});
