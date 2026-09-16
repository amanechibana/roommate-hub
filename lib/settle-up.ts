import { expenseMoney } from "./expenses";

export type PaymentHandoff = {
  payer: string;
  recipient: string;
  amountCents: number;
  household: string;
};

// This text is useful in Zelle or any other payment app that accepts a memo.
// It deliberately identifies both sides: a pasted note should still make sense
// when somebody reads it later outside Common Ground.
export function paymentNote({
  payer,
  recipient,
  amountCents,
  household,
}: PaymentHandoff): string {
  return `${household} household settle-up: ${payer} pays ${recipient} ${expenseMoney(amountCents)}.`;
}

// Common Ground only hands the user to Venmo. Venmo remains responsible for
// choosing and confirming the real recipient and for moving the money.
export function venmoPaymentUrl(payment: PaymentHandoff): string {
  const url = new URL("https://account.venmo.com/pay");
  url.searchParams.set("txn", "pay");
  url.searchParams.set("amount", (payment.amountCents / 100).toFixed(2));
  url.searchParams.set("note", paymentNote(payment));
  return url.toString();
}
