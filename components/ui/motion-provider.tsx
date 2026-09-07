"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  LazyMotion,
  MotionConfig,
  domMax,
  useReducedMotion,
} from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";

const HouseMotion = createContext({
  reduced: false,
  ambient: true,
  toggleAmbient: () => {},
});
export const useHouseMotion = () => useContext(HouseMotion);

export default function MotionProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  const [ambient, setAmbient] = useState(true);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      setAmbient(localStorage.getItem("common-ground-ambient") !== "off");
    } catch {
      /* Storage can be unavailable on a shared display. */
    }
    setReady(true);
    const sync = () => setVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.ambient =
      ready && ambient && visible && !reduced ? "on" : "off";
    return () => {
      delete document.documentElement.dataset.ambient;
    };
  }, [ambient, visible, reduced, ready]);
  function toggleAmbient() {
    const next = !ambient;
    setAmbient(next);
    try {
      localStorage.setItem("common-ground-ambient", next ? "on" : "off");
    } catch {
      /* The in-memory preference still works. */
    }
  }
  return (
    <HouseMotion.Provider value={{ reduced, ambient, toggleAmbient }}>
      <MotionConfig
        reducedMotion="user"
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <LazyMotion features={domMax} strict>
          <Tooltip.Provider delayDuration={450} skipDelayDuration={150}>
            {children}
          </Tooltip.Provider>
        </LazyMotion>
      </MotionConfig>
    </HouseMotion.Provider>
  );
}
