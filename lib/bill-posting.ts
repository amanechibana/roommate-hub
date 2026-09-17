import { householdDate } from "./household-time";
import { splitEvenly, type ExpenseValues } from "./expenses";
import { type Entry } from "./model";

export function billPaymentValues(
  entry: Entry,
  payer: string,
  cover: boolean,
  today = householdDate(new Date()),
): ExpenseValues | null {
  if (!entry.amount || !entry.payment_members?.includes(payer)) return null;
  const original =
    entry.bill_shares ??
    splitEvenly(Math.round(entry.amount * 100), entry.payment_members);
  const selected = cover
    ? entry.payment_members.filter((id) => !entry.paid_by?.includes(id))
    : [payer];
  const shares = Object.fromEntries(selected.map((id) => [id, original[id]]));
  const amount_cents = Object.values(shares).reduce((a, b) => a + b, 0);
  if (!amount_cents) return null;
  return {
    kind: "expense",
    title: entry.title,
    date: today,
    amount_cents,
    paid_by: payer,
    shares,
    recipient: null,
  };
}
