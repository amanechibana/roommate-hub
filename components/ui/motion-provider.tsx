"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type CSSProperties,
  useRef,
} from "react";
import {
  LazyMotion,
  MotionConfig,
  domMax,
  useReducedMotion,
} from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";

import type { Weather } from "@/lib/transit";

type Celebration = {
  kind?: "task" | "all-done" | "paid" | "settlement";
  from?: string;
  to?: string;
};
const HouseMotion = createContext({
  reduced: false,
  ambient: true,
  celebration: 0,
  active: false,
  hour: 12,
  month: 0,
  weather: null as Weather | null,
  setWeather: (_weather: Weather | null) => {},
  celebrate: (_event?: Celebration) => {},
  toggleAmbient: () => {},
});
export const useHouseMotion = () => useContext(HouseMotion);

export default function MotionProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  const [ambient, setAmbient] = useState(true);
  const [celebration, setCelebration] = useState(0);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [burst, setBurst] = useState<
    (Celebration & { x: number; y: number; id: number }) | null
  >(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const active = ready && ambient && visible && !reduced;
  useEffect(() => {
    const track = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    const keyboard = () => {
      pointer.current = null;
    };
    document.addEventListener("pointerdown", track);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", track);
      document.removeEventListener("keydown", keyboard);
    };
  }, []);
  useEffect(() => {
    if (!visible) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, [visible]);
  useEffect(() => {
    if (!active) setBurst(null);
    if (!burst) return;
    const timer = setTimeout(() => setBurst(null), 1600);
    return () => clearTimeout(timer);
  }, [burst, active]);
  function celebrate(event: Celebration = {}) {
    setCelebration((value) => value + 1);
    if (!active) return;
    const rect = document.activeElement?.getBoundingClientRect();
    const origin = pointer.current || {
      x: rect ? rect.x + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.y + rect.height / 2 : window.innerHeight / 2,
    };
    setBurst({ ...event, ...origin, id: Date.now() });
  }
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
    <HouseMotion.Provider
      value={{
        reduced,
        ambient,
        toggleAmbient,
        celebration,
        active,
        hour: now?.getHours() ?? 12,
        month: now?.getMonth() ?? 0,
        weather,
        setWeather,
        celebrate,
      }}
    >
      <MotionConfig
        reducedMotion="user"
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <LazyMotion features={domMax} strict>
          <Tooltip.Provider delayDuration={450} skipDelayDuration={150}>
            {children}
            {active && burst && (
              <div
                key={burst.id}
                className="celebration-layer"
                aria-hidden="true"
              >
                <div
                  className="paper-burst"
                  style={{ left: burst.x, top: burst.y }}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <i
                      key={i}
                      style={
                        {
                          "--dx": `${Math.cos(i * 2.4) * (45 + i * 5)}px`,
                          "--dy": `${-35 - (i % 4) * 24}px`,
                          "--turn": `${i * 67}deg`,
                          "--scrap": ["#899477", "#c17e62", "#e7bc8f"][i % 3],
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
                {burst.kind === "all-done" && (
                  <div className="celebration-message">
                    All done. The cat approves.
                  </div>
                )}
                {burst.kind === "settlement" && (
                  <div className="celebration-message settlement-flight">
                    <span>{burst.from}</span>
                    <b>● →</b>
                    <span>{burst.to}</span>
                    <small>Repayment recorded</small>
                  </div>
                )}
              </div>
            )}
          </Tooltip.Provider>
        </LazyMotion>
      </MotionConfig>
    </HouseMotion.Provider>
  );
}
