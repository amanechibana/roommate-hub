import assert from "node:assert/strict";
import test from "node:test";
import { paymentNote, venmoPaymentUrl } from "../lib/settle-up";

const payment = {
  payer: "Alex",
  recipient: "Amane",
  amountCents: 4021,
  household: "The Maple House",
};

test("payment notes identify both people, the exact amount, and the household", () => {
  assert.equal(
    paymentNote(payment),
    "The Maple House household settle-up: Alex pays Amane $40.21.",
  );
});

test("Venmo handoff uses its pay page with amount and note, but no guessed recipient", () => {
  const url = new URL(venmoPaymentUrl(payment));
  assert.equal(url.origin, "https://account.venmo.com");
  assert.equal(url.pathname, "/pay");
  assert.equal(url.searchParams.get("txn"), "pay");
  assert.equal(url.searchParams.get("amount"), "40.21");
  assert.equal(url.searchParams.get("note"), paymentNote(payment));
  assert.equal(url.searchParams.has("recipients"), false);
});
