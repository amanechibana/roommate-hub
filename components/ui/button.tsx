"use client";

import { forwardRef } from "react";
import { m, useIsPresent, type HTMLMotionProps } from "motion/react";
import { useHouseMotion } from "./motion-provider";

// One tactile button treatment, preserving each surface's existing styling.
export const Button = forwardRef<HTMLButtonElement, HTMLMotionProps<"button">>(
  function Button({ className = "", children, ...props }, ref) {
    const { reduced } = useHouseMotion();
    const present = useIsPresent();
    return (
      <m.button
        ref={ref}
        whileTap={reduced ? undefined : { scale: 0.97 }}
        transition={
          reduced
            ? { duration: 0 }
            : { type: "spring", stiffness: 480, damping: 30 }
        }
        className={`ui-button ${className}`}
        {...props}
        inert={!present || undefined}
        aria-hidden={!present || props["aria-hidden"]}
      >
        {children}
      </m.button>
    );
  },
);
