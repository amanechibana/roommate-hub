import { fetchWithTimeout, withCache } from "@/lib/cache";
import { parseWeather, type Weather } from "@/lib/transit";

// Open-Meteo needs no API key and no attribution header. Journal Square is the
// default so the board works before anyone opens the settings dialog.
const DEFAULT_LAT = 40.7318;
const DEFAULT_LON = -74.0632;

function coordinate(raw: string | null, fallback: number, limit: number) {
  const value = Number(raw);
  // Reject anything that is not a real coordinate rather than forwarding it.
  if (!raw || !Number.isFinite(value) || Math.abs(value) > limit)
    return fallback;
  return Math.round(value * 10000) / 10000;
}

async function load(lat: number, lon: number): Promise<Weather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m,apparent_temperature,weather_code" +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&forecast_days=1&temperature_unit=fahrenheit&timezone=America%2FNew_York";
  const response = await fetchWithTimeout(url);
  if (!response.ok)
    throw new Error(`Weather upstream returned ${response.status}`);
  // parseWeather throws on a body with no real reading, which lands on the
  // same stale-cache-or-503 path as an upstream error.
  return parseWeather(await response.json());
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = coordinate(params.get("lat"), DEFAULT_LAT, 90);
  const lon = coordinate(params.get("lon"), DEFAULT_LON, 180);
  try {
    const { value, fresh, at } = await withCache(
      `weather:${lat},${lon}`,
      10 * 60 * 1000,
      () => load(lat, lon),
    );
    return Response.json(
      { ...value, stale: !fresh, fetchedAt: at },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=600" } },
    );
  } catch {
    return Response.json(
      { error: "Weather is unavailable right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
