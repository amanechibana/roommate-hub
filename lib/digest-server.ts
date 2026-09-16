import "server-only";
import { reminderRoster } from "./notification-preferences-server";
import {
  defaultReminderPreferences,
  reminderDue,
  localClock,
} from "./improvements";
import { collectExpensePages } from "./expense-pages";
import { sharedDatabase, homeSnapshotServer } from "./shared-server";
import { createHash } from "node:crypto";
import { deliverAll } from "./delivery";
import { pushConfigured } from "./push-server";
import { equalSecret } from "./session-token";
import { preparePush, sendPush, type Subscription } from "./push-server";
import {
  balanceLines,
  eveningDigest,
  localDateKey,
  memberDigest,
  quietDigest,
  weekRecap,
} from "./reminders";
import type { Expense } from "./expenses";
import { parseDate, shiftDay, type Entry, type Member } from "./model";

export type Edition = "morning" | "evening";

// Vercel Cron signs its calls with the deployment's secret.
export function cronAuthorized(request: Request) {
  return [process.env.CRON_SECRET, process.env.REMINDER_SCHEDULER_SECRET].some(
    (secret) =>
      !!secret &&
      equalSecret(
        request.headers.get("authorization") ?? "",
        `Bearer ${secret}`,
      ),
  );
}

// One digest per subscribed device. `onlyMember` limits sending to the test
// button's requester, which also gets a "nothing due" note instead of silence
// so the pipeline stays verifiable.
export async function sendDigests(
  edition: Edition,
  onlyMember: string | null,
  run?: { claim: string; delivered: string[]; deadline?: number },
  custom = false,
  retry = false,
  retryDate?: string,
) {
  preparePush();
  const roster = await reminderRoster();
  if (
    custom &&
    !retry &&
    ![defaultReminderPreferences, ...Object.values(roster.members)].some(
      (preferences) =>
        reminderDue(new Date(), preferences[edition], roster.household, 60),
    )
  )
    return { sent: 0, failed: 0, pruned: 0 };
  const today = localDateKey(new Date(), roster.household.timezone);
  // Sunday evening looks back over the week as well as at tomorrow.
  const sunday = edition === "evening" && parseDate(today).getDay() === 0;
  const [home, push, ledger] = await Promise.all([
    homeSnapshotServer(),
    sharedDatabase("get", {}, "shared_push"),
    // The ledger is a nicety here: a digest still goes out if it can't load.
    edition === "morning" || sunday
      ? collectExpensePages((cursor) =>
          sharedDatabase("get", { cursor }, "shared_expenses"),
        ).catch(() => null)
      : null,
  ]);
  const entries: Entry[] = home.entries;
  const members: Member[] = home.members;
  const expenses: Expense[] = ledger ?? [];

  const deliveries: {
    sub: Subscription;
    digest: NonNullable<ReturnType<typeof memberDigest>>;
    hash: string;
    deliveryDate: string;
  }[] = [];
  for (const sub of push.subscriptions as Subscription[]) {
    if (onlyMember && sub.member !== onlyMember) continue;
    const preferences = {
      ...defaultReminderPreferences,
      ...roster.members[sub.member],
    };
    if (
      custom &&
      !retry &&
      !reminderDue(new Date(), preferences[edition], roster.household, 60)
    )
      continue;
    const filtered = entries.filter((e) =>
      e.kind === "task"
        ? preferences.topics.includes("chores")
        : e.kind === "request"
          ? preferences.topics.includes("shopping")
          : e.kind === "event"
            ? preferences.topics.includes(
                ["Rent", "Bill"].includes(e.category) ? "bills" : "plans",
              )
            : false,
    );
    const recap = sunday
      ? weekRecap(
          filtered,
          preferences.topics.includes("expenses") ? expenses : [],
          members,
          today,
        )
      : [];
    const deliveryDate =
      retryDate ??
      (custom &&
      preferences[edition] &&
      localClock(new Date(), roster.household.timezone) < preferences[edition]!
        ? shiftDay(today, -1)
        : today);
    const hash = createHash("sha256").update(sub.endpoint).digest("hex");
    if (run?.delivered.includes(hash)) continue;
    const member = members.find(
      (m) => m.user_id === sub.member && m.name !== "Housemates",
    );
    if (!member) continue;
    const digest =
      (edition === "morning"
        ? memberDigest(
            filtered,
            member,
            today,
            preferences.topics.includes("expenses")
              ? balanceLines(expenses, member, members)
              : [],
          )
        : eveningDigest(filtered, member, today, recap)) ??
      (onlyMember && edition === "morning" ? quietDigest(member.name) : null);
    if (!digest) continue;
    deliveries.push({ sub, digest, hash, deliveryDate });
  }
  const results = await deliverAll(
    deliveries,
    async ({ sub, digest, hash, deliveryDate }) => {
      if (custom) {
        const claim = await sharedDatabase(
          "claim_delivery",
          { edition, date: deliveryDate, endpoint_hash: hash, retry },
          "shared_improvements",
        );
        if (!claim.claimed) return "skipped";
      }
      const result = await sendPush(sub, {
        title: digest.title,
        body: digest.lines.join("\n"),
        tag: `${edition === "morning" ? "digest" : "evening"}-${today}`,
        url: "/",
      });
      if (custom)
        await sharedDatabase(
          "finish_delivery",
          {
            edition,
            date: deliveryDate,
            endpoint_hash: hash,
            status: result === "failed" ? "failed" : "sent",
          },
          "shared_improvements",
        );
      if (result === "sent" && run)
        await sharedDatabase(
          "digest_delivered",
          { edition, claim: run.claim, endpoint_hash: hash },
          "shared_household_ops",
        );
      return result;
    },
    run?.deadline ? Math.max(0, run.deadline - Date.now() - 8000) : 45000,
  );
  return {
    sent: results.filter((r) => r === "sent").length,
    pruned: results.filter((r) => r === "pruned").length,
    failed: results.filter((r) => r === "failed").length,
  };
}

export async function runScheduledDigest(edition: Edition, actor?: string) {
  const deadline = Date.now() + 50000;
  const attribution = actor ? { actor } : {};
  // Agreement continuity must not depend on anybody opting into notifications.
  const schedules = await sharedDatabase(
    "roll_forward",
    attribution,
    "shared_household_ops",
  );
  const run = await sharedDatabase(
    "claim_digest",
    { edition, ...attribution },
    "shared_household_ops",
  );
  if (!run.claim)
    return { sent: 0, pruned: 0, failed: 0, skipped: true, schedules };
  const finish = (payload: Record<string, unknown>) =>
    sharedDatabase(
      "finish_digest",
      { edition, claim: run.claim, ...payload },
      "shared_household_ops",
    );
  if (!pushConfigured()) {
    await finish({ status: "disabled", error_code: "not_configured" });
    return { sent: 0, pruned: 0, failed: 0, schedules };
  }
  try {
    const result = await sendDigests(edition, null, { ...run, deadline });
    const sent = result.sent + run.delivered.length;
    await finish({
      status: result.failed
        ? sent
          ? "partial"
          : "failed"
        : sent
          ? "sent"
          : "empty",
      failed: result.failed,
      ...(result.failed ? { error_code: "push_failed" } : {}),
    });
    return { ...result, schedules };
  } catch {
    await finish({
      status: "failed",
      failed: 1,
      error_code: "database_failed",
    }).catch(() => {});
    throw new Error(
      "Scheduled reminder failed. Check household reminder status.",
    );
  }
}
