import { fetchWithTimeout, withCache } from "@/lib/cache";
import { buildSubwayDepartures } from "@/lib/transit";
import {
  feedUrl,
  feedsForStation,
  findStation,
  readFeed,
  type Arrival,
} from "@/lib/subway-data";

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
  // The board is only as fresh as its oldest feed.
  let fetchedAt = Date.now();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    ok += 1;
    stale = stale || !result.value.fresh;
    fetchedAt = Math.min(fetchedAt, result.value.at);
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
      fetchedAt,
    },
    { headers: { "Cache-Control": "public, max-age=15, s-maxage=20" } },
  );
}
