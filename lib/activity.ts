export type HouseActivity = {
  id: string;
  actor: string;
  action: "completed" | "bought" | "reopened" | "paid" | "noted";
  title: string;
  created_at: string;
};

export const activityVerb = (action: HouseActivity["action"]) =>
  action === "noted"
    ? "left a note:"
    : action === "paid"
      ? "marked paid:"
      : action;
