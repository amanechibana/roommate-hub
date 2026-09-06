// Shared shapes and pure helpers for the weather and departures widget.
//
// Everything here is deterministic so it can be unit tested: the route
// handlers do the network calls and hand the payloads to these functions.
//
// This module is imported by a client component, so it must stay small. The
// subway station list lives in lib/subway-data.ts for that reason.

export type Departure = {
  /** Stable enough to use as a React key within one response. */
  id: string;
  /** Badge text: a subway route letter/number, or "PATH". */
  line: string;
  /** Hex colours without a leading "#". PATH trains can carry two. */
  colors: string[];
  /** Primary line: where the train is heading. */
  headsign: string;
  /** The station this train leaves from, shown on every departure. */
  origin: string;
  /** Extra context after the origin; PATH uses it for the trip direction. */
  note: string;
  /** Whole minutes away when the feed was read, or null if it gave no time. */
  minutes: number | null;
  /**
   * Absolute arrival time, in unix seconds. The board polls every 30 seconds,
   * so counting down from this locally keeps the minutes honest between
   * refreshes instead of freezing on the value the server last computed.
   */
  at: number | null;
  /** Feed-supplied status such as "Delayed"; empty when running normally. */
  status: string;
};

export type Departures = {
  station: string;
  system: "PATH" | "Subway";
  departures: Departure[];
  /** Unix seconds the upstream feed was generated, when it says. */
  updated: number | null;
  /** True when the upstream failed and these are the last known times. */
  stale?: boolean;
};

export type Weather = {
  temperature: number;
  feelsLike: number;
  high: number | null;
  low: number | null;
  description: string;
  /** Matches the icon set in components/commute-strip.tsx. */
  icon: "sun" | "cloud-sun" | "cloud" | "rain" | "snow" | "storm" | "fog";
  precipitation: number | null;
};

export type SubwayStation = {
  id: string;
  name: string;
  borough: string;
  routes: string[];
  north: string;
  south: string;
  lat: number;
  lon: number;
};

export const pathStations: Record<string, string> = {
  NWK: "Newark",
  HAR: "Harrison",
  JSQ: "Journal Square",
  GRV: "Grove Street",
  NEW: "Newport",
  EXP: "Exchange Place",
  HOB: "Hoboken",
  WTC: "World Trade Center",
  CHR: "Christopher Street",
  "09S": "9th Street",
  "14S": "14th Street",
  "23S": "23rd Street",
  "33S": "33rd Street",
};

/** Approximate station locations, used to point the weather at your area. */
export const pathLocations: Record<string, { lat: number; lon: number }> = {
  NWK: { lat: 40.7343, lon: -74.1643 },
  HAR: { lat: 40.7391, lon: -74.1556 },
  JSQ: { lat: 40.7329, lon: -74.0629 },
  GRV: { lat: 40.7195, lon: -74.0433 },
  NEW: { lat: 40.7267, lon: -74.0338 },
  EXP: { lat: 40.7166, lon: -74.0334 },
  HOB: { lat: 40.7343, lon: -74.0279 },
  WTC: { lat: 40.7126, lon: -74.0099 },
  CHR: { lat: 40.7329, lon: -74.0071 },
  "09S": { lat: 40.7345, lon: -73.9987 },
  "14S": { lat: 40.7373, lon: -73.9969 },
  "23S": { lat: 40.7429, lon: -73.9927 },
  "33S": { lat: 40.7486, lon: -73.9885 },
};

/** MTA colours, keyed by the route labels used in the station list. */
const routeColors: Record<string, string> = {
  "1": "EE352E",
  "2": "EE352E",
  "3": "EE352E",
  "4": "00933C",
  "5": "00933C",
  "6": "00933C",
  "7": "B933AD",
  A: "0039A6",
  C: "0039A6",
  E: "0039A6",
  B: "FF6319",
  D: "FF6319",
  F: "FF6319",
  M: "FF6319",
  G: "6CBE45",
  J: "996633",
  Z: "996633",
  L: "A7A9AC",
  N: "FCCC0A",
  Q: "FCCC0A",
  R: "FCCC0A",
  W: "FCCC0A",
  S: "808183",
  SIR: "0039A6",
};

export function subwayColor(route: string): string {
  // Realtime feeds use FS/GS/H for the three shuttles and SI for the railway.
  if (route === "FS" || route === "GS" || route === "H") return routeColors.S;
  if (route === "SI") return routeColors.SIR;
  return routeColors[route] ?? "6E6E73";
}

/** One stop on the household's departure board. */
export type CommuteStation = {
  system: "path" | "subway";
  /** PATH station code, or GTFS stop id for the subway. */
  id: string;
  name: string;
  lat: number;
  lon: number;
  /**
   * Which trains to show. Both lists are include-lists matched against a
   * departure's `line` and `headsign`; an empty list means "everything", so a
   * station with no preferences saved behaves exactly as it always did.
   *
   * For the subway `lines` are routes (A, C, E) and `headsigns` are the
   * platform labels (Uptown, Downtown). PATH has only one line, so its
   * `headsigns` are the destinations (World Trade Center, 33rd Street).
   */
  lines: string[];
  headsigns: string[];
};

/** Enough stops to cover a household without flooding the band. */
export const MAX_STATIONS = 6;

/**
 * Folds a station name or query down for matching. Ordinal suffixes are
 * dropped because the two systems disagree: PATH writes "14th Street" while
 * the MTA writes "14 St", and someone typing either should find both.
 */
export function stationKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1")
    .trim();
}

export function pathStation(code: string): CommuteStation | null {
  const name = pathStations[code];
  const at = pathLocations[code];
  if (!name || !at) return null;
  return {
    system: "path",
    id: code,
    name,
    lat: at.lat,
    lon: at.lon,
    lines: [],
    headsigns: [],
  };
}

export function defaultStations(): CommuteStation[] {
  const home = pathStation("JSQ");
  return home ? [home] : [];
}

export function searchPathStations(query: string, limit = 4): CommuteStation[] {
  const needle = stationKey(query);
  if (!needle) return [];
  return Object.keys(pathStations)
    .filter((code) => stationKey(pathStations[code]).includes(needle))
    .map((code) => pathStation(code))
    .filter((station): station is CommuteStation => station !== null)
    .slice(0, limit);
}

export function sameStation(a: CommuteStation, b: CommuteStation): boolean {
  return a.system === b.system && a.id === b.id;
}

function readFilter(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (entry): entry is string => typeof entry === "string" && entry !== "",
      ),
    ),
  ];
}

function readStation(value: unknown): CommuteStation | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CommuteStation>;
  if (raw.system !== "path" && raw.system !== "subway") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  const lines = readFilter(raw.lines);
  const headsigns = readFilter(raw.headsigns);
  // PATH names and locations are always rebuilt from the built-in table.
  if (raw.system === "path") {
    const station = pathStation(raw.id);
    return station ? { ...station, lines, headsigns } : null;
  }
  return {
    system: "subway",
    id: raw.id,
    // A blank name means the entry still needs looking up; the picker repairs
    // it from the station endpoint rather than showing a bare GTFS id.
    name: typeof raw.name === "string" ? raw.name : "",
    lat: Number.isFinite(raw.lat) ? (raw.lat as number) : 0,
    lon: Number.isFinite(raw.lon) ? (raw.lon as number) : 0,
    lines,
    headsigns,
  };
}

/**
 * Reads the saved station list, tolerating a corrupt store and upgrading the
 * original single-PATH-plus-single-subway shape into the managed list.
 */
export function parseStoredStations(raw: string | null): CommuteStation[] {
  if (!raw) return defaultStations();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultStations();
  }
  if (!parsed || typeof parsed !== "object") return defaultStations();

  const record = parsed as Record<string, unknown>;
  if (Array.isArray(record.stations)) {
    const stations: CommuteStation[] = [];
    for (const entry of record.stations) {
      const station = readStation(entry);
      if (station && !stations.some((other) => sameStation(other, station)))
        stations.push(station);
    }
    return stations.slice(0, MAX_STATIONS);
  }

  // Legacy shape: { path: "JSQ", subway: "A32" }. Keep both choices; the
  // subway name and location get filled in on the next lookup.
  const upgraded: CommuteStation[] = [];
  if (typeof record.path === "string") {
    const station = pathStation(record.path);
    if (station) upgraded.push(station);
  }
  if (typeof record.subway === "string" && record.subway)
    upgraded.push({
      system: "subway",
      id: record.subway,
      name: "",
      lat: 0,
      lon: 0,
      lines: [],
      headsigns: [],
    });
  return upgraded;
}

/**
 * Applies a station's include-lists to its board. An empty list matches
 * everything, which keeps "no preference" and "all selected" identical.
 */
export function filterDepartures(
  departures: Departure[],
  station: Pick<CommuteStation, "lines" | "headsigns">,
): Departure[] {
  return departures.filter(
    (departure) =>
      (!station.lines.length || station.lines.includes(departure.line)) &&
      (!station.headsigns.length ||
        station.headsigns.includes(departure.headsign)),
  );
}

/**
 * Turns a chip click into the next include-list.
 *
 * An empty list means "show everything", which the picker surfaces as a
 * separate All chip. Clicking a named option from that state selects just that
 * option, because someone who taps "33rd Street" wants trains to 33rd Street
 * rather than everything except them. Once a selection exists, clicks add and
 * remove as usual, and emptying it -- either by deselecting the last option or
 * by selecting all of them -- lands back on All.
 */
export function toggleFilter(
  current: string[],
  all: string[],
  value: string,
): string[] {
  if (!all.includes(value)) return current;
  const chosen = current.filter((v) => all.includes(v));
  if (!chosen.length) return [value];
  const next = chosen.includes(value)
    ? chosen.filter((v) => v !== value)
    : [...chosen, value];
  // Nothing selected and everything selected both mean "no filter".
  return next.length === all.length ? [] : next;
}

/**
 * Minutes to show for a departure at time `now` (unix seconds). Falls back to
 * the server's snapshot when the feed gave no absolute time.
 */
export function minutesUntil(departure: Departure, now: number): number | null {
  if (departure.at === null) return departure.minutes;
  return Math.max(0, Math.round((departure.at - now) / 60));
}

/**
 * Whether a departure has been gone long enough to drop off the board. A
 * little slack absorbs clock skew between the agency and this machine.
 */
export function hasDeparted(departure: Departure, now: number): boolean {
  return departure.at !== null && departure.at < now - 45;
}

function minutesFrom(seconds: number): number {
  return Math.max(0, Math.round(seconds / 60));
}

type PathMessage = {
  target?: string;
  secondsToArrival?: string;
  arrivalTimeMessage?: string;
  lineColor?: string;
  headSign?: string;
};
type PathFeed = {
  results?: {
    consideredStation?: string;
    destinations?: { label?: string; messages?: PathMessage[] }[];
  }[];
};

/** Normalises the RidePATH payload down to one station's departures. */
export function parsePath(
  feed: unknown,
  stationCode: string,
  now = Math.floor(Date.now() / 1000),
): Departures {
  const code = stationCode.toUpperCase();
  const results = (feed as PathFeed)?.results ?? [];
  const station = results.find(
    (entry) => entry.consideredStation?.toUpperCase() === code,
  );
  const departures: Departure[] = [];
  for (const destination of station?.destinations ?? []) {
    const direction =
      destination.label === "ToNY"
        ? "To New York"
        : destination.label === "ToNJ"
          ? "To New Jersey"
          : (destination.label ?? "");
    for (const message of destination.messages ?? []) {
      const seconds = Number(message.secondsToArrival);
      const label = (message.arrivalTimeMessage ?? "").trim();
      // The feed sends free text like "Delayed" alongside a countdown, so
      // trust the seconds for ordering and surface the text separately.
      const known = Number.isFinite(seconds) && seconds >= 0;
      departures.push({
        id: `${code}-${direction}-${message.target ?? ""}-${departures.length}`,
        line: "PATH",
        colors: (message.lineColor ?? "")
          .split(",")
          .map((color) => color.trim())
          .filter(Boolean),
        headsign: message.headSign ?? pathStations[message.target ?? ""] ?? "",
        origin: pathStations[code] ?? code,
        note: direction,
        minutes: known ? minutesFrom(seconds) : null,
        at: known ? now + Math.round(seconds) : null,
        status: /^\d+\s*min/i.test(label) || label === "" ? "" : label,
      });
    }
  }
  departures.sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity));
  return {
    station: pathStations[code] ?? code,
    system: "PATH",
    departures,
    updated: null,
  };
}

/**
 * Turns decoded GTFS-realtime trip updates into departures for one station.
 * `arrivals` come from the protobuf walk in the subway route handler.
 */
export function buildSubwayDepartures(
  arrivals: { route: string; stopId: string; time: number }[],
  station: SubwayStation,
  now: number,
): Departures {
  const departures: Departure[] = [];
  for (const arrival of arrivals) {
    // Realtime stop ids are the station id plus a direction suffix.
    if (!arrival.stopId.startsWith(station.id)) continue;
    const suffix = arrival.stopId.slice(station.id.length);
    if (suffix !== "N" && suffix !== "S") continue;
    const seconds = arrival.time - now;
    // Drop trains that have already gone; keep a little slack for clock skew.
    if (seconds < -30) continue;
    departures.push({
      id: `${arrival.stopId}-${arrival.route}-${arrival.time}`,
      line: arrival.route,
      colors: [subwayColor(arrival.route)],
      // The MTA labels platforms by where they lead ("Uptown", "Brooklyn"),
      // which is the useful headline; the station name gives it context.
      headsign: suffix === "N" ? station.north : station.south,
      origin: station.name,
      // The headsign already states the direction, so no extra context.
      note: "",
      minutes: minutesFrom(Math.max(0, seconds)),
      at: arrival.time,
      status: "",
    });
  }
  departures.sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity));
  // The same train can appear in two feeds at a transfer station.
  const seen = new Set<string>();
  const unique = departures.filter((departure) => {
    const key = departure.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    station: station.name,
    system: "Subway",
    departures: unique,
    updated: now,
  };
}

const weatherCodes: Record<number, { text: string; icon: Weather["icon"] }> = {
  0: { text: "Clear", icon: "sun" },
  1: { text: "Mostly clear", icon: "cloud-sun" },
  2: { text: "Partly cloudy", icon: "cloud-sun" },
  3: { text: "Overcast", icon: "cloud" },
  45: { text: "Fog", icon: "fog" },
  48: { text: "Freezing fog", icon: "fog" },
  51: { text: "Light drizzle", icon: "rain" },
  53: { text: "Drizzle", icon: "rain" },
  55: { text: "Heavy drizzle", icon: "rain" },
  56: { text: "Freezing drizzle", icon: "rain" },
  57: { text: "Freezing drizzle", icon: "rain" },
  61: { text: "Light rain", icon: "rain" },
  63: { text: "Rain", icon: "rain" },
  65: { text: "Heavy rain", icon: "rain" },
  66: { text: "Freezing rain", icon: "rain" },
  67: { text: "Freezing rain", icon: "rain" },
  71: { text: "Light snow", icon: "snow" },
  73: { text: "Snow", icon: "snow" },
  75: { text: "Heavy snow", icon: "snow" },
  77: { text: "Snow grains", icon: "snow" },
  80: { text: "Showers", icon: "rain" },
  81: { text: "Showers", icon: "rain" },
  82: { text: "Heavy showers", icon: "rain" },
  85: { text: "Snow showers", icon: "snow" },
  86: { text: "Snow showers", icon: "snow" },
  95: { text: "Thunderstorm", icon: "storm" },
  96: { text: "Thunderstorm", icon: "storm" },
  99: { text: "Thunderstorm", icon: "storm" },
};

export function describeWeather(code: number): {
  text: string;
  icon: Weather["icon"];
} {
  return weatherCodes[code] ?? { text: "—", icon: "cloud" };
}
