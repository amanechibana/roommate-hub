// Parsing for the MTA's subway alerts feed: GTFS-realtime service alerts,
// served as JSON with the MTA's "Mercury" extension fields. Only the route
// handler fetches the feed; these helpers stay pure so they can be tested.

export type TransitAlert = {
  id: string;
  routes: string[];
  text: string;
  /** The feed's category, e.g. "Delays" or "Planned - Part Suspended". */
  kind: string;
  planned: boolean;
};

type Translation = { text?: string; language?: string };
type FeedAlert = {
  active_period?: { start?: number; end?: number }[];
  informed_entity?: { route_id?: string }[];
  header_text?: { translation?: Translation[] };
  "transit_realtime.mercury_alert"?: { alert_type?: string };
};

// The alerts feed ids shuttles and expresses differently from the station
// table (GS/FS/H are the S shuttles, SI is SIR, 6X/7X are the expresses).
function normalizeRoute(route: string): string {
  if (route === "GS" || route === "FS" || route === "H") return "S";
  if (route === "SI") return "SIR";
  return route.replace(/X$/, "");
}

/** Every alert active at `now` (unix seconds), with normalized route lists. */
export function parseAlertsFeed(feed: unknown, now: number): TransitAlert[] {
  const entities =
    (feed as { entity?: { id?: string; alert?: FeedAlert }[] })?.entity ?? [];
  const alerts: TransitAlert[] = [];
  for (const entity of entities) {
    const alert = entity?.alert;
    if (!alert) continue;
    const periods = alert.active_period ?? [];
    // No stated window means the alert is simply in effect.
    const active =
      !periods.length ||
      periods.some(
        (period) =>
          (period.start ?? 0) <= now &&
          (period.end === undefined || period.end >= now),
      );
    if (!active) continue;
    const routes = [
      ...new Set(
        (alert.informed_entity ?? [])
          .map((informed) =>
            typeof informed?.route_id === "string"
              ? normalizeRoute(informed.route_id)
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
    });
  }
  return alerts;
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
