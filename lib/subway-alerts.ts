// Parsing for the MTA's subway alerts feed: GTFS-realtime service alerts,
// served as JSON with the MTA's "Mercury" extension fields. Only the route
// handler fetches the feed; these helpers stay pure so they can be tested.

import { normalizeSubwayRoute } from "./transit";

export type TransitAlert = {
  id: string;
  routes: string[];
  text: string;
  /** The feed's category, e.g. "Delays" or "Planned - Part Suspended". */
  kind: string;
  planned: boolean;
  /** Stated active windows, unix seconds; empty means simply in effect. */
  periods: { start?: number; end?: number }[];
};

type Translation = { text?: string; language?: string };
type FeedAlert = {
  active_period?: { start?: number; end?: number }[];
  informed_entity?: { route_id?: string }[];
  header_text?: { translation?: Translation[] };
  "transit_realtime.mercury_alert"?: { alert_type?: string };
};

/**
 * Every alert in the feed, with normalized route lists. Deliberately not
 * filtered by time: the parsed list is cached, so which alerts are active is
 * a question for each request's clock, not the parse's.
 */
export function parseAlertsFeed(feed: unknown): TransitAlert[] {
  const entities =
    (feed as { entity?: { id?: string; alert?: FeedAlert }[] })?.entity ?? [];
  const alerts: TransitAlert[] = [];
  for (const entity of entities) {
    const alert = entity?.alert;
    if (!alert) continue;
    const routes = [
      ...new Set(
        (alert.informed_entity ?? [])
          .map((informed) =>
            typeof informed?.route_id === "string"
              ? normalizeSubwayRoute(informed.route_id)
              : "",
          )
          .filter(Boolean),
      ),
    ];
    if (!routes.length) continue;
    const text = (alert.header_text?.translation ?? [])
      .find((translation) => translation.language === "en")
      ?.text // "[G]" is the feed's placeholder for a route icon.
      ?.replace(/\[(\w+)\]/g, "$1")
      .trim();
    if (!text) continue;
    const kind = alert["transit_realtime.mercury_alert"]?.alert_type ?? "";
    alerts.push({
      id: entity.id || text,
      routes,
      text,
      kind,
      planned: kind.startsWith("Planned"),
      periods: alert.active_period ?? [],
    });
  }
  return alerts;
}

/** The alerts active at `now` (unix seconds). */
export function activeAlerts(
  alerts: TransitAlert[],
  now: number,
): TransitAlert[] {
  return alerts.filter(
    (alert) =>
      // No stated window means the alert is simply in effect.
      !alert.periods.length ||
      alert.periods.some(
        (period) =>
          (period.start ?? 0) <= now &&
          (period.end === undefined || period.end >= now),
      ),
  );
}

/** The alerts touching `routes`, live disruptions before planned work. */
export function alertsForRoutes(
  alerts: TransitAlert[],
  routes: string[],
): TransitAlert[] {
  const wanted = new Set(routes);
  return alerts
    .map((alert) => ({
      ...alert,
      routes: alert.routes.filter((route) => wanted.has(route)),
    }))
    .filter((alert) => alert.routes.length)
    .sort((a, b) => Number(a.planned) - Number(b.planned));
}
