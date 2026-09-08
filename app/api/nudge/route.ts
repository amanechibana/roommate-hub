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
import { localDateKey, nudgeMessage } from "@/lib/reminders";
import type { Entry, Member } from "@/lib/model";

export const runtime = "nodejs";

// A nudge is a person poking a person, so one per to-do per quarter hour is
// plenty: a double tap or an impatient housemate must not turn into a
// buzzing phone. Per server instance, which is fine for a household.
const NUDGE_COOLDOWN = 15 * 60000;
const recent = new Map<string, number>();

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  if (!pushConfigured())
    return json({ error: "Notifications aren’t configured yet." }, 503);
  const from = await selectedMember();
  if (!from)
    return json({ error: "Choose who’s using this device first." }, 400);
  let id: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 200) return json({ error: "Invalid request." }, 400);
    id = JSON.parse(raw)?.id;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (typeof id !== "string" || !id)
    return json({ error: "Invalid request." }, 400);
  try {
    const [home, push] = await Promise.all([
      sharedDatabase("get"),
      sharedDatabase("get", {}, "shared_push"),
    ]);
    const members: Member[] = home.members;
    const real = (uid: string | null) =>
      members.find((m) => m.user_id === uid && m.name !== "Housemates");
    const sender = real(from);
    const entry = (home.entries as Entry[]).find((e) => e.id === id);
    const target = entry ? real(entry.assignee) : undefined;
    if (!sender || !entry || !target)
      return json({ error: "That to-do isn’t waiting on anyone." }, 400);
    if (target.user_id === sender.user_id)
      return json({ error: "That one’s yours." }, 400);
    const message = nudgeMessage(entry, sender, localDateKey(new Date()));
    if (!message)
      return json({ error: "That to-do isn’t waiting on anyone." }, 400);
    const last = recent.get(entry.id);
    if (last && Date.now() - last < NUDGE_COOLDOWN)
      return json(
        { error: `${target.name} was nudged about that a moment ago.` },
        429,
      );
    const devices = (push.subscriptions as Subscription[]).filter(
      (sub) => sub.member === target.user_id,
    );
    let sent = 0;
    if (devices.length) {
      preparePush();
      for (const sub of devices)
        if (
          (await sendPush(sub, {
            title: message.title,
            body: message.lines.join("\n"),
            tag: `nudge-${entry.id}`,
            url: "/",
          })) === "sent"
        )
          sent++;
    }
    if (sent) recent.set(entry.id, Date.now());
    return json({ sent, name: target.name });
  } catch (err) {
    console.error("POST /api/nudge", err);
    return json({ error: "Couldn’t send the nudge. Try again." }, 503);
  }
}
