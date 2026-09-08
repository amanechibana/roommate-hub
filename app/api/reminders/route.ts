import {
  json,
  sameOrigin,
  sharedDatabase,
  signedIn,
  selectedMember,
} from "@/lib/shared-server";
import {
  pushConfigured,
  preparePush,
  sendPush,
  type Subscription,
} from "@/lib/push-server";
import { equalSecret } from "@/lib/session-token";
import { localDateKey, memberDigest, quietDigest } from "@/lib/reminders";
import type { Entry, Member } from "@/lib/model";

export const runtime = "nodejs";
export const maxDuration = 60;

// One digest per subscribed device. `onlyMember` limits sending to the test
// button's requester, which also gets a "nothing due" note instead of silence
// so the pipeline stays verifiable.
async function sendDigests(onlyMember: string | null) {
  preparePush();
  const [home, push] = await Promise.all([
    sharedDatabase("get"),
    sharedDatabase("get", {}, "shared_push"),
  ]);
  const entries: Entry[] = home.entries;
  const members: Member[] = home.members;
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
      memberDigest(entries, member, today) ??
      (onlyMember ? quietDigest(member.name) : null);
    if (!digest) continue;
    const result = await sendPush(sub, {
      title: digest.title,
      body: digest.lines.join("\n"),
      tag: `digest-${today}`,
      url: "/",
    });
    if (result === "sent") sent++;
    else if (result === "pruned") pruned++;
  }
  return { sent, pruned };
}

// Vercel Cron calls this every morning.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    !equalSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)
  )
    return json({ error: "Not allowed." }, 401);
  if (!pushConfigured()) return json({ sent: 0, pruned: 0 });
  try {
    return json(await sendDigests(null));
  } catch (err) {
    console.error("GET /api/reminders", err);
    return json({ error: "Could not send reminders." }, 503);
  }
}

// The settings page's "send it now" check, scoped to the requester.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  if (!pushConfigured())
    return json({ error: "Notifications aren’t configured yet." }, 503);
  const member = await selectedMember();
  if (!member)
    return json({ error: "Choose who’s using this device first." }, 400);
  try {
    return json(await sendDigests(member));
  } catch (err) {
    console.error("POST /api/reminders", err);
    return json({ error: "Could not send your digest." }, 503);
  }
}
