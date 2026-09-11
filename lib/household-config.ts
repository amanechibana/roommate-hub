"use client";

import { type ExpenseValues } from "@/lib/expenses";

import { type Entry, type Kind, type Repeat } from "@/lib/model";
import {
  CalendarDays,
  ClipboardList,
  Home,
  ShoppingBasket,
  StickyNote,
  Wallet,
} from "lucide-react";

export type SaveValues = Partial<Entry> & {
  repeat?: Repeat;
  repeat_until?: string;
  rotation_partner?: string;
  paid?: boolean;
  cover?: boolean;
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
  | "Expenses"
  | "Our household";
export const tabs = [
  { name: "Overview", icon: Home },
  { name: "Calendar", icon: CalendarDays },
  { name: "To-dos", icon: ClipboardList },
  { name: "Shopping list", icon: ShoppingBasket },
  { name: "House notes", icon: StickyNote },
  { name: "Expenses", icon: Wallet },
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
  task: ["Chore", "To-do"],
  event: ["Together", "Rent", "Bill", "Other"],
  request: ["Need", "Want"],
  note: ["Note"],
};
export const kindTabs: Record<Kind, Tab> = {
  task: "To-dos",
  event: "Calendar",
  request: "Shopping list",
  note: "House notes",
};
