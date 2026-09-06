import { findStation, searchStations } from "@/lib/subway-data";

// Backs the station picker. The full list is 496 stations, so it is searched
// on the server and never shipped to the browser in one piece.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  if (id) {
    const station = findStation(id);
    return Response.json(
      { stations: station ? [station] : [] },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  }
  const query = params.get("q") ?? "";
  return Response.json(
    { stations: searchStations(query) },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
