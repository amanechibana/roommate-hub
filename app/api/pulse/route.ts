import { json, signedIn } from "@/lib/shared-server";

export const runtime = "nodejs";

const STATIONS = new Set([
  "NWK",
  "HAR",
  "JSQ",
  "GRV",
  "NEW",
  "EXP",
  "HOB",
  "WTC",
  "CHR",
  "09S",
  "14S",
  "23S",
  "33S",
]);
// Office is by Journal Square; one forecast covers the whole household.
const WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=40.7216&longitude=-74.0437" +
  "&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
  "&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=1";
const TRAINS_URL = "https://www.panynj.gov/bin/portauthority/ridepath.json";

type Weather = {
  current: { temperature_2m: number; weather_code: number };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
};
type Ride = {
  results: {
    consideredStation: string;
    destinations: {
      label: string;
      messages: { headSign: string; arrivalTimeMessage: string }[];
    }[];
  }[];
};

let cache: { at: number; weather: Weather; ride: Ride } | null = null;

export async function GET(request: Request) {
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  const stations = (new URL(request.url).searchParams.get("stations") || "")
    .split(",")
    .filter((code) => STATIONS.has(code))
    .slice(0, 4);
  if (!stations.length) stations.push("JSQ", "NEW");
  try {
    if (!cache || Date.now() - cache.at > 60_000) {
      const [weather, ride] = await Promise.all([
        fetch(WEATHER_URL, { cache: "no-store" }),
        fetch(TRAINS_URL, { cache: "no-store" }),
      ]);
      if (!weather.ok || !ride.ok) throw new Error("upstream unavailable");
      cache = {
        at: Date.now(),
        weather: await weather.json(),
        ride: await ride.json(),
      };
    }
    const { weather, ride } = cache;
    return json({
      weather: {
        temperature: Math.round(weather.current.temperature_2m),
        code: weather.current.weather_code,
        high: Math.round(weather.daily.temperature_2m_max[0]),
        low: Math.round(weather.daily.temperature_2m_min[0]),
        precipitation: weather.daily.precipitation_probability_max[0] ?? 0,
      },
      trains: Object.fromEntries(
        stations.map((code) => [
          code,
          (
            ride.results.find((r) => r.consideredStation === code)
              ?.destinations ?? []
          ).map((destination) => ({
            label: destination.label,
            headSign: destination.messages[0]?.headSign ?? "",
            arrivals: destination.messages
              .slice(0, 2)
              .map((m) => m.arrivalTimeMessage),
          })),
        ]),
      ),
    });
  } catch {
    cache = null;
    return json({ error: "Weather and trains are unavailable right now." }, 503);
  }
}
