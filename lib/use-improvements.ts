"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { homeRequest } from "./home-client";
import {
  defaultHouseholdPreferences,
  defaultReminderPreferences,
  type HouseholdPreferences,
  type ReminderPreferences,
} from "./improvements";
export type CoverageRequest = {
  id: string;
  entry_id: string;
  original: string;
  candidate: string;
  requester: string;
  date: string;
  status: "open" | "approved" | "declined";
};
export function useImprovements(
  householdId: string | undefined,
  memberId: string | null,
  demo: boolean,
) {
  const generation = useRef(0);
  const [household, setHousehold] = useState<HouseholdPreferences>(
    defaultHouseholdPreferences,
  );
  const [reminders, setReminders] = useState<ReminderPreferences>(
    defaultReminderPreferences,
  );
  const [coverage, setCoverage] = useState<CoverageRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(demo);
  const refresh = useCallback(async () => {
    if (!householdId || demo) return;
    const current = generation.current;
    try {
      const data = await homeRequest("/api/improvements");
      if (current !== generation.current) return;
      setHousehold({ ...defaultHouseholdPreferences, ...data.household });
      setReminders({ ...defaultReminderPreferences, ...data.reminders });
      setCoverage(data.coverage ?? []);
      setError("");
      setLoaded(true);
    } catch (e) {
      if (current !== generation.current) return;
      setError((e as Error).message);
    }
  }, [householdId, memberId, demo]);
  useEffect(() => {
    generation.current++;
    setBusy(false);
    setHousehold(defaultHouseholdPreferences);
    setReminders(defaultReminderPreferences);
    setCoverage([]);
    setLoaded(demo);
    void refresh();
  }, [refresh, demo]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function write(operation: string, payload: object) {
    const current = ++generation.current;
    setBusy(true);
    setError("");
    try {
      if (!demo)
        await homeRequest("/api/improvements", "POST", { operation, payload });
      return current === generation.current;
    } catch (e) {
      if (current !== generation.current) return false;
      setError((e as Error).message);
      return false;
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return {
    household,
    reminders,
    coverage,
    busy,
    error,
    loaded,
    refresh,
    async saveHousehold(settings: HouseholdPreferences) {
      if (await write("save_household", { settings })) {
        setHousehold(settings);
        return true;
      }
      return false;
    },
    async saveReminders(settings: ReminderPreferences) {
      if (await write("save_reminders", { settings })) {
        setReminders(settings);
        return true;
      }
      return false;
    },
    async requestCoverage(entry_id: string, candidate: string) {
      if (await write("request_coverage", { entry_id, candidate })) {
        await refresh();
        return true;
      }
      return false;
    },
    async decideCoverage(id: string, approve: boolean) {
      if (await write("decide_coverage", { id, approve })) {
        await refresh();
        return true;
      }
      return false;
    },
  };
}
export type ImprovementsController = ReturnType<typeof useImprovements>;
