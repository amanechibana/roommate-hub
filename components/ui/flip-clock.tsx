"use client";

import { useEffect, useState } from "react";
import { dateKey } from "@/lib/model";

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
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Chained timeouts land each tick just past the second boundary, so the
    // flip happens the moment the wall time actually changes.
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, 1030 - (Date.now() % 1000));
    };
    timer = setTimeout(tick, 1030 - (Date.now() % 1000));
    const resume = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  const hours = String(now.getHours() % 12 || 12);
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const meridiem = now.getHours() < 12 ? "AM" : "PM";
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  return (
    <>
      <time
        className="flip-clock"
        dateTime={`${String(now.getHours()).padStart(2, "0")}:${minutes}`}
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
      <time className="flip-clock flip-date" dateTime={dateKey(now)}>
        <span className="flip-sr">{`${weekday}, ${monthDay}`}</span>
        <span className="flip-cards" aria-hidden="true">
          <FlipDigit value={weekday} word />
          <FlipDigit value={monthDay} word />
        </span>
      </time>
    </>
  );
}
