"use client";

import { AnimatePresence, m } from "motion/react";
import { BellRing } from "lucide-react";
import { useHouseMotion } from "./ui/motion-provider";
import { Button } from "@/components/ui/button";
import { AnimatedCheck } from "@/components/ui/animated-check";

import type { Entry, Member } from "@/lib/model";
import {
  billPaid,
  billShare,
  isBill,
  shareMoney,
} from "@/lib/household-actions";

export default function BillChecks({
  entry,
  members,
  uid,
  onPayment,
  onCover,
  onLogShare,
  onNudge,
}: {
  entry: Entry;
  members: Member[];
  uid: string | null;
  onPayment: (entry: Entry) => void;
  onCover: (entry: Entry) => void;
  onLogShare?: (entry: Entry) => void;
  onNudge?: (entry: Entry, member: Member) => void;
}) {
  const { active } = useHouseMotion();
  if (!isBill(entry) || !entry.payment_members?.length) return null;
  const canCover =
    !!entry.amount &&
    !billPaid(entry) &&
    !!uid &&
    entry.payment_members.includes(uid);
  return (
    <section className="bill-checks" aria-label={`Payments for ${entry.title}`}>
      <AnimatePresence initial={false}>
        {billPaid(entry) && (
          <m.span
            key="paid"
            className="paid-stamp"
            aria-hidden="true"
            initial={active ? { opacity: 0, scale: 3, rotate: -18 } : false}
            animate={{ opacity: 1, scale: 1, rotate: -8 }}
            exit={{ opacity: 0 }}
            transition={
              active
                ? { type: "spring", stiffness: 500, damping: 24 }
                : { duration: 0 }
            }
          >
            PAID
          </m.span>
        )}
      </AnimatePresence>
      <div className="bill-heading">
        <strong>{billPaid(entry) ? "Everyone’s paid" : "Who’s paid?"}</strong>
        <small>For this occurrence</small>
      </div>
      <div className="bill-people">
        {entry.payment_members.map((id) => {
          const member = members.find((m) => m.user_id === id);
          const name = member?.name || "Housemate";
          const paid = entry.paid_by?.includes(id) ?? false;
          const nudgeable =
            !!onNudge && !paid && !!member && id !== uid && !!uid;
          return (
            <span key={id} className="bill-slot">
              <Button
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
                  <small>
                    {billShare(entry, id) != null
                      ? `${shareMoney(billShare(entry, id)!)}, ${paid ? "paid" : "not paid yet"}`
                      : paid
                        ? "Paid"
                        : "Not paid yet"}
                  </small>
                </span>
                <span className="bill-tick">
                  {paid && <AnimatedCheck size={16} />}
                </span>
              </Button>
              {nudgeable && (
                <Button
                  type="button"
                  className="text-button muted bill-nudge"
                  onClick={() => onNudge(entry, member)}
                >
                  <BellRing size={12} />
                  Nudge {name}
                </Button>
              )}
            </span>
          );
        })}
      </div>
      {canCover && (
        <Button
          type="button"
          className="button secondary small"
          onClick={() => onCover(entry)}
        >
          {entry.paid_by?.length
            ? "I covered the remaining shares — split them"
            : "I covered the whole bill — split it"}
        </Button>
      )}
      {uid &&
        entry.amount &&
        entry.payment_members.includes(uid) &&
        onLogShare && (
          <Button
            type="button"
            className="button secondary small"
            onClick={() => onLogShare(entry)}
          >
            Log my share to Expenses
          </Button>
        )}
      <p className="subtle">
        {canCover
          ? "I paid is a reminder check only. Log my share records spending without creating a debt. Cover posts only unpaid shares to Expenses."
          : "I paid is a reminder check only. Log my share records your spending without creating a debt."}
      </p>
    </section>
  );
}
