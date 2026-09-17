import type { Tab } from "./household-config";

export const pageSlugs: Record<Tab, string> = {
  Overview: "overview",
  "Needs your attention": "attention",
  Calendar: "calendar",
  "To-dos": "todos",
  "Shopping list": "shopping",
  "House notes": "notes",
  "House handbook": "handbook",
  "House planning": "planning",
  Expenses: "expenses",
  "Household life": "life",
  "Our household": "household",
};
export function pageFromUrl(url: URL): Tab {
  const wanted = url.searchParams.get("tab");
  return (
    (Object.entries(pageSlugs).find(
      ([name, slug]) => wanted === name || wanted === slug,
    )?.[0] as Tab | undefined) ?? "Overview"
  );
}
export function pageUrl(url: URL, page: Tab): URL {
  const next = new URL(url);
  next.searchParams.set("tab", pageSlugs[page]);
  next.searchParams.delete("agreement");
  next.hash = "";
  return next;
}
