"use client";
import { useHouseMotion } from "./ui/motion-provider";
import { PaperDialog } from "./ui/dialog";
import { AnimatePresence } from "motion/react";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CloudOff,
  RefreshCw,
  Settings,
  Sun,
  TrainFront,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  MAX_STATIONS,
  defaultStations,
  filterDepartures,
  hasDeparted,
  leaveInMinutes,
  minutesUntil,
  parseStoredStations,
  sameStation,
  searchPathStations,
  subwayColor,
  toggleFilter,
  type CommuteStation,
  type Departure,
  type Departures,
  type SubwayStation,
  type Weather,
} from "@/lib/transit";
import type { TransitAlert } from "@/lib/subway-alerts";

const STORAGE_KEY = "common-ground:commute";
// Trains move; the weather does not. Poll them accordingly.
const TRAIN_REFRESH = 30_000;
const WEATHER_REFRESH = 10 * 60_000;
// Alerts also change slowly, and the server caches the feed for five minutes.
const ALERT_REFRESH = 5 * 60_000;

function readStations(): CommuteStation[] {
  if (typeof window === "undefined") return defaultStations();
  try {
    return parseStoredStations(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // A blocked or corrupt store should not take the board down with it.
    return defaultStations();
  }
}

type StationOptions = { lines: string[]; headsigns: string[] };

function stationKeyOf(station: CommuteStation): string {
  return `${station.system}:${station.id}`;
}

function endpointFor(station: CommuteStation): string {
  const id = encodeURIComponent(station.id);
  return station.system === "path"
    ? `/api/path?station=${id}`
    : `/api/subway?station=${id}`;
}

const icons: Record<Weather["icon"], typeof Sun> = {
  sun: Sun,
  "cloud-sun": CloudSun,
  cloud: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
  fog: CloudFog,
};

/** "Now" reads better than "0 min" on a wall you glance at. */
function when(departure: Departure, now: number): string {
  if (departure.status) return departure.status;
  const minutes = minutesUntil(departure, now);
  if (minutes === null) return "—";
  if (minutes === 0) return "Now";
  return `${minutes} min`;
}

function badgeStyle(colors: string[]) {
  const valid = colors.filter((color) => /^[0-9a-fA-F]{6}$/.test(color));
  if (!valid.length) return { background: "#6e6e73" };
  if (valid.length === 1) return { background: `#${valid[0]}` };
  // PATH runs two-toned services; show both halves.
  return {
    background: `linear-gradient(135deg, #${valid[0]} 50%, #${valid[1]} 50%)`,
  };
}

export default function CommuteStrip({
  display = false,
}: {
  display?: boolean;
}) {
  const [stations, setStations] = useState<CommuteStation[]>(defaultStations);
  const { weather, setWeather } = useHouseMotion();
  const [boards, setBoards] = useState<Departures[]>([]);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  // Only read before the first successful load; after that the last reading
  // stays up, which the strip's staleness marker already covers.
  const [weatherMissed, setWeatherMissed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // When the server fetched the oldest board's data, as opposed to when this
  // client last asked; the honest timestamp to show while boards are stale.
  const [dataAt, setDataAt] = useState<Date | null>(null);
  const [stale, setStale] = useState(false);
  // Unix seconds, stepped every few seconds so the countdowns stay honest
  // between the 30-second polls rather than freezing on the last response.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  // How many departures actually fit, measured rather than guessed: a 1080p
  // wall has room for far more than a phone.
  const [capacity, setCapacity] = useState(3);
  const trains = useRef<HTMLDivElement>(null);
  // Stored settings are only readable on the client, so hold off fetching
  // until they are in hand; otherwise the first load requests the defaults
  // and then immediately requests the saved stations as well.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setStations(readStations());
    setHydrated(true);
  }, []);

  function persist(next: CommuteStation[]) {
    setStations(next);
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ stations: next }),
      );
    } catch {
      // Private browsing can refuse writes; the choice still applies for now.
    }
  }

  // Depend on the contents of the list, not the array identity, so re-reading
  // storage with the same stations does not retrigger every request.
  const key = JSON.stringify(stations);

  // The list the loaders should still answer for. A slow response that raced
  // a station-list change is dropped, so a removed station cannot resurrect
  // on a late reply. This effect runs before the loader effects below.
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  const loadTrains = useCallback(async () => {
    const chosen: CommuteStation[] = JSON.parse(key);
    const fetchBoard = async (url: string) => {
      try {
        // Skip the browser cache so a manual refresh always reaches the
        // route handler; its own short cache is what protects the upstreams.
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return null;
        return (await response.json()) as Departures;
      } catch {
        return null;
      }
    };
    if (!chosen.length) {
      setBoards([]);
      setFailed(false);
      return;
    }
    const results = await Promise.all(
      chosen.map(async (station) => {
        const board = await fetchBoard(endpointFor(station));
        if (!board) return null;
        // Filtering happens here rather than server-side so every household
        // shares one cached upstream response regardless of their preferences.
        // The walk time rides along so departures can carry leave-by hints.
        return {
          ...board,
          departures: filterDepartures(board.departures, station).map(
            (departure) =>
              station.walkMinutes
                ? { ...departure, walk: station.walkMinutes }
                : departure,
          ),
        };
      }),
    );
    if (keyRef.current !== key) return;
    const good = results.filter((board): board is Departures => Boolean(board));
    // Keep the previous board on a total failure rather than blanking the wall.
    if (good.length) setBoards(good);
    setFailed(good.length < results.length);
    // Say so when any board is the upstream's last known state rather than live.
    setStale(good.some((board) => board.stale));
    if (good.length) {
      setUpdatedAt(new Date());
      // The oldest board bounds how current the data actually is.
      setDataAt(
        new Date(
          Math.min(...good.map((board) => board.fetchedAt ?? Date.now())),
        ),
      );
    }
  }, [key]);

  const [alerts, setAlerts] = useState<TransitAlert[]>([]);
  const [alertsStale, setAlertsStale] = useState(false);
  const loadAlerts = useCallback(async () => {
    const chosen: CommuteStation[] = JSON.parse(key);
    const subway = chosen.filter((station) => station.system === "subway");
    if (!subway.length) {
      setAlerts([]);
      setAlertsStale(false);
      return;
    }
    try {
      const response = await fetch(
        `/api/subway/alerts?stations=${subway
          .map((station) => encodeURIComponent(station.id))
          .join(",")}`,
        { cache: "no-store" },
      );
      if (keyRef.current !== key) return;
      if (!response.ok) {
        // Without an answer for the current list, alerts for stations since
        // removed must not linger on the strip.
        setAlerts([]);
        setAlertsStale(false);
        return;
      }
      const data = (await response.json()) as {
        alerts?: TransitAlert[];
        stale?: boolean;
      };
      if (keyRef.current !== key) return;
      // A route filtered off every board is not worth a banner either.
      const chosenLines = subway.flatMap((station) => station.lines);
      const showAll = subway.some((station) => !station.lines.length);
      setAlerts(
        (data.alerts ?? []).filter(
          (alert) =>
            showAll ||
            alert.routes.some((route) => chosenLines.includes(route)),
        ),
      );
      setAlertsStale(Boolean(data.stale));
    } catch {
      // Keep the previous alerts until a load succeeds.
    }
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    void loadAlerts();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadAlerts();
    }, ALERT_REFRESH);
    return () => clearInterval(timer);
  }, [hydrated, loadAlerts]);

  const home = stations.find((station) => station.lat && station.lon) ?? null;
  const homeAt = home ? `${home.lat},${home.lon}` : "";

  const loadWeather = useCallback(async () => {
    // The first station with a known location is treated as home.
    const query = homeAt
      ? `?lat=${homeAt.split(",")[0]}&lon=${homeAt.split(",")[1]}`
      : "";
    try {
      const response = await fetch(`/api/weather${query}`, {
        cache: "no-store",
      });
      if (response.ok) {
        setWeather((await response.json()) as Weather);
        setWeatherMissed(false);
      } else setWeatherMissed(true);
    } catch {
      // Leave the last reading in place; the flag only matters before one.
      setWeatherMissed(true);
    }
  }, [homeAt]);

  useEffect(() => {
    if (!hydrated) return;
    void loadTrains();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadTrains();
    }, TRAIN_REFRESH);
    const focus = () => void loadTrains();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [hydrated, loadTrains]);

  useEffect(() => {
    if (!hydrated) return;
    void loadWeather();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadWeather();
    }, WEATHER_REFRESH);
    return () => clearInterval(timer);
  }, [hydrated, loadWeather]);

  useEffect(() => {
    const clock = setInterval(() => {
      if (document.visibilityState === "visible")
        setNow(Math.floor(Date.now() / 1000));
    }, 5000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    const row = trains.current;
    if (!row) return;
    // Roughly the width one departure needs to stay readable at each size.
    const each = display ? 300 : 210;
    const measure = () =>
      setCapacity(
        Math.max(1, Math.min(6, Math.floor(row.clientWidth / each) || 1)),
      );
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    measure();
    return () => observer.disconnect();
  }, [display]);

  async function refreshNow() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([loadTrains(), loadWeather(), loadAlerts()]);
    } finally {
      setRefreshing(false);
    }
  }

  // Interleave the systems so one busy station cannot crowd the other out.
  const departures = useMemo(() => {
    // Never show fewer slots than there are stations: a stop you deliberately
    // added should appear even if that means narrower chips.
    const limit = Math.max(capacity, Math.min(boards.length, MAX_STATIONS));
    const lists = boards.map((board) =>
      // A train that has already gone should leave the board even if the next
      // poll has not landed yet.
      board.departures.filter((departure) => !hasDeparted(departure, now)),
    );
    const mixed: Departure[] = [];
    for (let round = 0; mixed.length < limit && round < 12; round += 1)
      for (const list of lists) {
        const next = list[round];
        if (next && mixed.length < limit) mixed.push(next);
      }
    return mixed;
  }, [boards, capacity, now]);

  const WeatherIcon = weather ? icons[weather.icon] : Cloud;
  const stationNames = boards.map((board) => board.station).join(" · ");
  const configured = stations.length > 0;

  return (
    <section
      className={display ? "commute-strip commute-wall" : "commute-strip"}
      aria-label="Weather and departures"
    >
      <div className="commute-weather">
        <WeatherIcon aria-hidden="true" />
        {weather ? (
          <div className="commute-weather-copy">
            <strong>{weather.temperature}°</strong>
            <small>
              {weather.description}
              {Math.abs(weather.feelsLike - weather.temperature) >= 3
                ? ` · feels ${weather.feelsLike}°`
                : ""}
              {weather.high !== null && weather.low !== null
                ? ` · H ${weather.high}° L ${weather.low}°`
                : ""}
              {weather.precipitation !== null && weather.precipitation >= 20
                ? ` · ${weather.precipitation}% ${
                    weather.icon === "snow" ? "snow" : "rain"
                  }`
                : ""}
              {weather.stale ? " · not live" : ""}
            </small>
          </div>
        ) : (
          <div className="commute-weather-copy">
            <strong>—</strong>
            <small>{weatherMissed ? "Weather unavailable" : "Weather loading"}</small>
          </div>
        )}
      </div>

      <div className="commute-trains" ref={trains}>
        {departures.map((departure) => {
          const leave = leaveInMinutes(departure, now);
          // With a walk time set, urgency means "time to leave", not
          // "train arriving": a train two minutes out that you cannot reach
          // is not the one to run for.
          const due =
            !departure.status &&
            (departure.walk
              ? leave !== null && leave >= 0 && leave <= 1
              : (minutesUntil(departure, now) ?? 9) <= 1);
          // Negative leave time means the walk is longer than the countdown:
          // the train still runs, but not for you.
          const missed = leave !== null && leave < 0;
          return (
            <div
              className={
                due
                  ? "commute-train commute-due"
                  : missed
                    ? "commute-train commute-missed"
                    : "commute-train"
              }
              key={departure.id}
            >
              <span
                className="commute-badge"
                style={badgeStyle(departure.colors)}
                aria-hidden="true"
              >
                {departure.line}
              </span>
              <div className="commute-train-copy">
                <strong title={departure.headsign}>
                  {departure.headsign
                    .replace(/World Trade Cent(?:er|re)/gi, "WTC")
                    .replace(/33rd (?:Street|St)(?: via Hoboken)?/gi, "33rd St")
                    .replace(/^To /i, "")}
                </strong>
                <small>
                  <span className="commute-origin">{departure.origin}</span>
                  {departure.line !== "PATH" && departure.note
                    ? ` · ${departure.note}`
                    : ""}
                  {leave !== null
                    ? leave >= 0
                      ? ` · leave ${leave <= 1 ? "now" : `in ${leave} min`}`
                      : " · too late to walk it"
                    : ""}
                </small>
              </div>
              <span
                className={
                  departure.status
                    ? "commute-when commute-late"
                    : "commute-when"
                }
              >
                {when(departure, now)}
              </span>
            </div>
          );
        })}
        {!departures.length && (
          <p className="commute-empty">
            <TrainFront size={16} aria-hidden="true" />
            {configured
              ? failed
                ? "Departures are unavailable right now."
                : "No trains listed at the moment."
              : "Pick your stations to see departures."}
          </p>
        )}
      </div>

      <div className="commute-actions">
        {(((stale || failed) && !!departures.length) ||
          (alertsStale && !!alerts.length)) && (
          <span
            className="commute-stale"
            title={
              failed
                ? "One of your stations could not be reached; showing what did load."
                : stale
                  ? "The agency feed is unreachable, so these are the last known times."
                  : "The alerts feed is unreachable, so these may be out of date."
            }
          >
            <CloudOff size={14} aria-hidden="true" />
            <span>Not live</span>
          </span>
        )}
        <button
          className="commute-icon"
          onClick={() => void refreshNow()}
          disabled={refreshing}
          aria-label="Refresh weather and departures"
          title={
            // Stale boards are only as current as the server's last good
            // fetch, so claiming the client's poll time would be a lie.
            stale && dataAt
              ? `As of ${dataAt.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : updatedAt
                ? `Updated ${updatedAt.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                  })}`
                : "Refresh weather and departures"
          }
        >
          <RefreshCw size={16} className={refreshing ? "commute-spin" : ""} />
        </button>
        {!display && (
          <button
            className="commute-icon"
            onClick={() => setOpen(true)}
            aria-label="Choose your stations"
            title={stationNames || "Choose your stations"}
          >
            <Settings size={16} />
          </button>
        )}
      </div>

      {!!alerts.length && (
        <div className="commute-alerts">
          {alerts.slice(0, display ? 3 : 2).map((alert) => (
            <p
              className={
                alert.planned
                  ? "commute-alert commute-planned"
                  : "commute-alert"
              }
              key={alert.id}
              title={alert.text}
            >
              <TriangleAlert size={13} aria-hidden="true" />
              {alert.routes.slice(0, 4).map((route) => (
                <span
                  key={route}
                  className="commute-badge"
                  style={badgeStyle([subwayColor(route)])}
                >
                  {route}
                </span>
              ))}
              {alert.planned && (
                <span className="commute-alert-tag">Planned</span>
              )}
              <span className="commute-alert-text">{alert.text}</span>
            </p>
          ))}
        </div>
      )}

      <AnimatePresence>
        {open && (
          <StationDialog
            stations={stations}
            onSave={(next) => {
              persist(next);
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function StationDialog({
  stations,
  onSave,
  onClose,
}: {
  stations: CommuteStation[];
  onSave: (next: CommuteStation[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CommuteStation[]>(stations);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CommuteStation[]>([]);
  const [routes, setRoutes] = useState<Record<string, string[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  // Which lines and headsigns each station can actually offer, keyed by
  // "system:id". Loaded on demand when a row is opened.
  const [options, setOptions] = useState<Record<string, StationOptions>>({});

  // An entry saved under the older settings shape has an id but no name yet.
  // Fill it in so the list never shows a bare GTFS id like "A32".
  const unnamed = draft
    .filter((station) => station.system === "subway" && !station.name)
    .map((station) => station.id)
    .join(",");
  useEffect(() => {
    if (!unnamed) return;
    let active = true;
    void Promise.all(
      unnamed.split(",").map((id) =>
        fetch(`/api/subway/stations?id=${encodeURIComponent(id)}`)
          .then((response) => (response.ok ? response.json() : null))
          .then(
            (data: { stations?: SubwayStation[] } | null) =>
              data?.stations?.[0] ?? null,
          )
          .catch(() => null),
      ),
    ).then((found) => {
      if (!active) return;
      const byId = new Map<string, SubwayStation>();
      for (const station of found) if (station) byId.set(station.id, station);
      if (!byId.size) return;
      setDraft((current) =>
        current.map((station) => {
          const match = byId.get(station.id);
          return match && station.system === "subway" && !station.name
            ? { ...station, name: match.name, lat: match.lat, lon: match.lon }
            : station;
        }),
      );
    });
    return () => {
      active = false;
    };
  }, [unnamed]);

  // One search box covers both systems: PATH is a thirteen-entry table held on
  // the client, the subway is searched on the server.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setMatches([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      void fetch(`/api/subway/stations?q=${encodeURIComponent(term)}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { stations?: SubwayStation[] } | null) => {
          if (!active) return;
          const found = data?.stations ?? [];
          setRoutes(Object.fromEntries(found.map((s) => [s.id, s.routes])));
          setMatches([
            ...searchPathStations(term),
            ...found.map((station) => ({
              system: "subway" as const,
              id: station.id,
              name: station.name,
              lat: station.lat,
              lon: station.lon,
              lines: [],
              headsigns: [],
              walkMinutes: 0,
            })),
          ]);
        })
        .catch(() => {
          // A failed subway lookup should not hide the PATH matches.
          if (active) setMatches(searchPathStations(term));
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  // The options differ per system. The subway knows its routes and platform
  // labels up front; PATH has one line, so its destinations have to come from
  // the live board. Whatever is already saved is folded in, so a filter set
  // for a train that is not running right now never silently disappears.
  useEffect(() => {
    if (!expanded || options[expanded]) return;
    const station = draft.find((s) => stationKeyOf(s) === expanded);
    if (!station) return;
    let active = true;
    const saved = { lines: station.lines, headsigns: station.headsigns };
    const load = async (): Promise<StationOptions> => {
      if (station.system === "subway") {
        const response = await fetch(
          `/api/subway/stations?id=${encodeURIComponent(station.id)}`,
        );
        const data = response.ok
          ? ((await response.json()) as { stations?: SubwayStation[] })
          : null;
        const found = data?.stations?.[0];
        return {
          lines: found?.routes ?? [],
          headsigns: found ? [found.north, found.south] : [],
        };
      }
      const response = await fetch(
        `/api/path?station=${encodeURIComponent(station.id)}`,
      );
      const data = response.ok ? ((await response.json()) as Departures) : null;
      return {
        lines: [],
        headsigns: [
          ...new Set((data?.departures ?? []).map((d) => d.headsign)),
        ],
      };
    };
    void load()
      .catch(() => ({ lines: [], headsigns: [] }) as StationOptions)
      .then((found) => {
        if (!active) return;
        setOptions((current) => ({
          ...current,
          [expanded]: {
            lines: [...new Set([...found.lines, ...saved.lines])],
            headsigns: [...new Set([...found.headsigns, ...saved.headsigns])],
          },
        }));
      });
    return () => {
      active = false;
    };
  }, [expanded, draft, options]);

  function clearFilter(index: number, axis: "lines" | "headsigns") {
    setDraft((current) =>
      current.map((station, i) =>
        i === index ? { ...station, [axis]: [] } : station,
      ),
    );
  }

  function setFilter(
    index: number,
    axis: "lines" | "headsigns",
    all: string[],
    value: string,
  ) {
    setDraft((current) =>
      current.map((station, i) =>
        i === index
          ? { ...station, [axis]: toggleFilter(station[axis], all, value) }
          : station,
      ),
    );
  }

  function setWalk(index: number, value: string) {
    const minutes = Math.max(0, Math.min(60, Math.floor(Number(value)) || 0));
    setDraft((current) =>
      current.map((station, i) =>
        i === index ? { ...station, walkMinutes: minutes } : station,
      ),
    );
  }

  function add(station: CommuteStation) {
    setDraft((current) =>
      current.some((other) => sameStation(other, station)) ||
      current.length >= MAX_STATIONS
        ? current
        : [...current, station],
    );
    setQuery("");
    setMatches([]);
  }
  function remove(index: number) {
    setDraft((current) => current.filter((_, i) => i !== index));
  }
  function move(index: number, by: number) {
    setDraft((current) => {
      const target = index + by;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const full = draft.length >= MAX_STATIONS;

  return (
    <PaperDialog
      onClose={onClose}
      className="entry-dialog commute-dialog"
      aria-labelledby="commute-title"
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">GETTING OUT THE DOOR</p>
          <h2 id="commute-title">Your stations</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      <p className="commute-hint">
        Add the PATH and subway stops you actually use. Saved on this device, so
        the TV and your phone can each show their own. The weather follows the
        first station in the list.
      </p>

      <label>
        Add a station
        <input
          value={query}
          placeholder="Search PATH or subway stations…"
          disabled={full}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {full && (
        <p className="commute-note">
          That is {MAX_STATIONS} stations — remove one to add another.
        </p>
      )}
      {matches.length > 0 && (
        <ul className="commute-results">
          {matches.map((station) => {
            const already = draft.some((other) => sameStation(other, station));
            return (
              <li key={`${station.system}:${station.id}`}>
                <button
                  type="button"
                  disabled={already}
                  onClick={() => add(station)}
                >
                  <span>
                    {station.name}
                    {already ? " · already added" : ""}
                  </span>
                  <small>
                    {station.system === "path"
                      ? "PATH"
                      : `Subway · ${(routes[station.id] ?? []).join(" ")}`}
                  </small>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ul className="commute-list">
        {draft.map((station, index) => {
          const id = stationKeyOf(station);
          const label = station.name || station.id;
          const open = expanded === id;
          const choices = options[id];
          const filtered = station.lines.length || station.headsigns.length;
          return (
            <li key={id} className={open ? "commute-row open" : "commute-row"}>
              <div className="commute-row-head">
                <span
                  className="commute-list-tag"
                  data-system={station.system}
                  aria-hidden="true"
                >
                  {station.system === "path" ? "PATH" : "MTA"}
                </span>
                <span className="commute-list-name">
                  {label}
                  {index === 0 && <small>weather</small>}
                  {filtered && !open ? <small>filtered</small> : null}
                </span>
                <button
                  type="button"
                  className={open ? "commute-expand open" : "commute-expand"}
                  aria-expanded={open}
                  aria-label={`Choose which trains to show at ${label}`}
                  onClick={() => setExpanded(open ? null : id)}
                >
                  <ChevronDown size={15} />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${label} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${label} down`}
                  disabled={index === draft.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={15} />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  onClick={() => remove(index)}
                >
                  <X size={15} />
                </button>
              </div>

              {open && (
                <div className="commute-filters">
                  <div className="commute-chiprow commute-walkrow">
                    <span className="commute-legend">Walk time</span>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      inputMode="numeric"
                      value={station.walkMinutes || ""}
                      placeholder="—"
                      aria-label={`Minutes to walk to ${label}`}
                      onChange={(event) => setWalk(index, event.target.value)}
                    />
                    <small>
                      minutes to this station — departures gain a “leave in …”
                      hint
                    </small>
                  </div>
                  {!choices && (
                    <p className="commute-loading">Loading trains…</p>
                  )}
                  {choices && !!choices.lines.length && (
                    <ChipRow
                      legend="Routes"
                      all={choices.lines}
                      chosen={station.lines}
                      onToggle={(value) =>
                        setFilter(index, "lines", choices.lines, value)
                      }
                      onClear={() => clearFilter(index, "lines")}
                    />
                  )}
                  {choices && !!choices.headsigns.length && (
                    <ChipRow
                      legend={
                        station.system === "path" ? "Trains to" : "Direction"
                      }
                      all={choices.headsigns}
                      chosen={station.headsigns}
                      onToggle={(value) =>
                        setFilter(index, "headsigns", choices.headsigns, value)
                      }
                      onClear={() => clearFilter(index, "headsigns")}
                    />
                  )}
                  {choices &&
                    !choices.lines.length &&
                    !choices.headsigns.length && (
                      <p className="commute-loading">
                        No trains listed right now, so there is nothing to
                        narrow down yet.
                      </p>
                    )}
                </div>
              )}
            </li>
          );
        })}
        {!draft.length && (
          <li className="commute-list-empty">
            No stations yet. Search above to add one.
          </li>
        )}
      </ul>

      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button" onClick={() => onSave(draft)}>
          Save
        </button>
      </div>
    </PaperDialog>
  );
}

/**
 * A row of filter chips led by an explicit All. Without All, "no filter" would
 * have to render as every chip lit, and clicking one would then read as
 * removing it -- the opposite of what tapping your destination should do.
 */
function ChipRow({
  legend,
  all,
  chosen,
  onToggle,
  onClear,
}: {
  legend: string;
  all: string[];
  chosen: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const everything = !chosen.length;
  return (
    <div className="commute-chiprow">
      <span className="commute-legend">{legend}</span>
      <div className="commute-chips">
        <button
          type="button"
          className={everything ? "commute-chip on" : "commute-chip"}
          aria-pressed={everything}
          onClick={onClear}
        >
          All
        </button>
        {all.map((value) => {
          const on = chosen.includes(value);
          return (
            <button
              key={value}
              type="button"
              className={on ? "commute-chip on" : "commute-chip"}
              aria-pressed={on}
              onClick={() => onToggle(value)}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}
