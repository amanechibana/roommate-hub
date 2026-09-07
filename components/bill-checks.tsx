"use client";

import { Check } from "lucide-react";
import type { Entry, Member } from "@/lib/model";
import { billPaid, isBill } from "@/lib/household-actions";

export default function BillChecks({
  entry,
  members,
  uid,
  onPayment,
}: {
  entry: Entry;
  members: Member[];
  uid: string | null;
  onPayment: (entry: Entry) => void;
}) {
  if (!isBill(entry) || !entry.payment_members?.length) return null;
  return (
    <section className="bill-checks" aria-label={`Payments for ${entry.title}`}>
      <div className="bill-heading">
        <strong>{billPaid(entry) ? "Everyone’s paid" : "Who’s paid?"}</strong>
        <small>For this occurrence</small>
      </div>
      <div className="bill-people">
        {entry.payment_members.map((id) => {
          const member = members.find((m) => m.user_id === id);
          const name = member?.name || "Housemate";
          const paid = entry.paid_by?.includes(id) ?? false;
          return (
            <button
              key={id}
              type="button"
              className={`bill-person ${paid ? "paid" : ""}`}
              disabled={id !== uid}
              aria-pressed={paid}
              aria-label={`${paid ? "Mark unpaid" : "Mark paid"}: ${name}`}
              onClick={() => onPayment(entry)}
            >
              <span
                className={`avatar tone-${
                  Math.max(
                    0,
                    members.findIndex((m) => m.user_id === id),
                  ) % 3
                }`}
              >
                {name[0]}
              </span>
              <span>
                <strong>{name}</strong>
                <small>{paid ? "Paid" : "Not paid yet"}</small>
              </span>
              <span className="bill-tick">{paid && <Check size={16} />}</span>
            </button>
          );
        })}
      </div>
      <p className="subtle">Each person checks off their own payment.</p>
    </section>
  );
}
