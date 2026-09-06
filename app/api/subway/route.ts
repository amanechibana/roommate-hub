import { fetchWithTimeout, withCache } from "@/lib/cache";
import { fields, integer, message, messages, text } from "@/lib/protobuf";
import { buildSubwayDepartures } from "@/lib/transit";
import { feedUrl, feedsForStation, findStation } from "@/lib/subway-data";

type Arrival = { route: string; stopId: string; time: number };

// Field numbers from the GTFS-realtime spec:
//   FeedMessage.entity = 2, FeedEntity.trip_update = 3,
//   TripUpdate.trip = 1 / .stop_time_update = 2,
//   TripDescriptor.route_id = 5,
//   StopTimeUpdate.arrival = 2 / .departure = 3 / .stop_id = 4,
//   StopTimeEvent.time = 2
function readFeed(buffer: Uint8Array): Arrival[] {
  const arrivals: Arrival[] = [];
  for (const entity of messages(fields(buffer), 2)) {
    const update = message(entity, 3);
    if (!update) continue;
    const trip = message(update, 1);
    const route = trip ? text(trip, 5) : "";
    if (!route) continue;
    for (const stop of messages(update, 2)) {
      const stopId = text(stop, 4);
      if (!stopId) continue;
      // Terminals often carry only a departure time, so fall back to it.
      const event = message(stop, 2) ?? message(stop, 3);
      const time = event ? integer(event, 2) : null;
      if (time) arrivals.push({ route, stopId, time });
    }
  }
  return arrivals;
}

async function loadFeed(feed: string): Promise<Arrival[]> {
  const response = await fetchWithTimeout(feedUrl(feed));
  if (!response.ok)
    throw new Error(`MTA feed ${feed} returned ${response.status}`);
  return readFeed(new Uint8Array(await response.arrayBuffer()));
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("station") ?? "";
  const station = findStation(id);
  if (!station)
    return Response.json(
      { error: `Unknown subway station "${id}".` },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );

  const feeds = feedsForStation(station);
  // A transfer station needs several feeds; one failing should not lose the
  // rest, so gather what succeeded and only give up if nothing did.
  const results = await Promise.allSettled(
    feeds.map((feed) =>
      withCache(`subway:${feed}`, 20 * 1000, () => loadFeed(feed)),
    ),
  );
  const arrivals: Arrival[] = [];
  let stale = false;
  let ok = 0;
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    ok += 1;
    stale = stale || !result.value.fresh;
    arrivals.push(...result.value.value);
  }
  if (!ok)
    return Response.json(
      { error: "Subway times are unavailable right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );

  const now = Math.floor(Date.now() / 1000);
  return Response.json(
    {
      ...buildSubwayDepartures(arrivals, station, now),
      stale: stale || ok < feeds.length,
      fetchedAt: Date.now(),
    },
    { headers: { "Cache-Control": "public, max-age=15, s-maxage=20" } },
  );
}
