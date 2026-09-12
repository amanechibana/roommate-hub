"use client";

import { Sparkles } from "lucide-react";
import { Button } from "./button";
import { Tooltip } from "./tooltip";
import { useHouseMotion } from "./motion-provider";

export function DisplayButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip text="Your home at a glance. Made for the big screen.">
      <Button
        className="display-toggle"
        aria-label="Display mode"
        onClick={onClick}
      >
        <svg
          className="tv-icon"
          width="23"
          height="23"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <rect
            className="tv-screen"
            x="3"
            y="4"
            width="18"
            height="13"
            rx="3"
          />
          <rect
            x="3"
            y="4"
            width="18"
            height="13"
            rx="3"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M9 21h6M12 17v4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <rect
            className="tv-window"
            x="6"
            y="7"
            width="5"
            height="3"
            rx="1"
            fill="currentColor"
          />
          <path
            d="M14 8h3M7 13h10"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity=".65"
          />
        </svg>
        <span>Display mode</span>
        <i className="tv-ready" aria-hidden="true" />
      </Button>
    </Tooltip>
  );
}

export function AmbientToggle() {
  const { ambient, toggleAmbient, reduced } = useHouseMotion();
  return (
    <Tooltip
      text={
        reduced
          ? "Your device’s reduced-motion setting is on."
          : ambient
            ? "Pause the gentle background animation."
            : "Bring back a little background motion."
      }
    >
      {/* Named by the words on it; aria-pressed carries the state and the
          tooltip says what pressing does. */}
      <Button
        className="ambient-toggle"
        aria-pressed={ambient && !reduced}
        onClick={toggleAmbient}
        disabled={reduced}
      >
        <Sparkles size={16} />
        <span>{ambient && !reduced ? "Motion on" : "Motion off"}</span>
      </Button>
    </Tooltip>
  );
}
