"use client";

import { useEffect, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  TrainFront,
} from "lucide-react";
import { homeRequest } from "@/lib/home-client";

const STATIONS: [string, string][] = [
  ["NWK", "Newark"],
  ["HAR", "Harrison"],
  ["JSQ", "Journal Square"],
  ["GRV", "Grove St"],
  ["NEW", "Newport"],
  ["EXP", "Exchange Place"],
  ["HOB", "Hoboken"],
  ["WTC", "World Trade Center"],
  ["CHR", "Christopher St"],
  ["09S", "9th St"],
  ["14S", "14th St"],
  ["23S", "23rd St"],
  ["33S", "33rd St"],
];
const DEFAULT_STATIONS = ["JSQ", "NEW"];

type PulseData = {
  weather: {
    temperature: number;
    code: number;
    high: number;
    low: number;
    precipitation: number;
  };
  trains: Record<
    string,
    { label: string; headSign: string; arrivals: string[] }[]
  >;
};

const demoPulse: PulseData = {
  weather: { temperature: 72, code: 1, high: 78, low: 63, precipitation: 10 },
  trains: {
    JSQ: [
      { label: "ToNJ", headSign: "Newark", arrivals: ["4 min", "12 min"] },
      { label: "ToNY", headSign: "33rd Street", arrivals: ["2 min", "9 min"] },
    ],
    NEW: [
      {
        label: "ToNJ",
        headSign: "Journal Square",
        arrivals: ["6 min", "14 min"],
      },
      { label: "ToNY", headSign: "33rd Street", arrivals: ["3 min", "11 min"] },
    ],
  },
};

function WeatherIcon({ code }: { code: number }) {
  if (code === 0) return <Sun size={15} />;
  if (code <= 2) return <CloudSun size={15} />;
  if (code === 3) return <Cloud size={15} />;
  if (code <= 48) return <CloudFog size={15} />;
  if (code <= 57) return <CloudDrizzle size={15} />;
  if (code <= 67) return <CloudRain size={15} />;
  if (code <= 77) return <CloudSnow size={15} />;
  if (code <= 82) return <CloudRain size={15} />;
  if (code <= 86) return <CloudSnow size={15} />;
  return <CloudLightning size={15} />;
}

export default function Pulse({ demo }: { demo: boolean }) {
  const [stations, setStations] = useState<string[]>(DEFAULT_STATIONS);
  const [pulse, setPulse] = useState<PulseData | null>(demo ? demoPulse : null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("pulse-stations") || "");
      if (Array.isArray(saved) && saved.length === 2)
        setStations(saved.map(String));
    } catch {
      // No saved pick yet; the defaults stand.
    }
  }, []);

  useEffect(() => {
    if (demo) return;
    let active = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      homeRequest(`/api/pulse?stations=${stations.join(",")}`)
        .then((data) => active && setPulse(data))
        .catch(() => active && setPulse(null));
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [demo, stations]);

  function choose(index: number, code: string) {
    const next = stations.map((s, i) => (i === index ? code : s));
    setStations(next);
    try {
      localStorage.setItem("pulse-stations", JSON.stringify(next));
    } catch {
      // Private browsing; the pick still applies until reload.
    }
  }

  if (!pulse) return null;
  return (
    <div className="pulse-row">
      <span className="pulse-chip">
        <WeatherIcon code={pulse.weather.code} />
        <strong>{pulse.weather.temperature}°</strong>
        <small>
          {pulse.weather.high}° / {pulse.weather.low}°
          {pulse.weather.precipitation >= 30
            ? ` · ${pulse.weather.precipitation}% rain`
            : ""}
        </small>
      </span>
      {stations.map((code, index) => (
        <span className="pulse-chip" key={index}>
          <TrainFront size={15} />
          <select
            aria-label={`PATH station ${index + 1}`}
            value={code}
            onChange={(event) => choose(index, event.target.value)}
          >
            {STATIONS.map(([value, name]) => (
              <option value={value} key={value}>
                {name}
              </option>
            ))}
          </select>
          <small>
            {(pulse.trains[code] ?? [])
              .map(
                (d) =>
                  `${d.label === "ToNY" ? "NY" : "NJ"} ${d.arrivals[0] ?? "—"}`,
              )
              .join(" · ") || "No trains listed"}
          </small>
        </span>
      ))}
    </div>
  );
}
