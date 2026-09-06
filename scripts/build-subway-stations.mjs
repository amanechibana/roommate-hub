// Regenerates lib/subway-stations.json from the MTA's published station list.
//
// Run with `node scripts/build-subway-stations.mjs`. The output is committed so
// the app never depends on data.ny.gov being reachable at request time; rerun
// it when the MTA opens, renames, or re-routes a station.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SOURCE =
  "https://data.ny.gov/api/views/39hk-dx4f/rows.csv?accessType=DOWNLOAD";

/** Splits one CSV line, honouring quoted fields and doubled quotes. */
function splitRow(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

function parseCsv(text) {
  // Records can span lines when a quoted field contains a newline.
  const rows = [];
  let line = "";
  let quotes = 0;
  for (const raw of text.split(/\r?\n/)) {
    line = line ? `${line}\n${raw}` : raw;
    quotes += (raw.match(/"/g) ?? []).length;
    if (quotes % 2 === 0) {
      if (line.trim()) rows.push(splitRow(line));
      line = "";
    }
  }
  if (line.trim()) rows.push(splitRow(line));
  const [header, ...body] = rows;
  return body.map((cells) =>
    Object.fromEntries(header.map((name, i) => [name.trim(), cells[i] ?? ""])),
  );
}

const response = await fetch(SOURCE);
if (!response.ok)
  throw new Error(`Station list request failed: HTTP ${response.status}`);
const records = parseCsv(await response.text());

const boroughs = {
  M: "Manhattan",
  Bk: "Brooklyn",
  Bx: "Bronx",
  Q: "Queens",
  SI: "Staten Island",
};

const stations = records
  .map((row) => ({
    id: row["GTFS Stop ID"].trim(),
    name: row["Stop Name"].trim(),
    borough: boroughs[row["Borough"].trim()] ?? row["Borough"].trim(),
    routes: row["Daytime Routes"].trim().split(/\s+/).filter(Boolean),
    north: row["North Direction Label"].trim(),
    south: row["South Direction Label"].trim(),
    // Kept so the weather can follow a subway station, not just a PATH one.
    lat: Number(row["GTFS Latitude"]),
    lon: Number(row["GTFS Longitude"]),
  }))
  .filter(
    (station) =>
      station.id &&
      station.name &&
      Number.isFinite(station.lat) &&
      Number.isFinite(station.lon),
  )
  .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

const seen = new Set();
for (const station of stations) {
  if (seen.has(station.id))
    throw new Error(`Duplicate GTFS stop id in source data: ${station.id}`);
  seen.add(station.id);
}

const routes = [...new Set(stations.flatMap((s) => s.routes))].sort();
const target = fileURLToPath(
  new URL("../lib/subway-stations.json", import.meta.url),
);
await writeFile(target, `${JSON.stringify(stations, null, 2)}\n`);

console.log(`Wrote ${stations.length} stations to lib/subway-stations.json`);
console.log(`Route labels in use: ${routes.join(" ")}`);
