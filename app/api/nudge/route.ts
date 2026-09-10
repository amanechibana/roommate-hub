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
import { isBill } from "@/lib/household-actions";
import {
  handoffMessage,
  localDateKey,
  nudgeMessage,
  quietHours,
} from "@/lib/reminders";
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
  let member: unknown;
  let handoff: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 300) return json({ error: "Invalid request." }, 400);
    ({ id, member, handoff } = JSON.parse(raw) ?? {});
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (
    typeof id !== "string" ||
    !id ||
    (member !== undefined && typeof member !== "string")
  )
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
    // A bill names whose share is being chased; a to-do has one assignee.
    const bill = !!entry && isBill(entry);
    const target = entry
      ? real(bill ? ((member as string | undefined) ?? null) : entry.assignee)
      : undefined;
    const nothing = bill
      ? "That share is already settled."
      : "That to-do isn’t waiting on anyone.";
    if (!sender || !entry || !target) return json({ error: nothing }, 400);
    if (target.user_id === sender.user_id)
      return json({ error: "That one’s yours." }, 400);
    // A hand-off tells the new owner once; it is not subject to the nudge
    // cooldown, since nothing stops a second hand-off from being real.
    const handingOff = handoff === true && !bill;
    const message = handingOff
      ? handoffMessage(entry, sender, localDateKey(new Date()))
      : nudgeMessage(
          entry,
          sender,
          localDateKey(new Date()),
          bill ? target : undefined,
        );
    if (!message) return json({ error: nothing }, 400);
    // Not an error: the nudge was understood, the house is just asleep.
    if (quietHours(new Date()))
      return json({ sent: 0, devices: 0, quiet: true });
    const slot = bill ? `${entry.id}:${target.user_id}` : entry.id;
    const last = recent.get(slot);
    if (!handingOff && last && Date.now() - last < NUDGE_COOLDOWN)
      return json(
        { error: `${target.name} was nudged about that a moment ago.` },
        429,
      );
    // Claimed before the sends so an overlapping double tap sees it; a nudge
    // that reached nobody gives the slot back so a retry can go through.
    for (const [key, at] of recent)
      if (Date.now() - at >= NUDGE_COOLDOWN) recent.delete(key);
    if (!handingOff) recent.set(slot, Date.now());
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
    if (!sent && !handingOff) recent.delete(slot);
    return json({ sent, devices: devices.length });
  } catch (err) {
    console.error("POST /api/nudge", err);
    return json({ error: "Couldn’t send the nudge. Try again." }, 503);
  }
}
