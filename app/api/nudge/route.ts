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
  houseNudgeMessage,
  localDateKey,
  nudgeMessage,
  quietHours,
  thanksMessage,
} from "@/lib/reminders";
import type { Entry, Member } from "@/lib/model";

export const runtime = "nodejs";

// A nudge is a person poking a person, so one per to-do per quarter hour is
// plenty: a double tap or an impatient housemate must not turn into a
// buzzing phone. Per server instance, which is fine for a household.
const NUDGE_COOLDOWN = 15 * 60000;
const HANDOFF_COOLDOWN = 60000;
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
  let thanks: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 300) return json({ error: "Invalid request." }, 400);
    ({ id, member, handoff, thanks } = JSON.parse(raw) ?? {});
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
    const thanking = thanks === true && !bill;
    const nothing = thanking
      ? "Nobody to thank for that one."
      : bill
        ? "That share is already settled."
        : entry?.kind === "request"
          ? "Nobody’s picking that one up."
          : "That to-do isn’t waiting on anyone.";
    // A shared chore or an unclaimed item has nobody in particular to poke,
    // so the whole house hears it, on the same clock as any nudge.
    if (
      sender &&
      entry &&
      !bill &&
      !thanking &&
      handoff === undefined &&
      !real(entry.assignee)
    ) {
      const message = houseNudgeMessage(
        { ...entry, assignee: null },
        sender,
        localDateKey(new Date()),
      );
      if (!message) return json({ error: nothing }, 400);
      if (quietHours(new Date()))
        return json({ sent: 0, devices: 0, quiet: true });
      const slot = `house:${entry.id}`;
      const last = recent.get(slot);
      if (last && Date.now() - last < NUDGE_COOLDOWN)
        return json(
          { error: "The house was nudged about that a moment ago." },
          429,
        );
      for (const [key, at] of recent)
        if (Date.now() - at >= NUDGE_COOLDOWN) recent.delete(key);
      recent.set(slot, Date.now());
      // Sent from the roster already in hand, like a personal nudge: no
      // second fetch to fail between claiming the slot and sending.
      const devices = (push.subscriptions as Subscription[]).filter(
        (sub) => sub.member !== sender.user_id,
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
      if (!sent) recent.delete(slot);
      return json({ sent, devices: devices.length, house: true });
    }
    if (!sender || !entry || !target) return json({ error: nothing }, 400);
    if (target.user_id === sender.user_id)
      return json({ error: "That one’s yours." }, 400);
    // A hand-off tells the new owner once; it is not subject to the nudge
    // cooldown, since nothing stops a second hand-off from being real.
    // "new" is a to-do added with someone's name on it; true is one that
    // changed hands.
    const handingOff = (handoff === true || handoff === "new") && !bill;
    const message = thanking
      ? thanksMessage(entry, sender)
      : handingOff
        ? handoffMessage(
            entry,
            sender,
            localDateKey(new Date()),
            handoff === "new",
          )
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
    // A hand-off has its own short slot per new owner: a second real
    // hand-off a minute later still goes through, a replayed request doesn't.
    // A thank-you has its own slot per sender, on the nudge's clock: a
    // second tap a moment later is not an error, just already said.
    const slot = thanking
      ? `thanks:${entry.id}:${sender.user_id}`
      : handingOff
        ? `handoff:${entry.id}:${target.user_id}`
        : bill
          ? `${entry.id}:${target.user_id}`
          : entry.id;
    const cooldown = handingOff ? HANDOFF_COOLDOWN : NUDGE_COOLDOWN;
    const last = recent.get(slot);
    if (last && Date.now() - last < cooldown)
      return thanking
        ? json({ sent: 0, devices: 0, again: true })
        : handingOff
          ? json({ sent: 0, devices: 0 })
          : json(
              { error: `${target.name} was nudged about that a moment ago.` },
              429,
            );
    // Claimed before the sends so an overlapping double tap sees it; a nudge
    // that reached nobody gives the slot back so a retry can go through.
    for (const [key, at] of recent)
      if (Date.now() - at >= NUDGE_COOLDOWN) recent.delete(key);
    recent.set(slot, Date.now());
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
            // Two housemates' thanks must not replace each other on the
            // lock screen.
            tag: thanking
              ? `thanks-${entry.id}-${sender.user_id}`
              : `nudge-${entry.id}`,
            url: "/",
          })) === "sent"
        )
          sent++;
    }
    if (!sent) recent.delete(slot);
    return json({ sent, devices: devices.length });
  } catch (err) {
    console.error("POST /api/nudge", err);
    return json({ error: "Couldn’t send the nudge. Try again." }, 503);
  }
}
