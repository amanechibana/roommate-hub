"use client";
import { useEffect, useRef } from "react";
import { useSpring } from "motion/react";
import { expenseMoney } from "@/lib/expenses";
import { useHouseMotion } from "./motion-provider";

export function AnimatedMoney({ cents }: { cents: number }) {
  const { reduced } = useHouseMotion();
  const value = useSpring(cents, { stiffness: 160, damping: 28 });
  const text = useRef<HTMLSpanElement>(null);
  const initial = useRef(expenseMoney(cents));
  useEffect(
    () =>
      value.on("change", (latest) => {
        if (text.current)
          text.current.textContent = expenseMoney(Math.round(latest));
      }),
    [value],
  );
  useEffect(() => {
    if (reduced) value.jump(cents);
    else value.set(cents);
  }, [cents, reduced, value]);
  return (
    <span className="animated-money">
      <span className="flip-sr">Amount: {expenseMoney(cents)}</span>
      <span aria-hidden="true" ref={text}>
        {initial.current}
      </span>
    </span>
  );
}
