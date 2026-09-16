import type { Expense } from "./expenses";
export type Poll = {
  id: string;
  title: string;
  options: string[];
  deadline: string;
  decision: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_by: string;
  created_at: string;
};
export type PollVote = { poll_id: string; member_id: string; choice: number };
export type PantryItem = {
  id: string;
  title: string;
  status: "stocked" | "low" | "out";
  notes: string;
};
export type MaintenanceRequest = {
  id: string;
  title: string;
  description: string;
  assignee: string | null;
  status: "open" | "in_progress" | "resolved";
  resolution: string;
  resolved_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
export type MaintenancePhoto = {
  id: string;
  request_id: string;
  file_name: string;
  storage_path: string;
};
export type Ingredient = { title: string; missing: boolean };
export type Meal = {
  id: string;
  title: string;
  date: string;
  cook: string | null;
  ingredients: Ingredient[];
  notes: string;
  calendar_entry_id: string | null;
};
export type BudgetCategory = "groceries" | "utilities";
export type BudgetTarget = {
  month: string;
  category: BudgetCategory;
  target_cents: number;
};
export type ExpenseCategory = { expense_id: string; category: BudgetCategory };
export type BudgetSpending = {
  month: string;
  category: BudgetCategory | "unclassified";
  amount_cents: number;
};
export type LifeSnapshot = {
  spending?: BudgetSpending[];
  polls: Poll[];
  votes: PollVote[];
  pantry: PantryItem[];
  maintenance: MaintenanceRequest[];
  photos: MaintenancePhoto[];
  meals: Meal[];
  targets: BudgetTarget[];
  categories: ExpenseCategory[];
};
export const emptyLife = (): LifeSnapshot => ({
  polls: [],
  votes: [],
  pantry: [],
  maintenance: [],
  photos: [],
  meals: [],
  targets: [],
  categories: [],
});
export const lifeAllowlists = {
  poll_create: ["title", "options", "deadline"],
  poll_vote: ["id", "choice"],
  poll_decide: ["id", "decision"],
  pantry_save: ["id", "title", "status", "notes"],
  pantry_delete: ["id"],
  pantry_shop: ["id"],
  maintenance_save: [
    "id",
    "title",
    "description",
    "assignee",
    "status",
    "resolution",
  ],
  maintenance_delete: ["id"],
  meal_save: ["id", "title", "date", "cook", "ingredients", "notes"],
  meal_delete: ["id"],
  meal_shop: ["id"],
  budget_target: ["month", "category", "target_cents"],
  budget_category: ["id", "category"],
} as const;
export type LifeOperation = keyof typeof lifeAllowlists;
export function pollOpen(poll: Poll, now = Date.now()) {
  return !poll.decision && Date.parse(poll.deadline) > now;
}
export function pollTally(poll: Poll, votes: PollVote[]) {
  return poll.options.map((option, choice) => ({
    option,
    count: votes.filter((v) => v.poll_id === poll.id && v.choice === choice)
      .length,
  }));
}
export function missingIngredients(
  ingredients: Ingredient[],
  existing: string[],
) {
  const seen = new Set(existing.map((title) => title.trim().toLowerCase()));
  return ingredients
    .filter((item) => {
      const key = item.title.trim().toLowerCase();
      if (!item.missing || !key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => item.title.trim());
}
export function budgetSpending(
  expenses: Expense[],
  categories: ExpenseCategory[],
  month: string,
  spending?: BudgetSpending[],
) {
  if (spending) {
    const totals = { groceries: 0, utilities: 0, unclassified: 0 };
    for (const row of spending)
      if (row.month === month) totals[row.category] += row.amount_cents;
    return totals;
  }
  const classified = new Map(categories.map((c) => [c.expense_id, c.category]));
  const totals = { groceries: 0, utilities: 0, unclassified: 0 };
  for (const expense of expenses) {
    if (expense.kind !== "expense" || !expense.date.startsWith(month)) continue;
    const category = expense.category?.toLowerCase();
    totals[
      classified.get(expense.id) ||
        (category === "groceries" || category === "utilities"
          ? category
          : "unclassified")
    ] += expense.amount_cents;
  }
  return totals;
}

export function maintenanceImageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    )
  )
    return "image/png";
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}
