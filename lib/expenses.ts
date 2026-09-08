export type Expense = {
  id: string;
  household_id: string;
  kind: "expense" | "settlement";
  title: string;
  date: string;
  amount_cents: number;
  paid_by: string;
  shares: Record<string, number>;
  recipient: string | null;
  created_by: string;
  created_at: string;
};
export type ExpenseValues = Pick<
  Expense,
  | "kind"
  | "title"
  | "date"
  | "amount_cents"
  | "paid_by"
  | "shares"
  | "recipient"
>;
export function toCents(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 100000000
    ? cents
    : null;
}
export function splitEvenly(
  cents: number,
  ids: string[],
): Record<string, number> {
  const people = [...new Set(ids)].sort();
  if (!people.length) return {};
  const share = Math.floor(cents / people.length);
  return Object.fromEntries(
    people.map((id, index) => [
      id,
      share + (index < cents % people.length ? 1 : 0),
    ]),
  );
}
export function expenseBalances(expenses: Expense[]): Record<string, number> {
  const balances: Record<string, number> = {};
  const add = (id: string, amount: number) => {
    balances[id] = (balances[id] || 0) + amount;
  };
  for (const item of expenses) {
    add(item.paid_by, item.amount_cents);
    if (item.kind === "settlement" && item.recipient)
      add(item.recipient, -item.amount_cents);
    else for (const [id, share] of Object.entries(item.shares)) add(id, -share);
  }
  return balances;
}
export function suggestedRepayments(balances: Record<string, number>) {
  const owed = Object.entries(balances)
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => ({ id, amount }));
  const owes = Object.entries(balances)
    .filter(([, amount]) => amount < 0)
    .map(([id, amount]) => ({ id, amount: -amount }));
  const payments: { from: string; to: string; amount: number }[] = [];
  for (const debtor of owes)
    for (const creditor of owed) {
      const amount = Math.min(debtor.amount, creditor.amount);
      if (amount) {
        payments.push({ from: debtor.id, to: creditor.id, amount });
        debtor.amount -= amount;
        creditor.amount -= amount;
      }
    }
  return payments;
}
export const expenseMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
