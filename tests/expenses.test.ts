import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expenseBalances,
  splitEvenly,
  suggestedRepayments,
  toCents,
  type Expense,
} from "../lib/expenses";
const item = (values: Partial<Expense>): Expense => ({
  id: "x",
  household_id: "h",
  kind: "expense",
  title: "Groceries",
  date: "2026-09-07",
  amount_cents: 5001,
  paid_by: "a",
  shares: { a: 2501, b: 2500 },
  recipient: null,
  created_by: "a",
  created_at: "",
  ...values,
});
test("money input rejects fractions of cents and parses decimal cents exactly", () => {
  assert.equal(toCents("50.01"), 5001);
  assert.equal(toCents("0.29"), 29);
  assert.equal(toCents("1000000.00"), 100000000);
  for (const value of [
    "1.001",
    "1e2",
    "-1",
    "0",
    "NaN",
    "Infinity",
    "1,000",
    "1000000.01",
  ])
    assert.equal(toCents(value), null, value);
});
test("even splits distribute every cent deterministically without duplicates", () => {
  assert.deepEqual(splitEvenly(100, ["c", "a", "b", "a"]), {
    a: 34,
    b: 33,
    c: 33,
  });
  assert.deepEqual(splitEvenly(1, ["b", "a"]), { a: 1, b: 0 });
  assert.deepEqual(splitEvenly(100, []), {});
});
test("repayments reduce debts without increasing shared spending", () => {
  const expenses = [item({})];
  assert.deepEqual(expenseBalances(expenses), { a: 2500, b: -2500 });
  expenses.push(
    item({
      kind: "settlement",
      paid_by: "b",
      recipient: "a",
      shares: {},
      amount_cents: 1000,
    }),
  );
  assert.deepEqual(expenseBalances(expenses), { a: 1500, b: -1500 });
  assert.deepEqual(suggestedRepayments(expenseBalances(expenses)), [
    { from: "b", to: "a", amount: 1500 },
  ]);
  expenses.push(
    item({
      kind: "settlement",
      paid_by: "b",
      recipient: "a",
      shares: {},
      amount_cents: 1500,
    }),
  );
  assert.deepEqual(suggestedRepayments(expenseBalances(expenses)), []);
});
test("suggested repayments settle a multi-person home exactly", () => {
  const balances = { a: 5101, b: -2000, c: -3101 };
  const payments = suggestedRepayments(balances);
  for (const payment of payments) {
    balances[payment.from as keyof typeof balances] += payment.amount;
    balances[payment.to as keyof typeof balances] -= payment.amount;
  }
  assert.deepEqual(balances, { a: 0, b: 0, c: 0 });
});
