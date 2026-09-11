import { after } from "next/server";
import {
  broadcastChange,
  json,
  sameOrigin,
  sharedDatabase,
  signedIn,
  selectedMember,
} from "@/lib/shared-server";
import { pushConfigured, pushToMember } from "@/lib/push-server";
import { expenseMessage, quietHours } from "@/lib/reminders";
import type { Expense } from "@/lib/expenses";
import type { Member } from "@/lib/model";
export const runtime = "nodejs";
export async function GET() {
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    return json(await sharedDatabase("get", {}, "shared_expenses"));
  } catch (err) {
    console.error("GET /api/expenses", err);
    return json({ error: "Could not load expenses. Please try again." }, 503);
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 12000)
      return json({ error: "This expense is too long." }, 400);
    const { operation, payload, sender } = JSON.parse(raw);
    if (
      !["create", "update", "delete"].includes(operation) ||
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    )
      return json({ error: "Invalid expense." }, 400);
    const actor = await selectedMember();
    if (!actor)
      return json({ error: "Choose who’s using this device first." }, 400);
    const allowed =
      operation === "delete"
        ? ["id"]
        : [
            "id",
            "kind",
            "title",
            "date",
            "amount_cents",
            "paid_by",
            "shares",
            "recipient",
          ];
    const values = Object.fromEntries(
      Object.entries(payload).filter(([key]) => allowed.includes(key)),
    );
    const result = await sharedDatabase(
      operation,
      { ...values, actor },
      "shared_expenses",
    );
    broadcastChange("expenses", sender);
    // A new ledger entry is news to the people in it, after the response
    // and never during quiet hours. Edits and deletions stay quiet: the
    // ledger's balance says what it says. The gateway's create is
    // idempotent, so only a row that was just written counts as new.
    const created = result?.expense?.created_at;
    if (
      operation === "create" &&
      typeof created === "string" &&
      Date.now() - Date.parse(created) < 15000 &&
      pushConfigured() &&
      !quietHours(new Date())
    )
      after(async () => {
        try {
          const home = await sharedDatabase("get");
          const people = (home.members as Member[]).filter(
            (m) => m.name !== "Housemates",
          );
          const from = people.find((m) => m.user_id === actor);
          if (!from) return;
          const entry = values as Pick<
            Expense,
            | "kind"
            | "title"
            | "amount_cents"
            | "paid_by"
            | "shares"
            | "recipient"
          >;
          if (
            typeof entry.amount_cents !== "number" ||
            typeof entry.title !== "string" ||
            typeof entry.shares !== "object"
          )
            return;
          for (const to of people) {
            const message = expenseMessage(entry, from, to, people);
            if (!message) continue;
            // One person's dead endpoint must not cost the next their line.
            await pushToMember(to.user_id, {
              title: message.title,
              body: message.lines.join("\n"),
              tag: `ledger-${values.id ?? Date.now()}`,
              url: "/",
            }).catch((err) =>
              console.error("ledger push failed", (err as Error).name),
            );
          }
        } catch (err) {
          console.error("ledger push failed", (err as Error).name);
        }
      });
    return json(result);
  } catch (err) {
    if ((err as { rejected?: boolean }).rejected)
      return json({ error: (err as Error).message, rejected: true }, 400);
    console.error("POST /api/expenses", err);
    return json(
      {
        error:
          "Couldn’t save the expense. Check the amount and split, then try again.",
      },
      400,
    );
  }
}
