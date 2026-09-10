import { after } from "next/server";
import {
  pushConfigured,
  pushToHousemates,
  pushToMember,
} from "@/lib/push-server";
import { doneMessage, noteMessage, quietHours } from "@/lib/reminders";
import type { Entry, Member } from "@/lib/model";
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
    // authority on kind, title, and who added it.
    if (
      operation === "update" &&
      values.done === true &&
      typeof values.id === "string" &&
      pushConfigured() &&
      !quietHours(new Date())
    )
      after(async () => {
        try {
          const home = await sharedDatabase("get");
          const entry = (home.entries as Entry[]).find(
            (e) => e.id === values.id,
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
