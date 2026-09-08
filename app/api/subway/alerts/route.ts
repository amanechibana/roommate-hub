import { fetchWithTimeout, withCache } from "@/lib/cache";
import {
  activeAlerts,
  alertsForRoutes,
  parseAlertsFeed,
} from "@/lib/subway-alerts";
import { findStation } from "@/lib/subway-data";

const FEED =
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json";

export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("stations") ?? "")
    .split(",")
    .filter(Boolean)
    .slice(0, 12);
  const routes = new Set<string>();
  for (const id of ids)
    for (const route of findStation(id)?.routes ?? []) routes.add(route);
  if (!routes.size)
    return Response.json(
      { alerts: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    // The cache holds the whole parsed feed, active windows included; which
    // alerts are live is decided per request, so a stale cache cannot pin
    // expired alerts or hide planned work whose window has since opened.
    const { value, fresh, at } = await withCache(
      "subway:alerts",
      5 * 60_000,
      async () => {
        const response = await fetchWithTimeout(FEED);
        if (!response.ok)
          throw new Error(`MTA alerts returned ${response.status}`);
        return parseAlertsFeed(await response.json());
      },
    );
    const now = Math.floor(Date.now() / 1000);
    return Response.json(
      {
        alerts: alertsForRoutes(activeAlerts(value, now), [...routes]),
        stale: !fresh,
        fetchedAt: at,
      },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
    );
  } catch {
    // Alerts are a nicety; an unreachable feed should read as "no alerts",
    // not take the departures board down with it.
    return Response.json(
      { alerts: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
