"use client";
import { useCallback, useEffect, useState } from "react";
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
    try {
      const data = await homeRequest("/api/improvements");
      setHousehold({ ...defaultHouseholdPreferences, ...data.household });
      setReminders({ ...defaultReminderPreferences, ...data.reminders });
      setCoverage(data.coverage ?? []);
      setError("");
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [householdId, memberId, demo]);
  useEffect(() => {
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
    setBusy(true);
    setError("");
    try {
      if (!demo)
        await homeRequest("/api/improvements", "POST", { operation, payload });
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
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
