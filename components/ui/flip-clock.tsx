"use client";

import { useEffect, useState } from "react";

function FlipDigit({ value }: { value: string }) {
  const [faces, setFaces] = useState({ current: value, prev: value });
  if (value !== faces.current)
    setFaces({ current: value, prev: faces.current });
  return (
    <span className="flip-digit">
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
    return () => clearTimeout(timer);
  }, []);
  const hours = String(now.getHours() % 12 || 12);
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const meridiem = now.getHours() < 12 ? "AM" : "PM";
  return (
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
  );
}
