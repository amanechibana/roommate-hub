import { json, sameOrigin, signedIn } from "@/lib/shared-server";
import {
  allowedPort,
  parseProductPage,
  resolvesPublic,
} from "@/lib/link-preview";
export const runtime = "nodejs";
const empty = { title: null, price: null };
async function validTarget(url: URL) {
  return (
    ["https:", "http:"].includes(url.protocol) &&
    allowedPort(url) &&
    (await resolvesPublic(url.hostname))
  );
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  let target: URL;
  try {
    const raw = await request.text();
    if (raw.length > 4096) throw new Error("Too long");
    target = new URL(String(JSON.parse(raw).url));
    if (!(await validTarget(target))) throw new Error("Not public");
  } catch {
    return json({ error: "Use a full public product link." }, 400);
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      // Redirects are followed by hand so every hop gets the same port and
      // DNS checks as the original URL.
      let response: Response;
      for (let hops = 0; ; hops++) {
        response = await fetch(target, {
          signal: controller.signal,
          redirect: "manual",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });
        const location = response.headers.get("location");
        if (![301, 302, 303, 307, 308].includes(response.status) || !location)
          break;
        await response.body?.cancel().catch(() => {});
        if (hops >= 3) return json(empty);
        target = new URL(location, target);
        if (!(await validTarget(target))) return json(empty);
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        return json(empty);
      }
      const reader = response.body?.getReader();
      if (!reader) return json(empty);
      const decoder = new TextDecoder();
      const limit = 262144;
      let html = "";
      let bytes = 0;
      while (bytes < limit) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk =
          value.length > limit - bytes ? value.subarray(0, limit - bytes) : value;
        bytes += chunk.length;
        html += decoder.decode(chunk, { stream: true });
      }
      // Flush so a multibyte character split at the last chunk isn't dropped.
      html += decoder.decode();
      void reader.cancel().catch(() => {});
      return json(parseProductPage(html));
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return json(empty);
  }
}
