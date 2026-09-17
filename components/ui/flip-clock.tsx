"use client";

import { useEffect, useState } from "react";
import { useHouseholdClock } from "@/lib/household-clock";
import { householdDate, householdHour } from "@/lib/household-time";

function FlipDigit({ value, word = false }: { value: string; word?: boolean }) {
  const [faces, setFaces] = useState({ current: value, prev: value });
  if (value !== faces.current)
    setFaces({ current: value, prev: faces.current });
  return (
    <span className={`flip-digit${word ? " flip-word" : ""}`}>
      {word && <span className="flip-sizer">{value}</span>}
      {/* Keyed remount restarts the CSS flip whenever the digit changes. */}
      <span className="flip-card" key={faces.current}>
        <b className="flip-half flip-top">{faces.current}</b>
        <b className="flip-half flip-bottom">{faces.prev}</b>
        <b className="flip-half flip-leaf-top">{faces.prev}</b>
        <b className="flip-half flip-leaf-bottom">{faces.current}</b>
      </span>
    </span>
  );
}

export default function FlipClock() {
  const { timezone } = useHouseholdClock();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Chained timeouts land each tick just past the second boundary, so the
    // flip happens the moment the wall time actually changes.
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      setNow(new Date());
      timer = setTimeout(tick, 1030 - (Date.now() % 1000));
    };
    timer = setTimeout(tick, 1030 - (Date.now() % 1000));
    const resume = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  const hour = householdHour(now, timezone);
  const hours = String(hour % 12 || 12);
  const minutes = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    minute: "2-digit",
  })
    .formatToParts(now)
    .find((p) => p.type === "minute")!
    .value.padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const meridiem = hour < 12 ? "AM" : "PM";
  const weekday = now.toLocaleDateString("en-US", {
    timeZone: timezone,
    weekday: "long",
  });
  const monthDay = now.toLocaleDateString("en-US", {
    timeZone: timezone,
    month: "long",
    day: "numeric",
  });
  return (
    <>
      <time
        className="flip-clock"
        dateTime={`${String(hour).padStart(2, "0")}:${minutes}`}
      >
        <span className="flip-sr">{`${hours}:${minutes} ${meridiem}`}</span>
        <span className="flip-cards" aria-hidden="true">
          {[...hours].map((digit, i) => (
            // Keyed from the right so the ones card keeps flipping in place
            // when the hour grows from 9 to 10.
            <FlipDigit key={`h${hours.length - i}`} value={digit} />
          ))}
          <span className="flip-colon">:</span>
          {[...minutes].map((digit, i) => (
            <FlipDigit key={`m${i}`} value={digit} />
          ))}
          <span className="flip-seconds">
            {[...seconds].map((digit, i) => (
              <FlipDigit key={`s${i}`} value={digit} />
            ))}
          </span>
          <span className="flip-meridiem">{meridiem}</span>
        </span>
      </time>
      <time
        className="flip-clock flip-date"
        dateTime={householdDate(now, timezone)}
      >
        <span className="flip-sr">{`${weekday}, ${monthDay}`}</span>
        <span className="flip-cards" aria-hidden="true">
          <FlipDigit value={weekday} word />
          <FlipDigit value={monthDay} word />
        </span>
      </time>
    </>
  );
}
