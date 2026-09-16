"use client";

import { type ExpenseValues } from "@/lib/expenses";

import { type Entry, type Kind, type Repeat } from "@/lib/model";
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  Home,
  ShoppingBasket,
  StickyNote,
  HeartHandshake,
  Wallet,
} from "lucide-react";

export type SaveValues = Partial<Entry> & {
  repeat?: Repeat;
  repeat_until?: string;
  repeat_days?: number[];
  repeat_interval?: number;
  time_of_day?: string | null;
  end_time?: string | null;
  rotation_partner?: string;
  paid?: boolean;
  cover?: boolean;
  log_share?: boolean;
  undo_token?: string;
  scope?: "series";
  expense?: ExpenseValues & { id: string };
  // A create that recreates an existing entry as a series, not a new thing.
  converting?: boolean;
};

export type Tab =
  | "Overview"
  | "Calendar"
  | "To-dos"
  | "Shopping list"
  | "House notes"
  | "House planning"
  | "House handbook"
  | "Expenses"
  | "Our household"
  | "Household life";
export const tabs = [
  { name: "Overview", icon: Home },
  { name: "Calendar", icon: CalendarDays },
  { name: "To-dos", icon: ClipboardList },
  { name: "Shopping list", icon: ShoppingBasket },
  { name: "House notes", icon: StickyNote },
  { name: "House handbook", icon: BookOpen },
  { name: "House planning", icon: ClipboardList },
  { name: "Expenses", icon: Wallet },
  { name: "Household life", icon: HeartHandshake },
] as const;
// Day words start sentences capitalised but sit inside them lowercase:
// "Today" on its own, "You, today" in a phrase.
export const asPhrase = (words: string) =>
  /^(Today|Tomorrow|Yesterday|Anytime)$/.test(words)
    ? words.toLowerCase()
    : words;
export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
export const labels: Record<Kind, string> = {
  task: "to-do",
  event: "event",
  request: "item",
  note: "note",
};
export const categories: Record<Kind, string[]> = {
  task: ["Chore", "To-do", "Personal"],
  event: [
    "Together",
    "Away",
    "Guest",
    "Quiet hours",
    "Rent",
    "Bill",
    "Gym",
    "Other",
  ],
  request: ["Need", "Want", "Personal"],
  note: ["Note", "Pinned"],
};
// Calendar chips take their colors from the globals.css palette (sage by
// default, peach for rent); Gym gets the remaining paper tone. Declared here
// because the chip color is applied inline — globals.css belongs to another
// surface.
export const gymEventColors = {
  background: "var(--lilac)",
  color: "#8d7aa8",
} as const;
export const kindTabs: Record<Kind, Tab> = {
  task: "To-dos",
  event: "Calendar",
  request: "Shopping list",
  note: "House notes",
};
