"use client";
import { useAgreementsContext } from "./agreements-context";
import { ptoRemaining, type GymTerms } from "@/lib/agreements";
import { parseDate, shiftDay, type Entry, type Member } from "@/lib/model";

const clock = (time: string) => time.replace(/^0/, "");

// One short row above the calendar grid: attendance this week, the next
// session, and both PTO balances. Ellipsizes instead of wrapping so it never
// costs the fitted calendar more than one line.
export default function GymStrip({
  entries,
  members,
  uid,
  today,
}: {
  entries: Entry[];
  members: Member[];
  uid: string | null;
  today: string;
}) {
  const agreements = useAgreementsContext();
  if (!agreements || !agreements.enabled || !uid) return null;
  const gym = agreements.agreements.find(
    (a) => a.slug === "gym" && a.status === "active",
  );
  if (!gym) return null;
  const terms = gym.terms as GymTerms;
  const people = members.filter((m) => m.name !== "Housemates");
  const me = people.find((m) => m.user_id === uid);
  const other = people.find((m) => m.user_id !== uid);
  const monday = shiftDay(today, -((parseDate(today).getDay() + 6) % 7));
  const weekEnd = shiftDay(monday, 7);
  const sessions = entries.filter(
    (e) => e.kind === "event" && e.category === "Gym" && e.date,
  );
  const thisWeek = sessions.filter(
    (e) => e.date! >= monday && e.date! < weekEnd,
  );
  const logged = thisWeek.filter((e) =>
    agreements.logs.some((log) => log.entry_id === e.id && log.member === uid),
  ).length;
  const next = sessions
    .filter((e) => e.date! >= today)
    .sort((a, b) =>
      (a.date! + (a.time_of_day ?? "")).localeCompare(
        b.date! + (b.time_of_day ?? ""),
      ),
    )[0];
  const gymEvents = agreements.events.filter(
    (e) => e.agreement_id === gym.id,
  );
  const now = new Date();
  const pto = (id: string) => ptoRemaining(gymEvents, id, terms, now);
  const nextLabel = next
    ? `${parseDate(next.date!).toLocaleDateString("en-US", {
        weekday: "short",
      })}${next.time_of_day ? ` ${clock(next.time_of_day)}` : ""} ${next.title.replace(/ day$/, "")}`
    : "";
  return (
    <p
      className="subtle"
      aria-label="Gym agreement week at a glance"
      style={{
        flexShrink: 0,
        margin: 0,
        padding: "0 16px 8px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      This week {logged}/{thisWeek.length}
      {next ? ` · next: ${nextLabel}` : ""} · PTO: {me?.name ?? "You"}{" "}
      {pto(uid)}h{other ? ` / ${other.name} ${pto(other.user_id)}h` : ""}
    </p>
  );
}
