"use client";

import { useId } from "react";
import { useHouseMotion } from "./motion-provider";
import styles from "./house-companion.module.css";

/** A small living illustration. CSS runs idle motion without React timers. */
export function HouseCompanion({
  variant = "sill",
}: {
  variant?: "sill" | "compact" | "wall";
}) {
  const skyId = useId();
  const { celebration, celebrate, reduced, hour, weather } = useHouseMotion();
  return (
    <button
      type="button"
      className={`${styles.companion} ${styles[variant]}`}
      aria-label="Pet the house cat"
      title="Pet the house cat"
      onClick={() => celebrate()}
      data-night={hour < 6 || hour >= 20}
      data-weather={weather?.icon || "clear"}
      data-reaction={celebration}
    >
      <svg
        viewBox={variant === "compact" ? "79 57 117 81" : "0 0 220 158"}
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={skyId}>
            <rect x="29" y="9" width="158" height="116" rx="9" />
          </clipPath>
        </defs>
        <g className={styles.room}>
          <rect x="22" y="2" width="172" height="131" rx="13" fill="#d4dcca" />
          <g clipPath={`url(#${skyId})`}>
            <path
              fill={
                hour < 6 || hour >= 20
                  ? "#3d4c61"
                  : weather &&
                      ["rain", "storm", "cloud", "fog"].includes(weather.icon)
                    ? "#a8b6b8"
                    : "#b8d2cb"
              }
              d="M29 9h158v116H29z"
            />
            <circle
              className={styles.sun}
              cx={
                hour < 6 || hour >= 20
                  ? 150
                  : 40 + Math.max(0, Math.min(1, (hour - 6) / 14)) * 132
              }
              cy={
                hour < 6 || hour >= 20
                  ? 32
                  : 72 -
                    Math.sin(
                      Math.max(0, Math.min(1, (hour - 6) / 14)) * Math.PI,
                    ) *
                      48
              }
              r="15"
              fill={hour < 6 || hour >= 20 ? "#eee8c9" : "#f8d68f"}
            />
            {(hour < 6 || hour >= 20) && (
              <g fill="#f6ecd0">
                {[45, 73, 98, 125, 170].map((x, i) => (
                  <circle key={x} cx={x} cy={22 + (i % 3) * 13} r="1.2" />
                ))}
                <circle cx="156" cy="27" r="12" fill="#3d4c61" />
              </g>
            )}
            {weather && ["rain", "storm", "snow"].includes(weather.icon) && (
              <g className="window-weather" stroke="#e2edf0" opacity=".65">
                {Array.from({ length: 9 }, (_, i) => (
                  <path
                    key={i}
                    d={`M${38 + i * 16} ${25 + (i % 3) * 15}l-3 9`}
                  />
                ))}
              </g>
            )}
            <g className={styles.cloud} fill="#f1f5e8" opacity=".8">
              <path d="M35 40c0-5 4-8 9-8 1-7 6-11 12-11 8 0 13 5 14 12 6-1 11 3 11 8H35Z" />
              <path d="M133 65c1-5 5-7 9-6 2-8 13-10 18-3 8-2 12 3 12 9h-39Z" />
            </g>
            <path
              d="M29 97c24-28 43-8 69-20 33-17 44 17 89-3v51H29Z"
              fill="#93b49d"
            />
            <path
              d="M29 109c34-19 57 8 87-4 27-11 48-5 71 5v15H29Z"
              fill="#7fa78d"
            />
            <path d="M104 9h7v116h-7Z" fill="#d4dcca" />
            <path d="M29 66h158v6H29Z" fill="#d4dcca" />
            <path
              d="m36 15 32 0-32 58Zm8 0 13 0-21 47V31Z"
              fill="#fff"
              opacity=".1"
            />
          </g>
          <rect x="13" y="130" width="192" height="8" rx="4" fill="#d9bd93" />
          <rect
            x="21"
            y="138"
            width="177"
            height="3"
            rx="1.5"
            fill="#ae916e"
            opacity=".5"
          />
          <g className={styles.plant}>
            <path
              d="M52 113V64m0 27L36 77m16 4 13-21"
              stroke="#4c7150"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M51 82C31 81 29 66 34 59 48 60 55 68 51 82Z"
              fill="#5c8256"
            />
            <path d="M53 68c-8-13-4-24 4-29 9 10 8 21-4 29Z" fill="#729966" />
            <path
              d="M54 92c0-19 14-28 28-24-1 15-12 23-28 24Z"
              fill="#739464"
            />
            <path
              d="M49 106c-16-1-23-11-19-22 13 1 23 7 19 22Z"
              fill="#88a474"
            />
          </g>
          <path
            d="m37 108 4 20c1 3 3 5 6 5h13c3 0 6-2 6-5l3-20H37Z"
            fill="#bb795c"
          />
          <rect x="34" y="104" width="38" height="7" rx="3" fill="#cd8f6c" />
          <path
            d="m42 114 2 10"
            stroke="#e3ab84"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
        <g
          key={celebration}
          className={celebration && !reduced ? styles.reaction : undefined}
        >
          <g className={styles.cat}>
            <path
              className={styles.tail}
              d="M162 121c21 2 33-7 31-22-1-7-7-9-10-4"
              stroke="#c99763"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path
              d="M116 127c-16-2-22-12-20-24 2-18 22-25 40-20 17 4 28 18 29 33 0 10-15 15-49 11Z"
              fill="#d4a671"
            />
            <path
              d="M108 115c5-15 19-20 32-11 7 5 10 14 7 24h-29c-8-1-12-4-10-13Z"
              fill="#ecd0a1"
            />
            <g className={styles.head}>
              <path
                d="m104 89-4-23c0-3 2-4 4-2l14 12 21-1 13-12c2-2 4-1 4 2l-1 28c0 14-12 24-26 24-16 0-28-11-25-28Z"
                fill="#d4a671"
              />
              <path d="m105 71 8 8-7 5Zm46 0-8 8 8 5Z" fill="#bc825f" />
              <path
                d="m119 77 2 8m8-9v8m8-7-2 8"
                stroke="#b38353"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <g
                className={styles.eyes}
                stroke="#624a37"
                strokeWidth="2.3"
                strokeLinecap="round"
              >
                <path d="M113 96q4 4 8 0M137 96q4 4 8 0" />
              </g>
              <path d="m126 101 3 3 3-3Z" fill="#ac7059" />
              <path
                d="M129 104v3m0 0q-3 3-5 0m5 0q3 3 5 0"
                stroke="#876348"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <path
                d="m109 103-12-2m13 6-12 2m50-6 12-2m-13 6 12 2"
                stroke="#876348"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </g>
            <rect
              x="112"
              y="121"
              width="17"
              height="9"
              rx="4.5"
              fill="#efcf9f"
            />
            <rect
              x="134"
              y="121"
              width="17"
              height="9"
              rx="4.5"
              fill="#efcf9f"
            />
          </g>
          <g className={styles.hearts} fill="#c57c67">
            <path d="M168 66c-9-7-11-12-7-15 3-2 6 0 7 2 2-3 5-4 8-2 5 4 0 9-8 15Z" />
            <path d="M94 61c-6-5-8-8-5-10 2-2 4-1 5 1 1-2 4-3 6-1 3 2 0 6-6 10Z" />
          </g>
        </g>
      </svg>
    </button>
  );
}
