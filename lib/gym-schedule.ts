import { dateKey, parseDate } from "./model";
import type { DayType, GymTerms, HouseTerms } from "./agreements";

const CYCLE: DayType[] = ["Push", "Pull", "Legs"];
const DAY_MS = 24 * 60 * 60 * 1000;

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};
const toTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;

// While a ramp is active it overrides every "on" day's time: the week-1 start
// shifted earlier per elapsed week, never past the target. After the target
// date the target time holds; with no ramp the template time is the time.
function sessionTime(terms: GymTerms, date: string, week: number): string {
  const ramp = terms.ramp;
  const slot = terms.template[(parseDate(date).getDay() + 6) % 7];
  if (!ramp) return slot?.time ?? "07:00";
  if (date > ramp.target_date) return ramp.target_time;
  const shifted = toMinutes(ramp.start_time) - week * ramp.weekly_shift_min;
  return toTime(Math.max(shifted, toMinutes(ramp.target_time)));
}

export function gymSessions(
  terms: GymTerms,
  fromDate: Date,
  seriesId: string,
): { date: string; time: string; title: string }[] {
  void seriesId; // fixed signature; sessions carry no id, the gateway does
  const start = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate(),
  );
  const horizon = new Date(start);
  horizon.setDate(horizon.getDate() + 56);
  const rampEnd = terms.ramp ? parseDate(terms.ramp.target_date) : null;
  const end = rampEnd && rampEnd > horizon ? rampEnd : horizon;
  // Ramp weeks tick on Mondays, matching the contract's Rotation Week, and
  // week 1 is the first session's week so the ramp really does begin at the
  // elected Start Time even when activation falls on an off day.
  let anchor: Date | null = null;
  const sessions: { date: string; time: string; title: string }[] = [];
  // One rolling Push→Pull→Legs cycle across the whole horizon; explicit days
  // reposition it so "Auto" days continue from wherever the cycle stands.
  let cycle = 0;
  for (
    const day = new Date(start);
    day <= end && sessions.length < 250;
    day.setDate(day.getDate() + 1)
  ) {
    const slot = terms.template[(day.getDay() + 6) % 7];
    if (!slot?.on) continue;
    if (!anchor) {
      anchor = new Date(day);
      anchor.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
    }
    // Round out DST hour drift before dividing into weeks.
    const week = Math.floor(
      Math.round((day.getTime() - anchor.getTime()) / DAY_MS) / 7,
    );
    const type =
      slot.day_type === "Auto" ? CYCLE[cycle % 3] : (slot.day_type as DayType);
    cycle = CYCLE.indexOf(type) + 1;
    const date = dateKey(day);
    sessions.push({
      date,
      time: sessionTime(terms, date, week),
      title: `${type} day`,
    });
  }
  return sessions;
}

export function houseChores(
  terms: HouseTerms,
  memberIds: [string, string],
  firstDate: Date,
): {
  title: string;
  description: string;
  weekday: number;
  rotation: [string, string];
}[] {
  const holderA =
    terms.first_bundle_a && memberIds.includes(terms.first_bundle_a)
      ? terms.first_bundle_a
      : memberIds[0];
  const other = memberIds[0] === holderA ? memberIds[1] : memberIds[0];
  // Both bundles land on Saturday; weekday is the day offset from first_date
  // (zero when first_date is already a Saturday, as the hook passes it).
  const weekday = (6 - firstDate.getDay() + 7) % 7;
  const describe = (items: string[]) =>
    items.length ? `• ${items.join("\n• ")}` : "";
  return [
    {
      title: terms.bundles.a.name,
      description: describe(terms.bundles.a.items),
      weekday,
      rotation: [holderA, other],
    },
    {
      title: terms.bundles.b.name,
      description: describe(terms.bundles.b.items),
      weekday,
      rotation: [other, holderA],
    },
  ];
}
