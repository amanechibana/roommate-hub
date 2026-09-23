export const DEFAULT_HOUSEHOLD_TIMEZONE = "America/New_York";

export function householdDate(
  now: Date,
  timezone = DEFAULT_HOUSEHOLD_TIMEZONE,
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function householdHour(now: Date, timezone: string) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
}
export function householdDateTime(
  instant: string | number | Date,
  timezone: string,
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const value = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}
export function householdTimeToIso(local: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error("Choose a valid reservation time.");
  const target = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(target))
    throw new Error("Choose a valid reservation time.");
  let guess = target;
  for (let step = 0; step < 4; step++) {
    const actual = Date.parse(`${householdDateTime(guess, timezone)}:00Z`);
    guess += target - actual;
  }
  if (householdDateTime(guess, timezone) !== local)
    throw new Error("That time does not exist in the household time zone.");
  return new Date(guess).toISOString();
}
