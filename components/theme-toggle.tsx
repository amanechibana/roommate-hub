"use client";

import { useLayoutEffect, useState } from "react";
import { Clock, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./theme-toggle.module.css";

type Preference = "light" | "dark" | "time";
const STORAGE_KEY = "rh-theme";

const ORDER: Preference[] = ["light", "dark", "time"];

const LABELS: Record<Preference, string> = {
  light: "Theme: light",
  dark: "Theme: night",
  time: "Theme: light by day, night by evening",
};

// "time" follows the device clock, never the OS color scheme: 7am–7pm is
// light, evenings and nights are dark.
function resolve(pref: Preference): "light" | "dark" {
  if (pref !== "time") return pref;
  const hour = new Date().getHours();
  return hour >= 7 && hour < 19 ? "light" : "dark";
}

function savedPreference(): Preference {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark" || saved === "time") return saved;
  // Also covers the old "auto" value from the system-scheme days.
  return "time";
}

export function ThemeToggle() {
  const [pref, setPref] = useState<Preference>(() =>
    typeof window === "undefined" ? "time" : savedPreference(),
  );

  // React's dev remount clears the attribute the head script set; re-apply it.
  // The tick also rolls the theme over when "time" crosses the 7am/7pm line
  // while the page is open, and picks up storage written before this mount.
  useLayoutEffect(() => {
    const apply = () =>
      document.documentElement.setAttribute(
        "data-theme",
        resolve(savedPreference()),
      );
    apply();
    const timer = setInterval(apply, 60_000);
    return () => clearInterval(timer);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    setPref(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.setAttribute("data-theme", resolve(next));
  }

  const Icon = pref === "light" ? Sun : pref === "dark" ? Moon : Clock;

  return (
    <Button
      className={styles.option}
      onClick={cycle}
      title={LABELS[pref]}
      aria-label={LABELS[pref]}
    >
      <Icon size={15} />
    </Button>
  );
}
