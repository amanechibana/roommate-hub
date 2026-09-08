"use client";

import { forwardRef, type CSSProperties } from "react";
import { m, useIsPresent, type HTMLMotionProps } from "motion/react";
import { useHouseMotion } from "./motion-provider";

export const paperTilt = (id: string) =>
  ([...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 0) %
    201) /
  100;
export const memberPaper = (id: string) =>
  ["#edf0dc", "#f5e3d3", "#f2eacb"][
    Math.abs(Math.round(paperTilt(id) * 100)) % 3
  ];

/** Exiting rows stop accepting input immediately; persistence never waits for motion. */
export const PresenceRow = forwardRef<
  HTMLDivElement,
  HTMLMotionProps<"div"> & {
    paper?: string;
    index?: number;
  }
>(function PresenceRow({ children, paper, index = 0, style, ...props }, ref) {
  const { reduced } = useHouseMotion();
  const present = useIsPresent();
  const tilt = paper ? paperTilt(paper) : 0;
  return (
    <m.div
      ref={ref}
      layout={reduced ? false : "position"}
      initial={reduced ? false : { opacity: 0, y: 6, rotate: tilt }}
      animate={{ opacity: 1, y: 0, rotate: reduced ? 0 : tilt }}
      exit={
        reduced
          ? { opacity: 0, transition: { duration: 0 } }
          : paper
            ? {
                opacity: 0,
                scale: 0.45,
                rotate: tilt - 18,
                transition: { duration: 0.22 },
              }
            : {
                opacity: 0,
                height: 0,
                marginTop: 0,
                marginBottom: 0,
                paddingTop: 0,
                paddingBottom: 0,
                transition: { duration: 0.18 },
              }
      }
      transition={{
        opacity: {
          duration: reduced ? 0 : 0.18,
          delay: Math.min(index, 6) * 0.04,
        },
        layout: { type: "spring", stiffness: 460, damping: 38 },
      }}
      inert={!present || undefined}
      aria-hidden={!present || undefined}
      style={
        {
          ...style,
          ...(!present ? { overflow: "hidden", pointerEvents: "none" } : {}),
        } as CSSProperties
      }
      {...props}
    >
      {children}
    </m.div>
  );
});
