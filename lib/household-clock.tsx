"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_HOUSEHOLD_TIMEZONE, householdDate } from "./household-time";

export function useClock(timezone: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      clearTimeout(timer);
      timer = setTimeout(tick, 60010 - (Date.now() % 60000));
    };
    tick();
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return { now, timezone, today: householdDate(now, timezone) };
}
type Clock = ReturnType<typeof useClock>;
const Context = createContext<Clock | null>(null);
export const HouseholdClockProvider = Context.Provider;
export function useHouseholdClock(): Clock {
  return (
    useContext(Context) ?? {
      now: new Date(),
      timezone: DEFAULT_HOUSEHOLD_TIMEZONE,
      today: householdDate(new Date()),
    }
  );
}
