import { lookup } from "node:dns/promises";

// Best-effort title/price extraction for the shopping list's link autofill.
// Stores differ wildly, so this reads the common signals (Open Graph, JSON-LD,
// Amazon's offscreen price) and gives up quietly rather than guessing.
const named: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
export function decodeEntities(value: string): string {
  return value.replace(
    /&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi,
    (match, hex, dec, name) => {
      try {
        if (hex) return String.fromCodePoint(parseInt(hex, 16));
        if (dec) return String.fromCodePoint(Number(dec));
        return named[name?.toLowerCase()] ?? match;
      } catch {
        return match;
      }
    },
  );
}
function metaContent(html: string, key: string): string | null {
  for (const pattern of [
    new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${key}["']`,
      "i",
    ),
  ]) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}
function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(/^\s*(?:US)?\$/i, "").replace(/[,\s]/g, ""));
  return Number.isFinite(value) && value > 0 && value <= 99999999.99
    ? Math.round(value * 100) / 100
    : null;
}
export function parseProductPage(html: string): {
  title: string | null;
  price: number | null;
} {
  const rawTitle =
    metaContent(html, "og:title") ??
    metaContent(html, "twitter:title") ??
    html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const title = rawTitle
    ? decodeEntities(rawTitle).replace(/\s+/g, " ").trim().slice(0, 160) || null
    : null;
  let price = parsePrice(
    metaContent(html, "og:price:amount") ??
      metaContent(html, "product:price:amount") ??
      metaContent(html, "price"),
  );
  if (price == null)
    price = parsePrice(html.match(/"price"\s*:\s*"?([0-9][0-9.,]*)"?/)?.[1]);
  if (price == null)
    price = parsePrice(
      html.match(/class=["']a-offscreen["'][^>]*>\s*\$([0-9][0-9.,]*)/i)?.[1],
    );
  const currency =
    metaContent(html, "og:price:currency") ??
    metaContent(html, "product:price:currency") ??
    html.match(/"priceCurrency"\s*:\s*"([A-Za-z]{3})"/)?.[1];
  if (currency && currency.toUpperCase() !== "USD") price = null;
  return { title, price };
}
// The preview route fetches user-supplied URLs; only plain public hostnames
// are allowed so it can't be pointed at localhost or internal addresses.
export function publicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    !!host &&
    host.includes(".") &&
    host !== "localhost" &&
    !host.endsWith(".localhost") &&
    !host.endsWith(".local") &&
    !host.endsWith(".internal") &&
    !host.includes(":") &&
    !host.startsWith("[") &&
    !/^\d+(\.\d+){3}$/.test(host)
  );
}
export function allowedPort(url: URL): boolean {
  return url.port === "" || url.port === "80" || url.port === "443";
}
// Malformed addresses count as private: refusing to fetch is the safe answer.
export function privateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  )
    return true;
  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // 100.64/10 CGNAT
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}
export function privateAddress(address: string): boolean {
  const ip = address
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .split("%")[0];
  if (!ip.includes(":")) return privateIPv4(ip);
  const mapped = ip.match(/^::ffff:(\d+(?:\.\d+){3})$/);
  if (mapped) return privateIPv4(mapped[1]);
  // A zero leading hextet covers ::, ::1, and hex-form v4-mapped addresses.
  const first = ip.startsWith("::") ? 0 : parseInt(ip.split(":")[0], 16);
  return (
    !Number.isFinite(first) ||
    first === 0 ||
    (first >= 0xfc00 && first <= 0xfdff) || // fc00::/7 unique local
    (first >= 0xfe80 && first <= 0xfebf) // fe80::/10 link local
  );
}
// DNS names like 127.0.0.1.nip.io pass the string checks, so every hop is
// resolved and all of its addresses must be public. The fetch afterwards
// re-resolves (DNS-rebinding TOCTOU) — accepted at this app's threat level.
export async function resolvesPublic(hostname: string): Promise<boolean> {
  if (!publicHostname(hostname)) return false;
  try {
    const addresses = await lookup(hostname, { all: true });
    return (
      addresses.length > 0 &&
      addresses.every((entry) => !privateAddress(entry.address))
    );
  } catch {
    return false;
  }
}
