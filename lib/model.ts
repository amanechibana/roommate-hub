export type Kind = "task" | "event" | "request" | "note";
export type Entry = {
  id: string;
  household_id: string;
  kind: Kind;
  title: string;
  description: string;
  category: string;
  date: string | null;
  assignee: string | null;
  amount: number | null;
  url: string;
  done: boolean;
  series_id: string | null;
  rotation_members?: string[];
  payment_members?: string[];
  paid_by?: string[];
  created_by: string;
  created_at: string;
};
export type Repeat = "weekly" | "biweekly" | "monthly";
export type Member = { user_id: string; household_id: string; name: string };
export type Household = { id: string; name: string; owner_id: string };

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function parseDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}
export function shiftDay(date: string, days: number): string {
  const next = parseDate(date);
  next.setDate(next.getDate() + days);
  return dateKey(next);
}
// Mirrors the server's expansion: monthly steps clamp to shorter months the
// way Postgres date + interval does (Jan 31 -> Feb 28 -> Mar 31).
export function seriesDates(
  start: string,
  repeat: Repeat,
  until: string,
): string[] {
  const first = parseDate(start);
  const end = parseDate(until);
  const dates: string[] = [];
  for (let n = 0; dates.length < 106; n++) {
    const next = new Date(first);
    if (repeat === "monthly") {
      next.setMonth(first.getMonth() + n);
      if (next.getDate() !== first.getDate()) next.setDate(0);
    } else next.setDate(first.getDate() + n * (repeat === "weekly" ? 7 : 14));
    if (next > end) break;
    dates.push(dateKey(next));
  }
  return dates;
}
export function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function escapeICS(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}
// RFC 5545 limits physical lines to 75 octets, including continuation spaces.
function foldLine(line: string): string {
  const lines: string[] = [];
  let part = "";
  let bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 75) {
      lines.push(part);
      part = " ";
      bytes = 1;
    }
    part += char;
    bytes += size;
  }
  lines.push(part);
  return lines.join("\r\n");
}
const usd = (value: number, cents = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value);
// Rent and bills, without reaching into household-actions, which imports
// this module.
const billLike = (entry: Entry) =>
  entry.kind === "event" && ["Rent", "Bill"].includes(entry.category);
// What a phone's calendar shows for an entry: a chore says whose turn it is
// and whether it is done, a bill says how much, and the notes say who has
// paid. Names come from the house's list; the legacy shared identity is
// nobody, so it never appears.
function calendarSummary(entry: Entry, people: Member[]): string {
  const who = people.find((m) => m.user_id === entry.assignee)?.name;
  if (entry.kind === "task")
    return `${entry.done ? "✓ " : ""}${entry.title}${who ? ` — ${who}` : ""}`;
  if (billLike(entry) && entry.amount)
    return `${entry.title} — ${usd(entry.amount)}`;
  return entry.title;
}
function calendarNotes(entry: Entry, people: Member[]): string {
  const notes = entry.description ? [entry.description] : [];
  if (billLike(entry)) {
    const payers = (entry.payment_members ?? []).filter((id) =>
      people.some((m) => m.user_id === id),
    );
    // Cents first, then the split, the way billShare says "each" on the
    // board: $2.01 between two is $1.01, not the float's $1.
    if (entry.amount && payers.length > 1)
      notes.push(
        `${usd(Math.round(Math.round(entry.amount * 100) / payers.length) / 100, true)} each`,
      );
    const name = (id: string) => people.find((m) => m.user_id === id)!.name;
    const paid = payers.filter((id) => entry.paid_by?.includes(id));
    const waiting = payers.filter((id) => !entry.paid_by?.includes(id));
    if (payers.length && !waiting.length) notes.push("All paid");
    else {
      if (paid.length) notes.push(`Paid: ${paid.map(name).join(", ")}`);
      if (waiting.length)
        notes.push(`Waiting on: ${waiting.map(name).join(", ")}`);
    }
  }
  return notes.join("\n");
}
export function calendarFile(
  entries: Entry[],
  name = "",
  members: Member[] = [],
): string {
  const people = members.filter((m) => m.name !== "Housemates");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Common Ground//Household Calendar//EN",
    "CALSCALE:GREGORIAN",
    // A subscribed feed is listed under the name the calendar carries, not the
    // URL it came from. NAME is RFC 7986; X-WR-CALNAME is the older spelling
    // Apple and Google actually read, so send both.
    ...(name
      ? [`NAME:${escapeICS(name)}`, `X-WR-CALNAME:${escapeICS(name)}`]
      : []),
    // Left to itself a phone re-reads a subscription on its own schedule,
    // which on iOS can be once a day. An hour keeps tonight's plan on
    // tomorrow's screen without hammering the feed. REFRESH-INTERVAL is
    // RFC 7986; X-PUBLISHED-TTL is the spelling Outlook and Google read.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const entry of entries.filter(
    (e) => e.date && (e.kind === "event" || e.kind === "task"),
  )) {
    const end = parseDate(entry.date!);
    end.setDate(end.getDate() + 1);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${entry.id}@common-ground`,
      `DTSTAMP:${new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "")}`,
      `DTSTART;VALUE=DATE:${entry.date!.replaceAll("-", "")}`,
      `DTEND;VALUE=DATE:${dateKey(end).replaceAll("-", "")}`,
      `SUMMARY:${escapeICS(calendarSummary(entry, people))}`,
      `DESCRIPTION:${escapeICS(calendarNotes(entry, people))}`,
      "END:VEVENT",
    );
  }
  return [...lines, "END:VCALENDAR"].map(foldLine).join("\r\n") + "\r\n";
}
export function googleCalendarUrl(entry: Entry): string {
  if (!entry.date) return "";
  const end = parseDate(entry.date);
  end.setDate(end.getDate() + 1);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: entry.title,
    details: entry.description,
    dates: `${entry.date.replaceAll("-", "")}/${dateKey(end).replaceAll("-", "")}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
export function demoData(): {
  household: Household;
  members: Member[];
  entries: Entry[];
} {
  const household = { id: "demo", name: "The Maple House", owner_id: "you" };
  const members = [
    { user_id: "you", name: "You", household_id: "demo" },
    { user_id: "alex", name: "Alex", household_id: "demo" },
    { user_id: "sam", name: "Sam", household_id: "demo" },
  ];
  const day = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return dateKey(date);
  };
  const base = {
    household_id: "demo",
    description: "",
    date: null,
    assignee: null,
    amount: null,
    url: "",
    done: false,
    series_id: null,
    created_by: "you",
    created_at: new Date().toISOString(),
  };
  const entries: Entry[] = [
    {
      ...base,
      id: "1",
      kind: "task",
      title: "Give the kitchen a little love",
      category: "Chore",
      date: day(0),
      assignee: "alex",
    },
    {
      ...base,
      id: "2",
      kind: "task",
      title: "Take out recycling",
      category: "Chore",
      date: day(1),
      assignee: "you",
    },
    {
      ...base,
      id: "3",
      kind: "task",
      title: "Water our green friends",
      category: "Chore",
      date: day(2),
      assignee: "sam",
    },
    {
      ...base,
      id: "4",
      kind: "event",
      title: "House dinner & a catch-up",
      description:
        "Bring something to share. We’ll figure out the rest together.",
      category: "Together",
      date: day(2),
    },
    {
      ...base,
      id: "5",
      kind: "event",
      title: "Rent is due",
      category: "Rent",
      date: day(5),
      amount: 2400,
      payment_members: ["you", "alex"],
      paid_by: [],
    },
    {
      ...base,
      id: "6",
      kind: "request",
      title: "Olive oil",
      category: "Need",
      amount: 12,
      description: "For our next kitchen adventure.",
    },
    {
      ...base,
      id: "7",
      kind: "request",
      title: "A softer living room",
      category: "Want",
      amount: 32,
      description: "A cozy throw for movie nights.",
      url: "https://www.amazon.com/s?k=knit+throw+blanket",
    },
    {
      ...base,
      id: "8",
      kind: "request",
      title: "Dishwasher tablets",
      category: "Need",
      amount: 16,
    },
    {
      ...base,
      id: "9",
      kind: "note",
      title: "A little house note",
      category: "Note",
      description:
        "Friends coming over this weekend? Pop it on the calendar so we can make room. ♡",
      assignee: "sam",
    },
  ];
  return { household, members, entries };
}
