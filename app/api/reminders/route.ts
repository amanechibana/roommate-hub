import webpush from "web-push";
import {
  json,
  sameOrigin,
  sharedDatabase,
  signedIn,
  selectedMember,
} from "@/lib/shared-server";
import { localDateKey, memberDigest, quietDigest } from "@/lib/reminders";
import type { Entry, Member } from "@/lib/model";

export const runtime = "nodejs";
export const maxDuration = 60;

function pushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
}

type Subscription = {
  endpoint: string;
  member: string;
  keys: { p256dh: string; auth: string };
};

// One digest per subscribed device. `onlyMember` limits sending to the test
// button's requester, which also gets a "nothing due" note instead of silence
// so the pipeline stays verifiable.
async function sendDigests(onlyMember: string | null) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:household@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
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
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({
          title: digest.title,
          body: digest.lines.join("\n"),
          tag: `digest-${today}`,
          url: "/",
        }),
      );
      sent++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      // Statuses that mean the subscription itself is dead or malformed;
      // transient ones (402/413/429/5xx/no status) retry next morning.
      if (status !== undefined && [400, 401, 403, 404, 410].includes(status)) {
        await sharedDatabase(
          "unsubscribe",
          { endpoint: sub.endpoint },
          "shared_push",
        ).catch(() => {});
        pruned++;
      }
    }
  }
  return { sent, pruned };
}

// Vercel Cron calls this every morning.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return json({ error: "Not allowed." }, 401);
  if (!pushConfigured()) return json({ sent: 0, pruned: 0 });
  try {
    return json(await sendDigests(null));
  } catch {
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
  } catch {
    return json({ error: "Could not send your digest." }, 503);
  }
}
