import { after } from "next/server";
import {
  pushConfigured,
  pushToHousemates,
  pushToMember,
} from "@/lib/push-server";
import {
  doneMessage,
  noteMessage,
  paidMessage,
  quietHours,
} from "@/lib/reminders";
import type { Entry, Member } from "@/lib/model";
import type { HouseActivity } from "@/lib/activity";
import {
  broadcastChange,
  json,
  realtimeChannel,
  sameOrigin,
  sharedDatabase,
  signedIn,
  selectedMember,
} from "@/lib/shared-server";

export const runtime = "nodejs";
export async function GET() {
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    const data = await sharedDatabase("get");
    const memberId = await selectedMember();
    return json({
      ...data,
      channel: realtimeChannel(),
      member_id: data.members.some(
        (m: { user_id: string }) => m.user_id === memberId,
      )
        ? memberId
        : null,
    });
  } catch (err) {
    console.error("GET /api/home", err);
    return json({ error: "Could not load your home. Please try again." }, 503);
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 12000)
      return json({ error: "This entry is too long." }, 400);
    const { operation, payload, sender } = JSON.parse(raw);
    if (
      !["create", "update", "delete", "restore", "payment", "member"].includes(
        operation,
      ) ||
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    )
      return json({ error: "Invalid request." }, 400);
    const keys =
      operation === "member"
        ? ["name"]
        : operation === "restore"
          ? ["undo_token"]
          : operation === "payment"
            ? ["id", "paid", "cover", "expense"]
            : [
                "undo_token",
                "rotation_partner",
                "id",
                "kind",
                "title",
                "description",
                "category",
                "date",
                "assignee",
                "amount",
                "url",
                "done",
                "repeat",
                "repeat_until",
                "scope",
              ];
    const values = Object.fromEntries(
      Object.entries(payload).filter(([key]) => keys.includes(key)),
    );
    if (operation === "create") {
      delete values.id;
      delete values.scope;
    }
    if (operation === "update") {
      delete values.repeat;
      delete values.repeat_until;
      delete values.rotation_partner;
    }
    const actor = await selectedMember();
    if (!actor)
      return json({ error: "Choose who’s using this device first." }, 400);
    const result = await sharedDatabase(operation, { ...values, actor });
    broadcastChange("home", sender);
    // A check-off closes a loop for whoever added the thing: they hear it
    // got done, once, unless they did it themselves. The stored row is the
    // authority on kind, title, and who added it, and the activity row the
    // gateway wrote in the same transaction is the proof the row actually
    // flipped: a repeated or racing check-off writes none, so it stays quiet.
    const flipped = (result?.activity as HouseActivity[] | undefined)?.[0];
    if (
      operation === "update" &&
      values.done === true &&
      typeof values.id === "string" &&
      flipped?.actor === actor &&
      ["completed", "bought"].includes(flipped.action) &&
      Date.now() - Date.parse(flipped.created_at) < 15000 &&
      pushConfigured() &&
      !quietHours(new Date())
    )
      after(async () => {
        try {
          const home = await sharedDatabase("get");
          const entry = (home.entries as Entry[]).find(
            (e) => e.id === values.id && e.title === flipped.title,
          );
          const by = (home.members as Member[]).find(
            (m) => m.user_id === actor && m.name !== "Housemates",
          );
          const adder =
            entry &&
            (home.members as Member[]).find(
              (m) => m.user_id === entry.created_by && m.name !== "Housemates",
            );
          if (!entry || !by || !adder || adder.user_id === by.user_id) return;
          const message = doneMessage(entry, by);
          if (!message) return;
          await pushToMember(adder.user_id, {
            title: message.title,
            body: message.lines.join("\n"),
            tag: `done-${entry.id}`,
            url: "/",
          });
        } catch (err) {
          console.error("done push failed", (err as Error).name);
        }
      });
    // A bill check landing is news to the other payers: their own share is
    // still open, or the bill is finally settled. The proof is a fresh 'paid'
    // activity row by this actor: the gateway writes one only when a check
    // was actually added. The feed is the house's latest rows, not this
    // request's, so the untick a moment after a tick is gated out by the
    // payload and a housemate's row landing in between is looked past.
    const paid =
      operation === "payment" &&
      (values.paid === true || values.cover === true) &&
      typeof values.id === "string" &&
      (result?.activity as HouseActivity[] | undefined)?.find(
        (a) =>
          a.actor === actor &&
          a.action === "paid" &&
          Date.now() - Date.parse(a.created_at) < 15000,
      );
    if (paid && pushConfigured() && !quietHours(new Date()))
      after(async () => {
        try {
          const home = await sharedDatabase("get");
          const members = home.members as Member[];
          const entry = (home.entries as Entry[]).find(
            (e) => e.id === values.id && e.title === paid.title,
          );
          const by = members.find(
            (m) => m.user_id === actor && m.name !== "Housemates",
          );
          // A check undone again before this ran is nothing to announce.
          if (!entry || !by || !entry.paid_by?.includes(by.user_id)) return;
          for (const id of entry.payment_members ?? []) {
            const to = members.find(
              (m) => m.user_id === id && m.name !== "Housemates",
            );
            const message =
              to &&
              paidMessage(entry, by, to, !!values.cover && !!values.expense);
            if (!message) continue;
            // One payer's dead endpoint must not cost the next their line.
            await pushToMember(to.user_id, {
              title: message.title,
              body: message.lines.join("\n"),
              tag: `paid-${entry.id}`,
              url: "/",
            }).catch((err) =>
              console.error("paid push failed", (err as Error).name),
            );
          }
        } catch (err) {
          console.error("paid push failed", (err as Error).name);
        }
      });
    // A new note on the fridge is read out to the rest of the house, after
    // the response is sent and never during quiet hours; a note keeps.
    if (
      operation === "create" &&
      values.kind === "note" &&
      pushConfigured() &&
      !quietHours(new Date())
    )
      after(async () => {
        try {
          const home = await sharedDatabase("get");
          const from = (home.members as Member[]).find(
            (m) => m.user_id === actor && m.name !== "Housemates",
          );
          const message =
            from &&
            noteMessage(
              {
                kind: "note",
                title: String(values.title ?? ""),
                description: String(values.description ?? ""),
              },
              from,
            );
          if (!message) return;
          await pushToHousemates(actor, {
            title: message.title,
            body: message.lines.join("\n"),
            tag: `note-${Date.now()}`,
            url: "/",
          });
        } catch (err) {
          console.error("note push failed", (err as Error).name);
        }
      });
    // A covered bill writes to the ledger too, so other screens' expense
    // views need the ping as well.
    if (operation === "payment" && values.expense)
      broadcastChange("expenses", sender);
    return json(result);
  } catch (err) {
    if ((err as { rejected?: boolean }).rejected)
      return json({ error: (err as Error).message, rejected: true }, 400);
    console.error("POST /api/home", err);
    return json(
      { error: "Could not save this change. Check the fields and try again." },
      400,
    );
  }
}
