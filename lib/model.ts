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
export function calendarFile(entries: Entry[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Common Ground//Household Calendar//EN",
    "CALSCALE:GREGORIAN",
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
      `SUMMARY:${escapeICS(entry.title)}`,
      `DESCRIPTION:${escapeICS(entry.description)}`,
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
