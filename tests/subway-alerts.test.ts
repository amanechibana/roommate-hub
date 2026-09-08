import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeAlerts,
  alertsForRoutes,
  parseAlertsFeed,
} from "../lib/subway-alerts";

const NOW = 1_788_878_000;
const alert = (over: Record<string, unknown>) => ({
  id: "id",
  alert: {
    active_period: [{ start: NOW - 600, end: NOW + 600 }],
    informed_entity: [{ route_id: "A" }],
    header_text: {
      translation: [
        { text: "Plain text about [A] trains.", language: "en" },
        { text: "<p>html</p>", language: "en-html" },
      ],
    },
    "transit_realtime.mercury_alert": { alert_type: "Delays" },
    ...over,
  },
});

test("parses the whole feed and strips route brackets", () => {
  const feed = {
    entity: [
      alert({}),
      { ...alert({ active_period: [{ start: 0, end: NOW - 1 }] }), id: "over" },
      {
        ...alert({ active_period: [{ start: NOW + 3600, end: NOW + 7200 }] }),
        id: "later",
      },
      { id: "no-alert" },
    ],
  };
  // Expired and upcoming alerts survive parsing: the parsed list is cached,
  // so which alerts are active has to be judged per request, not at parse.
  const alerts = parseAlertsFeed(feed);
  assert.deepEqual(
    alerts.map((entry) => entry.id),
    ["id", "over", "later"],
  );
  assert.equal(alerts[0].text, "Plain text about A trains.");
  assert.equal(alerts[0].kind, "Delays");
  assert.equal(alerts[0].planned, false);
});

test("filters active alerts at the asking time, not the parse time", () => {
  const parsed = parseAlertsFeed({
    entity: [
      alert({}),
      { ...alert({ active_period: [{ start: 0, end: NOW - 1 }] }), id: "over" },
      {
        ...alert({ active_period: [{ start: NOW + 3600, end: NOW + 7200 }] }),
        id: "later",
      },
    ],
  });
  assert.deepEqual(
    activeAlerts(parsed, NOW).map((entry) => entry.id),
    ["id"],
  );
  // The same cached list answers differently once planned work begins.
  assert.deepEqual(
    activeAlerts(parsed, NOW + 3600).map((entry) => entry.id),
    ["later"],
  );
});

test("an alert with no stated window counts as in effect", () => {
  const alerts = activeAlerts(
    parseAlertsFeed({ entity: [alert({ active_period: [] })] }),
    NOW,
  );
  assert.equal(alerts.length, 1);
});

test("normalizes shuttle and express route ids to the station labels", () => {
  const alerts = parseAlertsFeed({
    entity: [
      alert({
        informed_entity: [
          { route_id: "GS" },
          { route_id: "7X" },
          { route_id: "SI" },
          { agency_id: "MTASBWY" },
        ],
      }),
    ],
  });
  assert.deepEqual(alerts[0].routes, ["S", "7", "SIR"]);
});

test("route filtering intersects and puts live disruptions first", () => {
  const parsed = parseAlertsFeed({
    entity: [
      {
        ...alert({
          informed_entity: [{ route_id: "A" }, { route_id: "C" }],
          "transit_realtime.mercury_alert": {
            alert_type: "Planned - Part Suspended",
          },
        }),
        id: "planned",
      },
      { ...alert({}), id: "live" },
      {
        ...alert({ informed_entity: [{ route_id: "L" }] }),
        id: "other",
      },
    ],
  });
  const chosen = alertsForRoutes(parsed, ["A"]);
  assert.deepEqual(
    chosen.map((entry) => [entry.id, entry.routes]),
    [
      ["live", ["A"]],
      ["planned", ["A"]],
    ],
  );
  assert.deepEqual(alertsForRoutes(parsed, ["Q"]), []);
});

test("alerts without english text or routes are dropped", () => {
  const alerts = parseAlertsFeed({
    entity: [
      alert({
        header_text: { translation: [{ text: "x", language: "es" }] },
      }),
      alert({ informed_entity: [] }),
    ],
  });
  assert.equal(alerts.length, 0);
});
