"use client";
import { useCallback, useEffect, useState } from "react";
import type { Tab } from "./household-config";
import { pageFromUrl, pageUrl } from "./navigation";

export function usePageNavigation() {
  const [tab, updateTab] = useState<Tab>("Overview");
  useEffect(() => {
    const sync = () => updateTab(pageFromUrl(new URL(window.location.href)));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const setTab = useCallback((next: Tab) => {
    const current = new URL(window.location.href);
    if (pageFromUrl(current) !== next) {
      window.history.pushState(null, "", pageUrl(current, next));
    }
    updateTab(next);
  }, []);
  return [tab, setTab] as const;
}
