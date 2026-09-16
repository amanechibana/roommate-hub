import "server-only";
import { sharedDatabase } from "./shared-server";
export async function claimNotification(
  slot: string,
  handoff = false,
): Promise<string | null> {
  const result = await sharedDatabase(
    "claim_cooldown",
    { slot, handoff },
    "shared_household_ops",
  );
  return result.claim;
}
export async function releaseNotification(slot: string, claim: string) {
  await sharedDatabase(
    "release_cooldown",
    { slot, claim },
    "shared_household_ops",
  );
}
