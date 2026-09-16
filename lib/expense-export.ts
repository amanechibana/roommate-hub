import type { Expense } from "./expenses";
import type { Member } from "./model";

function cell(value: unknown) {
  let text = String(value ?? "");
  // Spreadsheet programs interpret these prefixes as formulas, even in quoted CSV.
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export function expenseCSV(expenses: Expense[], members: Member[]): string {
  const name = (id: string | null) =>
    members.find((m) => m.user_id === id)?.name ?? id ?? "";
  const header = [
    "id",
    "kind",
    "title",
    "date",
    "amount_cents",
    "paid_by_id",
    "paid_by_name",
    "recipient_id",
    "recipient_name",
    "shares_cents",
    "created_by",
    "created_at",
  ];
  return (
    [
      header.map(cell).join(","),
      ...expenses.map((e) =>
        [
          e.id,
          e.kind,
          e.title,
          e.date,
          e.amount_cents,
          e.paid_by,
          name(e.paid_by),
          e.recipient,
          name(e.recipient),
          JSON.stringify(e.shares),
          e.created_by,
          e.created_at,
        ]
          .map(cell)
          .join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}
export function expenseJSON(
  expenses: Expense[],
  members: Member[],
  household: string,
): string {
  return JSON.stringify(
    {
      version: 1,
      currency: "USD",
      amount_unit: "cents",
      household,
      exported_at: new Date().toISOString(),
      members: members.map(({ user_id, name }) => ({ user_id, name })),
      expenses,
    },
    null,
    2,
  );
}
