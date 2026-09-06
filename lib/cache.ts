// A tiny in-process cache for upstream feed responses.
//
// The wall display polls continuously, so without this every roommate's phone
// and the TV would each hit the MTA and Port Authority directly. Three things
// matter here:
//
//   - a short TTL, because the whole point is live arrival times;
//   - request coalescing, so a burst of callers makes one upstream request;
//   - serving stale data when the upstream fails, so the TV keeps showing the
//     last known board instead of going blank.
//
// This is per-server-instance. That is fine for a household app, and the route
// handlers also set Cache-Control so any CDN in front absorbs the rest.

export type Cached<T> = {
  value: T;
  /** False when the upstream failed and this is the last known good value. */
  fresh: boolean;
  /** When the value was fetched, in milliseconds since the epoch. */
  at: number;
};

type Slot<T> = { value: T; at: number; pending: Promise<T> | null };

const slots = new Map<string, Slot<unknown>>();

export async function withCache<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<Cached<T>> {
  const now = Date.now();
  const slot = slots.get(key) as Slot<T> | undefined;
  if (slot && now - slot.at < ttlMs)
    return { value: slot.value, fresh: true, at: slot.at };

  // Coalesce concurrent refreshes of the same key.
  if (slot?.pending) {
    try {
      const value = await slot.pending;
      return { value, fresh: true, at: slots.get(key)?.at ?? now };
    } catch {
      // `at` is 0 until a load has actually succeeded, so this distinguishes
      // "we have an older value" from "we have never had one".
      if (slot.at) return { value: slot.value, fresh: false, at: slot.at };
      throw new Error(`Could not load ${key}`);
    }
  }

  const pending = load();
  const next: Slot<T> = {
    value: slot?.value as T,
    at: slot?.at ?? 0,
    pending,
  };
  slots.set(key, next as Slot<unknown>);
  try {
    const value = await pending;
    slots.set(key, { value, at: Date.now(), pending: null } as Slot<unknown>);
    return { value, fresh: true, at: Date.now() };
  } catch (error) {
    next.pending = null;
    if (slot && slot.at)
      // Keep serving the last good board rather than failing outright.
      return { value: slot.value, fresh: false, at: slot.at };
    slots.delete(key);
    throw error;
  }
}

/** Fetch with a timeout, so one slow upstream cannot hang the route. */
export async function fetchWithTimeout(
  url: string,
  ms = 8000,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      // These feeds are live; never let the data layer hand back a stale body.
      cache: "no-store",
      headers: {
        "User-Agent": "common-ground-household-board",
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}
