import { fetchWithTimeout, withCache } from "@/lib/cache";
import { parsePath, pathStations } from "@/lib/transit";

// This is the endpoint the RidePATH app uses. It is not a documented public
// API and the Port Authority can change it without notice, so treat a failure
// here as expected: the widget hides itself rather than breaking the board.
const FEED = "https://www.panynj.gov/bin/portauthority/ridepath.json";

async function load(): Promise<unknown> {
  const response = await fetchWithTimeout(FEED);
  if (!response.ok)
    throw new Error(`PATH upstream returned ${response.status}`);
  return response.json();
}

export async function GET(request: Request) {
  const requested = (
    new URL(request.url).searchParams.get("station") ?? "JSQ"
  ).toUpperCase();
  if (!(requested in pathStations))
    return Response.json(
      { error: `Unknown PATH station "${requested}".` },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  try {
    // One upstream request covers all thirteen stations, so the cache key is
    // deliberately shared and the per-station filtering happens after.
    const { value, fresh, at } = await withCache("path", 20 * 1000, load);
    // PATH counts down in seconds rather than giving a clock time, so the
    // countdown has to be anchored to when the payload was fetched. Anchoring
    // it to now instead would push every arrival later by the cache age, and
    // would leave a stale board claiming trains are still on their way.
    const fetchedAtSeconds = Math.floor(at / 1000);
    return Response.json(
      {
        ...parsePath(value, requested, fetchedAtSeconds),
        stale: !fresh,
        fetchedAt: at,
      },
      { headers: { "Cache-Control": "public, max-age=15, s-maxage=20" } },
    );
  } catch {
    return Response.json(
      { error: "PATH times are unavailable right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
