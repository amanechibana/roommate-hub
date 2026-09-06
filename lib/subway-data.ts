// The full subway station list and the lookups over it.
//
// This module is deliberately separate from lib/transit.ts: the station file is
// around 80KB, and lib/transit.ts is imported by a client component. Keeping
// the data here means only the route handlers pull it in, so it never reaches
// the browser. Search happens on the server via app/api/subway/stations.

import stations from "./subway-stations.json";
import { stationKey, type SubwayStation } from "./transit";

export const subwayStations: SubwayStation[] = stations as SubwayStation[];

export function findStation(id: string): SubwayStation | null {
  return subwayStations.find((station) => station.id === id) ?? null;
}

/** Case- and punctuation-insensitive station search for the picker. */
export function searchStations(query: string, limit = 12): SubwayStation[] {
  const needle = stationKey(query);
  if (!needle) return [];
  const scored: { station: SubwayStation; score: number }[] = [];
  for (const station of subwayStations) {
    const name = stationKey(station.name);
    const index = name.indexOf(needle);
    if (index === -1) continue;
    // Prefer matches at the start of the name, then shorter names.
    scored.push({ station, score: index * 100 + name.length });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((entry) => entry.station);
}

/**
 * The realtime feeds a station needs. The MTA splits realtime data by line
 * group, so a transfer station may require more than one.
 */
export function feedsForStation(station: SubwayStation): string[] {
  const feeds = new Set<string>();
  for (const route of station.routes) {
    if (/^[1-7]$/.test(route)) feeds.add("gtfs");
    else if ("ACE".includes(route) && route.length === 1) feeds.add("gtfs-ace");
    else if ("BDFM".includes(route) && route.length === 1)
      feeds.add("gtfs-bdfm");
    else if (route === "G") feeds.add("gtfs-g");
    else if (route === "J" || route === "Z") feeds.add("gtfs-jz");
    else if ("NQRW".includes(route) && route.length === 1)
      feeds.add("gtfs-nqrw");
    else if (route === "L") feeds.add("gtfs-l");
    else if (route === "SIR") feeds.add("gtfs-si");
    else if (route === "S") {
      // "S" covers three unrelated shuttles; the stop id says which.
      if (station.id.startsWith("H")) feeds.add("gtfs-ace");
      else if (station.id === "901" || station.id === "902") feeds.add("gtfs");
      else feeds.add("gtfs-bdfm");
    }
  }
  return [...feeds];
}

export function feedUrl(feed: string): string {
  return `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F${feed}`;
}
