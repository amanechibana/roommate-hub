"use client";

import { useLayoutEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./theme-toggle.module.css";

type Preference = "auto" | "light" | "dark";
const STORAGE_KEY = "rh-theme";

const OPTIONS: { value: Preference; label: string; Icon: typeof Sun }[] = [
  { value: "auto", label: "Theme: follow system", Icon: Monitor },
  { value: "light", label: "Theme: light", Icon: Sun },
  { value: "dark", label: "Theme: night", Icon: Moon },
];

function resolve(pref: Preference): "light" | "dark" {
  if (pref !== "auto") return pref;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function savedPreference(): Preference {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" ? saved : "auto";
}

export function ThemeToggle() {
  const [pref, setPref] = useState<Preference>(() =>
    typeof window === "undefined" ? "auto" : savedPreference(),
  );

  // React's dev remount clears the attribute the head script set; re-apply it.
  // While the preference is auto, follow the OS scheme as it changes.
  useLayoutEffect(() => {
    const apply = () =>
      document.documentElement.setAttribute(
        "data-theme",
        resolve(savedPreference()),
      );
    apply();
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  function choose(next: Preference) {
    setPref(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.setAttribute("data-theme", resolve(next));
  }

  return (
    <div className={styles.toggle} role="group" aria-label="Theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <Button
          key={value}
          className={`${styles.option} ${pref === value ? styles.selected : ""}`}
          aria-label={label}
          aria-pressed={pref === value}
          title={label}
          onClick={() => choose(value)}
        >
          <Icon size={15} />
        </Button>
      ))}
    </div>
  );
}
