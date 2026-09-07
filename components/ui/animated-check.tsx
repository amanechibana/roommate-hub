"use client";

import { m } from "motion/react";
import { useHouseMotion } from "./motion-provider";

export function AnimatedCheck({ size = 16 }: { size?: number }) {
  const { reduced } = useHouseMotion();
  return (
    <m.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      initial={false}
    >
      <m.path
        d="m5 12 4 4L19 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduced ? 0 : 0.2 }}
      />
    </m.svg>
  );
}
