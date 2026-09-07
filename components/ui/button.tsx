"use client";

import { forwardRef } from "react";
import { m, type HTMLMotionProps } from "motion/react";
import { useHouseMotion } from "./motion-provider";

// One tactile button treatment, preserving each surface's existing styling.
export const Button = forwardRef<HTMLButtonElement, HTMLMotionProps<"button">>(
  function Button({ className = "", children, ...props }, ref) {
    const { reduced } = useHouseMotion();
    return (
      <m.button
        ref={ref}
        whileTap={reduced ? undefined : { scale: 0.97 }}
        className={`ui-button ${className}`}
        {...props}
      >
        {children}
      </m.button>
    );
  },
);
