"use client";

import { useId } from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { LayoutGroup, m } from "motion/react";
import { useHouseMotion } from "./motion-provider";

export function SegmentedControl({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const { reduced } = useHouseMotion();
  return (
    <LayoutGroup id={id}>
      <ToggleGroup.Root
        type="multiple"
        aria-label={label}
        className="filters segmented-control"
        value={[value]}
        onValueChange={(next) => {
          const selected = next.find((item) => item !== value);
          if (selected) onChange(selected);
        }}
      >
        {values.map((option) => (
          <ToggleGroup.Item
            value={option}
            key={option}
            className={option === value ? "active" : ""}
          >
            {option === value && (
              <m.span
                className="segment-highlight"
                layoutId={reduced ? undefined : "selected"}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                aria-hidden="true"
              />
            )}
            <span className="segment-label">{option}</span>
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </LayoutGroup>
  );
}
