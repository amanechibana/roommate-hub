import "server-only";
import { sharedDatabase } from "./shared-server";
import { equalSecret } from "./session-token";
import { preparePush, sendPush, type Subscription } from "./push-server";
import {
  balanceLines,
  eveningDigest,
  localDateKey,
  memberDigest,
  quietDigest,
} from "./reminders";
import type { Expense } from "./expenses";
import type { Entry, Member } from "./model";

export type Edition = "morning" | "evening";

// Vercel Cron signs its calls with the deployment's secret.
export function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return (
    !!secret &&
    equalSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)
  );
}

// One digest per subscribed device. `onlyMember` limits sending to the test
// button's requester, which also gets a "nothing due" note instead of silence
// so the pipeline stays verifiable.
export async function sendDigests(edition: Edition, onlyMember: string | null) {
  preparePush();
  const [home, push, ledger] = await Promise.all([
    sharedDatabase("get"),
    sharedDatabase("get", {}, "shared_push"),
    // The ledger is a nicety here: a digest still goes out if it can't load.
    edition === "morning"
      ? sharedDatabase("get", {}, "shared_expenses").catch(() => null)
      : null,
  ]);
  const entries: Entry[] = home.entries;
  const members: Member[] = home.members;
  const expenses: Expense[] = ledger?.expenses ?? [];
  const today = localDateKey(new Date());
  let sent = 0;
  let pruned = 0;
  for (const sub of push.subscriptions as Subscription[]) {
    if (onlyMember && sub.member !== onlyMember) continue;
    const member = members.find(
      (m) => m.user_id === sub.member && m.name !== "Housemates",
    );
    if (!member) continue;
    const digest =
      (edition === "morning"
        ? memberDigest(
            entries,
            member,
            today,
            balanceLines(expenses, member, members),
          )
        : eveningDigest(entries, member, today)) ??
      (onlyMember && edition === "morning" ? quietDigest(member.name) : null);
    if (!digest) continue;
    const result = await sendPush(sub, {
      title: digest.title,
      body: digest.lines.join("\n"),
      tag: `${edition === "morning" ? "digest" : "evening"}-${today}`,
      url: "/",
    });
    if (result === "sent") sent++;
    else if (result === "pruned") pruned++;
  }
  return { sent, pruned };
}
