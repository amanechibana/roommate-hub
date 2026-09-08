import { test } from "node:test";
import assert from "node:assert/strict";
import { fields, integer, message, messages, text } from "../lib/protobuf";
import {
  buildSubwayDepartures,
  describeWeather,
  defaultStations,
  MAX_STATIONS,
  parsePath,
  parseStoredStations,
  pathStation,
  filterDepartures,
  hasDeparted,
  leaveInMinutes,
  minutesUntil,
  normalizeSubwayRoute,
  parseWeather,
  searchPathStations,
  stationKey,
  toggleFilter,
  subwayColor,
  type SubwayStation,
} from "../lib/transit";
import {
  feedsForStation,
  findStation,
  readFeed,
  searchStations,
  subwayStations,
} from "../lib/subway-data";

// --- protobuf wire format -------------------------------------------------

function varint(value: number): number[] {
  const out: number[] = [];
  let rest = value;
  do {
    let byte = rest & 0x7f;
    rest >>>= 7;
    if (rest) byte |= 0x80;
    out.push(byte);
  } while (rest);
  return out;
}
const tag = (no: number, wire: number) => varint((no << 3) | wire);
const varintField = (no: number, value: number) => [
  ...tag(no, 0),
  ...varint(value),
];
const bytesField = (no: number, payload: number[]) => [
  ...tag(no, 2),
  ...varint(payload.length),
  ...payload,
];
const stringField = (no: number, value: string) =>
  bytesField(no, [...new TextEncoder().encode(value)]);

test("reads varint, string, and nested message fields", () => {
  const inner = [...varintField(2, 1788703975), ...stringField(4, "A32N")];
  const buffer = new Uint8Array([
    ...stringField(1, "hello"),
    ...bytesField(3, inner),
    ...varintField(7, 300),
  ]);
  const parsed = fields(buffer);
  assert.equal(text(parsed, 1), "hello");
  assert.equal(integer(parsed, 7), 300);
  const nested = message(parsed, 3);
  assert.ok(nested);
  assert.equal(integer(nested, 2), 1788703975);
  assert.equal(text(nested, 4), "A32N");
});

test("skips unknown fixed-width fields instead of failing", () => {
  // A reader must tolerate fields it does not know; both fixed64 and fixed32
  // are skipped by width, and the following field still decodes.
  const buffer = new Uint8Array([
    ...tag(9, 1),
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    ...tag(10, 5),
    1,
    2,
    3,
    4,
    ...stringField(11, "after"),
  ]);
  assert.equal(text(fields(buffer), 11), "after");
});

test("collects repeated fields and returns the last scalar", () => {
  const buffer = new Uint8Array([
    ...bytesField(2, stringField(1, "one")),
    ...bytesField(2, stringField(1, "two")),
    ...varintField(5, 1),
    ...varintField(5, 9),
  ]);
  const parsed = fields(buffer);
  assert.equal(messages(parsed, 2).length, 2);
  assert.equal(integer(parsed, 5), 9);
});

test("rejects truncated and malformed payloads", () => {
  // Length says ten bytes but only two follow.
  assert.throws(() => fields(new Uint8Array([...tag(1, 2), 10, 1, 2])));
  // A varint that never terminates.
  assert.throws(() => fields(new Uint8Array([...tag(1, 0), 0x80, 0x80])));
  // Field number zero is not legal.
  assert.throws(() => fields(new Uint8Array([0x00, 0x01])));
});

test("returns empty values for absent fields", () => {
  const parsed = fields(new Uint8Array([...stringField(1, "x")]));
  assert.equal(text(parsed, 4), "");
  assert.equal(integer(parsed, 4), null);
  assert.equal(message(parsed, 4), null);
});

test("the feed reader drops canceled trips and skipped stops", () => {
  // FeedEntity.trip_update with a TripDescriptor and its StopTimeUpdates.
  const entity = (tripFields: number[], stopFields: number[][]) =>
    bytesField(
      2,
      bytesField(3, [
        ...bytesField(1, tripFields),
        ...stopFields.flatMap((stop) => bytesField(2, stop)),
      ]),
    );
  const arrival = (time: number) => bytesField(2, varintField(2, time));
  const buffer = new Uint8Array([
    // A live A arrival is kept.
    ...entity(stringField(5, "A"), [
      [...stringField(4, "A32N"), ...arrival(100)],
    ]),
    // A CANCELED (3) trip loses every stop it still carries.
    ...entity(
      [...stringField(5, "C"), ...varintField(4, 3)],
      [[...stringField(4, "A32N"), ...arrival(200)]],
    ),
    // A SKIPPED (1) stop is dropped; its siblings stay.
    ...entity(stringField(5, "E"), [
      [...stringField(4, "A32N"), ...arrival(300), ...varintField(5, 1)],
      [...stringField(4, "A32S"), ...arrival(400)],
    ]),
    // Explicit SCHEDULED (0) on both levels is kept.
    ...entity(
      [...stringField(5, "B"), ...varintField(4, 0)],
      [[...stringField(4, "D14N"), ...arrival(500), ...varintField(5, 0)]],
    ),
  ]);
  assert.deepEqual(readFeed(buffer), [
    { route: "A", stopId: "A32N", time: 100 },
    { route: "E", stopId: "A32S", time: 400 },
    { route: "B", stopId: "D14N", time: 500 },
  ]);
});

// --- PATH -----------------------------------------------------------------

const pathFeed = {
  results: [
    {
      consideredStation: "JSQ",
      destinations: [
        {
          label: "ToNJ",
          messages: [
            {
              target: "NWK",
              secondsToArrival: "321",
              arrivalTimeMessage: "6 min",
              lineColor: "D93A30",
              headSign: "Newark",
            },
          ],
        },
        {
          label: "ToNY",
          messages: [
            {
              target: "33S",
              secondsToArrival: "125",
              arrivalTimeMessage: "Delayed",
              lineColor: "4D92FB,FF9900",
              headSign: "33rd Street",
            },
            {
              target: "WTC",
              secondsToArrival: "29",
              arrivalTimeMessage: "0 min",
              lineColor: "D93A30",
              headSign: "World Trade Center",
            },
          ],
        },
      ],
    },
    { consideredStation: "HOB", destinations: [] },
  ],
};

test("normalises PATH departures and sorts them by arrival", () => {
  const result = parsePath(pathFeed, "jsq");
  assert.equal(result.station, "Journal Square");
  assert.equal(result.system, "PATH");
  assert.deepEqual(
    result.departures.map((d) => [d.minutes, d.headsign]),
    [
      [0, "World Trade Center"],
      [2, "33rd Street"],
      [5, "Newark"],
    ],
  );
  assert.equal(result.departures[0].note, "To New York");
  assert.equal(result.departures[2].note, "To New Jersey");
  // Every departure names the station it leaves from.
  assert.ok(result.departures.every((d) => d.origin === "Journal Square"));
});

test("keeps PATH status text but not plain countdowns", () => {
  const result = parsePath(pathFeed, "JSQ");
  const delayed = result.departures.find((d) => d.headsign === "33rd Street");
  assert.equal(delayed?.status, "Delayed");
  // Two-tone trains carry both line colours.
  assert.deepEqual(delayed?.colors, ["4D92FB", "FF9900"]);
  assert.equal(
    result.departures.find((d) => d.headsign === "Newark")?.status,
    "",
  );
});

test("returns an empty board for a station with no trains listed", () => {
  assert.deepEqual(parsePath(pathFeed, "HOB").departures, []);
  assert.deepEqual(parsePath({}, "JSQ").departures, []);
  assert.deepEqual(parsePath(null, "JSQ").departures, []);
});

// --- subway ---------------------------------------------------------------

const grove: SubwayStation = {
  id: "A32",
  name: "Test St",
  borough: "Manhattan",
  routes: ["A", "C", "E"],
  north: "Uptown",
  south: "Downtown",
  lat: 40.732338,
  lon: -74.000495,
};

test("builds subway departures from realtime stop ids", () => {
  const now = 1_000_000;
  const result = buildSubwayDepartures(
    [
      { route: "A", stopId: "A32N", time: now + 120 },
      { route: "C", stopId: "A32S", time: now + 60 },
      { route: "E", stopId: "A33N", time: now + 30 },
      { route: "A", stopId: "A32", time: now + 45 },
    ],
    grove,
    now,
  );
  // Only this station's northbound/southbound platforms, soonest first.
  assert.deepEqual(
    result.departures.map((d) => [d.line, d.minutes, d.headsign, d.origin]),
    [
      ["C", 1, "Downtown", "Test St"],
      ["A", 2, "Uptown", "Test St"],
    ],
  );
});

test("normalizes realtime route ids to rider-facing labels", () => {
  assert.equal(normalizeSubwayRoute("GS"), "S");
  assert.equal(normalizeSubwayRoute("FS"), "S");
  assert.equal(normalizeSubwayRoute("H"), "S");
  assert.equal(normalizeSubwayRoute("SI"), "SIR");
  assert.equal(normalizeSubwayRoute("6X"), "6");
  assert.equal(normalizeSubwayRoute("7X"), "7");
  // Labels the station table already uses pass through untouched.
  assert.equal(normalizeSubwayRoute("A"), "A");
  assert.equal(normalizeSubwayRoute("SIR"), "SIR");
});

test("labels departures with the rider-facing route, not the feed id", () => {
  const now = 1_000_000;
  const shuttle: SubwayStation = {
    ...grove,
    id: "901",
    routes: ["S", "6"],
  };
  const result = buildSubwayDepartures(
    [
      { route: "GS", stopId: "901N", time: now + 120 },
      { route: "6X", stopId: "901S", time: now + 240 },
    ],
    shuttle,
    now,
  );
  assert.deepEqual(
    result.departures.map((d) => [d.line, d.colors[0]]),
    [
      ["S", "808183"],
      ["6", "00933C"],
    ],
  );
  // A chip built from the station table's "S" now matches the GS departure.
  assert.deepEqual(
    filterDepartures(result.departures, { lines: ["S"], headsigns: [] }).map(
      (d) => d.line,
    ),
    ["S"],
  );
});

test("drops departed trains and de-duplicates shared feeds", () => {
  const now = 1_000_000;
  const result = buildSubwayDepartures(
    [
      { route: "A", stopId: "A32N", time: now - 600 },
      { route: "A", stopId: "A32N", time: now + 300 },
      { route: "A", stopId: "A32N", time: now + 300 },
      { route: "C", stopId: "A32N", time: now - 10 },
    ],
    grove,
    now,
  );
  // The platform label already carries the direction, so there is no extra
  // note to repeat after the origin station.
  assert.ok(result.departures.every((d) => d.note === ""));
  // The long-gone train is dropped, the duplicate collapses, and the train
  // that left ten seconds ago survives the clock-skew allowance as "0 min".
  assert.deepEqual(
    result.departures.map((d) => [d.line, d.minutes]),
    [
      ["C", 0],
      ["A", 5],
    ],
  );
});

test("maps every station to at least one realtime feed", () => {
  for (const station of subwayStations) {
    const feeds = feedsForStation(station);
    assert.ok(
      feeds.length > 0,
      `${station.name} (${station.id}) resolved to no feed`,
    );
  }
});

test("routes the three shuttles to their own feeds", () => {
  const feedsFor = (id: string) => feedsForStation(findStation(id)!);
  // Times Sq / Grand Central 42 St shuttle rides in the numbered-line feed.
  assert.deepEqual(feedsFor("902"), ["gtfs"]);
  // Rockaway Park shuttle shares the A/C/E feed.
  assert.ok(feedsFor("H15").includes("gtfs-ace"));
  // Franklin Av shuttle shares the B/D/F/M feed.
  assert.deepEqual(feedsFor("S01"), ["gtfs-bdfm"]);
  // Staten Island Railway has its own.
  assert.deepEqual(feedsFor("S17"), ["gtfs-si"]);
});

test("gathers every feed a transfer station needs", () => {
  // Prospect Park is B/Q plus the Franklin Av shuttle.
  const feeds = feedsFor("D26");
  assert.ok(feeds.includes("gtfs-nqrw"));
  assert.ok(feeds.includes("gtfs-bdfm"));
  function feedsFor(id: string) {
    return feedsForStation(findStation(id)!);
  }
});

test("gives shuttles, expresses, and the railway a colour", () => {
  assert.equal(subwayColor("FS"), subwayColor("GS"));
  assert.equal(subwayColor("1"), "EE352E");
  assert.equal(subwayColor("SI"), "0039A6");
  // Express runs share their local's colour rather than falling to gray.
  assert.equal(subwayColor("6X"), "00933C");
  assert.equal(subwayColor("7X"), "B933AD");
  // An unrecognised route still renders rather than throwing.
  assert.match(subwayColor("ZZ"), /^[0-9A-F]{6}$/);
});

test("finds stations by name, ignoring case and punctuation", () => {
  const results = searchStations("times sq");
  assert.ok(results.some((s) => s.name.startsWith("Times Sq")));
  // Prefix matches outrank mid-name matches.
  assert.ok(searchStations("grand central")[0].name.includes("Grand Central"));
  assert.deepEqual(searchStations(""), []);
  assert.deepEqual(searchStations("   "), []);
  assert.ok(searchStations("14 st").length > 1);
  assert.equal(searchStations("nowhere at all").length, 0);
});

test("caps search results", () => {
  assert.ok(searchStations("st", 5).length <= 5);
});

// --- saved station list ---------------------------------------------------

test("defaults to the Journal Square PATH board", () => {
  const stations = parseStoredStations(null);
  assert.deepEqual(
    stations.map((s) => [s.system, s.id, s.name]),
    [["path", "JSQ", "Journal Square"]],
  );
  // A default station must carry a location so the weather has somewhere to go.
  assert.ok(stations[0].lat && stations[0].lon);
  assert.deepEqual(parseStoredStations(null), defaultStations());
});

test("upgrades the original single-station settings shape", () => {
  const stations = parseStoredStations(
    JSON.stringify({ path: "HOB", subway: "A32" }),
  );
  assert.deepEqual(
    stations.map((s) => [s.system, s.id]),
    [
      ["path", "HOB"],
      ["subway", "A32"],
    ],
  );
  // The PATH entry is rebuilt in full; the subway name is looked up later.
  assert.equal(stations[0].name, "Hoboken");
  assert.equal(stations[1].name, "");
});

test("reads the managed list and drops duplicates and junk", () => {
  const stations = parseStoredStations(
    JSON.stringify({
      stations: [
        { system: "path", id: "GRV" },
        { system: "path", id: "GRV" },
        { system: "subway", id: "A32", name: "W 4 St", lat: 40.7, lon: -74 },
        { system: "tram", id: "X" },
        { system: "path", id: "NOPE" },
        { id: "no-system" },
        null,
      ],
    }),
  );
  assert.deepEqual(
    stations.map((s) => [s.system, s.id]),
    [
      ["path", "GRV"],
      ["subway", "A32"],
    ],
  );
});

test("caps the saved list and survives a corrupt store", () => {
  const many = {
    stations: Object.keys({
      NWK: 1,
      HAR: 1,
      JSQ: 1,
      GRV: 1,
      NEW: 1,
      EXP: 1,
      HOB: 1,
      WTC: 1,
    }).map((id) => ({ system: "path", id })),
  };
  assert.equal(parseStoredStations(JSON.stringify(many)).length, MAX_STATIONS);
  assert.deepEqual(parseStoredStations("{not json"), defaultStations());
  assert.deepEqual(parseStoredStations("[]"), []);
  assert.deepEqual(parseStoredStations("null"), defaultStations());
});

test("reads walk times, clamping junk and oversized values", () => {
  const stations = parseStoredStations(
    JSON.stringify({
      stations: [
        { system: "path", id: "JSQ", walkMinutes: 12 },
        { system: "subway", id: "A32", name: "W 4 St", walkMinutes: 900 },
        { system: "path", id: "HOB", walkMinutes: "soon" },
      ],
    }),
  );
  assert.deepEqual(
    stations.map((station) => station.walkMinutes),
    [12, 60, 0],
  );
});

test("leave-by hints subtract the walk from the countdown", () => {
  const now = 1_700_000_000;
  const departure = {
    id: "d",
    line: "PATH",
    colors: [],
    headsign: "World Trade Center",
    origin: "Journal Square",
    note: "",
    minutes: 10,
    at: now + 600,
    status: "",
  };
  assert.equal(leaveInMinutes(departure, now), null);
  assert.equal(leaveInMinutes({ ...departure, walk: 4 }, now), 6);
  // A minute later the hint counts down with the train.
  assert.equal(leaveInMinutes({ ...departure, walk: 4 }, now + 60), 5);
  assert.equal(leaveInMinutes({ ...departure, walk: 12 }, now), -2);
  assert.equal(
    leaveInMinutes({ ...departure, walk: 4, minutes: null, at: null }, now),
    null,
  );
});

test("builds and searches PATH stations", () => {
  assert.equal(pathStation("WTC")?.name, "World Trade Center");
  assert.equal(pathStation("nope"), null);
  assert.deepEqual(
    searchPathStations("journal").map((s) => s.id),
    ["JSQ"],
  );
  // Punctuation and case are ignored, matching the subway search.
  assert.deepEqual(
    searchPathStations("33RD").map((s) => s.id),
    ["33S"],
  );
  assert.deepEqual(searchPathStations(""), []);
});

test("matches ordinal names across the two systems' spellings", () => {
  // PATH writes "14th Street"; the MTA writes "14 St". Either spelling of the
  // query has to find either station.
  assert.deepEqual(
    searchPathStations("14 st").map((s) => s.id),
    ["14S"],
  );
  assert.deepEqual(
    searchPathStations("33 st").map((s) => s.id),
    ["33S"],
  );
  assert.ok(searchStations("14th st").some((s) => s.name.startsWith("14 St")));
  assert.equal(stationKey("14th Street"), "14 street");
  assert.equal(stationKey("14 St"), "14 st");
  assert.equal(stationKey("W 4 St-Wash Sq"), "w 4 st wash sq");
  // A bare "st" is not an ordinal suffix and must survive.
  assert.equal(stationKey("Grove Street"), "grove street");
});

// --- per-station train filters ---------------------------------------------

const board = [
  { line: "A", headsign: "Uptown" },
  { line: "C", headsign: "Uptown" },
  { line: "A", headsign: "Downtown" },
  { line: "E", headsign: "Downtown" },
].map((d, i) => ({
  ...d,
  id: String(i),
  colors: [],
  origin: "Test St",
  note: "",
  minutes: i,
  at: null,
  status: "",
}));

test("an empty filter shows every train", () => {
  assert.equal(
    filterDepartures(board, { lines: [], headsigns: [] }).length,
    board.length,
  );
});

test("filters on route and direction, and on both together", () => {
  assert.deepEqual(
    filterDepartures(board, { lines: ["A"], headsigns: [] }).map((d) => d.id),
    ["0", "2"],
  );
  assert.deepEqual(
    filterDepartures(board, { lines: [], headsigns: ["Downtown"] }).map(
      (d) => d.id,
    ),
    ["2", "3"],
  );
  // Both axes apply at once, not as alternatives.
  assert.deepEqual(
    filterDepartures(board, { lines: ["A"], headsigns: ["Downtown"] }).map(
      (d) => d.id,
    ),
    ["2"],
  );
  // A filter naming nothing on the board legitimately yields nothing.
  assert.deepEqual(
    filterDepartures(board, { lines: ["Z"], headsigns: [] }),
    [],
  );
});

test("clicking a destination selects it rather than removing it", () => {
  const all = ["33rd Street", "Newark", "World Trade Center"];
  // Someone tapping "33rd Street" at Journal Square wants trains to 33rd
  // Street, not everything except them.
  assert.deepEqual(toggleFilter([], all, "33rd Street"), ["33rd Street"]);
  // Further clicks add to the selection.
  assert.deepEqual(toggleFilter(["33rd Street"], all, "Newark"), [
    "33rd Street",
    "Newark",
  ]);
});

test("emptying or filling the selection both mean no filter", () => {
  const all = ["A", "C", "E"];
  // Deselecting the last one goes back to showing everything.
  assert.deepEqual(toggleFilter(["A"], all, "A"), []);
  // So does selecting every option.
  assert.deepEqual(toggleFilter(["A", "C"], all, "E"), []);
});

test("ignores values the station does not offer", () => {
  const all = ["A", "C", "E"];
  assert.deepEqual(toggleFilter(["A"], all, "Q"), ["A"]);
  // A stale saved value is dropped once the real options are known.
  assert.deepEqual(toggleFilter(["A", "W"], all, "C"), ["A", "C"]);
});

test("saves and restores per-station filters", () => {
  const stored = JSON.stringify({
    stations: [
      { system: "path", id: "JSQ", headsigns: ["World Trade Center"] },
      {
        system: "subway",
        id: "A32",
        name: "W 4 St",
        lat: 40.7,
        lon: -74,
        lines: ["A", "A", "C"],
        headsigns: ["Downtown", 7, ""],
      },
    ],
  });
  const [path, subway] = parseStoredStations(stored);
  assert.deepEqual(path.headsigns, ["World Trade Center"]);
  assert.deepEqual(path.lines, []);
  // Duplicates collapse and non-strings are dropped.
  assert.deepEqual(subway.lines, ["A", "C"]);
  assert.deepEqual(subway.headsigns, ["Downtown"]);
  // A station saved before filters existed simply has none.
  const [plain] = parseStoredStations(
    JSON.stringify({ stations: [{ system: "path", id: "HOB" }] }),
  );
  assert.deepEqual([plain.lines, plain.headsigns], [[], []]);
});

// --- live countdowns --------------------------------------------------------

test("counts down from the absolute arrival time, not the last poll", () => {
  const now = 1_000_000;
  const train = { ...board[0], minutes: 5, at: now + 300 };
  assert.equal(minutesUntil(train, now), 5);
  // Two minutes later the board says three without having refetched.
  assert.equal(minutesUntil(train, now + 120), 3);
  assert.equal(minutesUntil(train, now + 300), 0);
  // Never count below zero once it is due.
  assert.equal(minutesUntil(train, now + 600), 0);
});

test("falls back to the server snapshot when there is no absolute time", () => {
  assert.equal(minutesUntil({ ...board[0], minutes: 4, at: null }, 0), 4);
  assert.equal(minutesUntil({ ...board[0], minutes: null, at: null }, 0), null);
});

test("drops a train only once it is properly gone", () => {
  const now = 1_000_000;
  const train = (at: number | null) => ({ ...board[0], at });
  assert.equal(hasDeparted(train(now + 60), now), false);
  // A little slack absorbs clock skew between the agency and this machine.
  assert.equal(hasDeparted(train(now - 20), now), false);
  assert.equal(hasDeparted(train(now - 120), now), true);
  // Without a time there is nothing to judge, so it stays.
  assert.equal(hasDeparted(train(null), now), false);
});

test("PATH departures carry an absolute arrival time", () => {
  const now = 1_700_000_000;
  const result = parsePath(pathFeed, "JSQ", now);
  const wtc = result.departures.find(
    (d) => d.headsign === "World Trade Center",
  );
  // 29 seconds out in the fixture.
  assert.equal(wtc?.at, now + 29);
  // Still counts down correctly a minute later, with no new fetch.
  assert.equal(minutesUntil(wtc!, now + 60), 0);
});

// --- weather --------------------------------------------------------------

test("describes weather codes and falls back for unknown ones", () => {
  assert.deepEqual(describeWeather(0), { text: "Clear", icon: "sun" });
  assert.equal(describeWeather(95).icon, "storm");
  assert.equal(describeWeather(71).icon, "snow");
  assert.equal(describeWeather(-1).icon, "cloud");
  assert.equal(describeWeather(4242).text, "—");
});

test("parses an Open-Meteo payload into a rounded reading", () => {
  const weather = parseWeather({
    current: {
      temperature_2m: 33.4,
      apparent_temperature: 25.2,
      weather_code: 71,
    },
    daily: {
      temperature_2m_max: [36.1],
      temperature_2m_min: [28.9],
      precipitation_probability_max: [80],
    },
  });
  assert.equal(weather.temperature, 33);
  assert.equal(weather.feelsLike, 25);
  assert.equal(weather.high, 36);
  assert.equal(weather.low, 29);
  assert.equal(weather.icon, "snow");
  assert.equal(weather.precipitation, 80);
});

test("treats a body with no real temperature as an upstream failure", () => {
  // A 200 with no current reading must not render as a 0° morning.
  assert.throws(() => parseWeather({}));
  assert.throws(() => parseWeather(null));
  assert.throws(() => parseWeather({ current: {} }));
  assert.throws(() => parseWeather({ current: { temperature_2m: "33" } }));
  assert.throws(() => parseWeather({ current: { temperature_2m: NaN } }));
});

test("weather tolerates missing feels-like and daily blocks", () => {
  const weather = parseWeather({ current: { temperature_2m: 50.4 } });
  assert.equal(weather.temperature, 50);
  // Falls back to the air temperature so the chip never invents a gap.
  assert.equal(weather.feelsLike, 50);
  assert.equal(weather.high, null);
  assert.equal(weather.low, null);
  assert.equal(weather.precipitation, null);
  assert.equal(weather.icon, "cloud");
});
