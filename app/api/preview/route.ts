import { json, sameOrigin, signedIn } from "@/lib/shared-server";
import { parseProductPage, publicHostname } from "@/lib/link-preview";
export const runtime = "nodejs";
const empty = { title: null, price: null };
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  let target: URL;
  try {
    const raw = await request.text();
    if (raw.length > 4096) throw new Error("Too long");
    target = new URL(String(JSON.parse(raw).url));
    if (
      !["https:", "http:"].includes(target.protocol) ||
      !publicHostname(target.hostname)
    )
      throw new Error("Not public");
  } catch {
    return json({ error: "Use a full public product link." }, 400);
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(target, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }).finally(() => clearTimeout(timer));
    if (!response.ok || !publicHostname(new URL(response.url).hostname)) {
      await response.body?.cancel().catch(() => {});
      return json(empty);
    }
    const reader = response.body?.getReader();
    if (!reader) return json(empty);
    const decoder = new TextDecoder();
    let html = "";
    let bytes = 0;
    while (bytes < 262144) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      html += decoder.decode(value, { stream: true });
    }
    void reader.cancel().catch(() => {});
    return json(parseProductPage(html));
  } catch {
    return json(empty);
  }
}
