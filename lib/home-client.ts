import {
  clearOffline,
  readOffline,
  writeOffline,
  queueable,
  overlayChange,
  type QueuedChange,
} from "./offline";
import { beginSave } from "./save-status";
import { collectEntryPages } from "./home-pages";

export const hasDatabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
export async function homeRequest(
  path: string,
  method = "GET",
  body?: any,
  optimistic?: any,
) {
  const canQueue =
    typeof window !== "undefined" && queueable(path, method, body);
  if (canQueue)
    body = {
      ...body,
      payload: {
        ...body.payload,
        mutation_id: body.payload.mutation_id || crypto.randomUUID(),
      },
    };
  async function enqueue() {
    const state = readOffline();
    if (!state.household || !state.member)
      throw new Error(
        "Save a signed-in household snapshot before making offline changes.",
      );
    if (state.queue.length >= 200)
      throw new Error(
        "The offline queue is full. Reconnect before adding more changes.",
      );
    const change: QueuedChange = {
      id: body.payload.mutation_id,
      path,
      at: Date.now(),
      body,
    };
    if (!state.queue.some((item) => item.id === change.id)) {
      state.queue.push(change);
      overlayChange(state.cache, change, optimistic);
      writeOffline(state);
    }
    return { ...optimistic, queued: true };
  }
  const finish =
    method === "POST" && ["/api/home", "/api/expenses"].includes(path)
      ? beginSave()
      : undefined;
  try {
    if (typeof window !== "undefined" && !navigator.onLine) {
      const state = readOffline();
      if (
        method === "GET" &&
        state.cache[path] &&
        Date.now() - state.savedAt < 30 * 86400000
      ) {
        finish?.(true);
        return structuredClone(state.cache[path]) as any;
      }
      if (canQueue) {
        const result = await enqueue();
        finish?.(true);
        return result;
      }
      throw new Error(
        "This action needs a connection. Saved household information is available offline.",
      );
    }
    const state = typeof window !== "undefined" ? readOffline() : null;
    if (
      state?.queue.length &&
      ["/api/home", "/api/expenses"].some((prefix) => path.startsWith(prefix))
    ) {
      await flushOffline();
      if (readOffline().queue.length)
        throw new Error(
          readOffline().error || "Reconnect and sync queued changes first.",
        );
    }
    if (state?.queue.length && path === "/api/session" && method === "PATCH")
      throw new Error(
        "Sync or discard your queued changes before changing the selected person.",
      );
    const response = await fetch(path, {
      method,
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    // A proxy error page isn't JSON; the status code still has to be honored.
    let result: any = {};
    try {
      result = JSON.parse(await response.text()) ?? {};
    } catch {}
    if (!response.ok) {
      // A wrong household code should stay on the sign-in screen.
      if (response.status === 401 && path !== "/api/session") {
        clearOffline();
        window.dispatchEvent(new Event("household-signed-out"));
      }
      const error = new Error(result.error || "Could not reach your home.");
      if (result.rejected === true) Object.assign(error, { rejected: true });
      throw error;
    }
    if (typeof window !== "undefined") {
      const saved = readOffline();
      if (path === "/api/session" && method !== "GET") {
        // Never replay a person's pending writes under a changed identity.
        clearOffline();
        if (method !== "DELETE") {
          const identity = readOffline();
          identity.cache["/api/session"] = { authenticated: true };
          identity.savedAt = Date.now();
          writeOffline(identity);
        }
      } else if (path === "/api/session" && result.authenticated === false) {
        clearOffline();
      } else if (
        method === "GET" &&
        [
          "/api/session",
          "/api/home",
          "/api/expenses",
          "/api/agreements",
          "/api/handbook",
          "/api/improvements",
        ].some((prefix) => path === prefix || path.startsWith(prefix + "?"))
      ) {
        if (path.startsWith("/api/home") && result.household) {
          if (
            saved.household &&
            (saved.household !== result.household.id ||
              saved.member !== result.member_id)
          ) {
            saved.cache = {};
            saved.queue = [];
          }
          saved.household = result.household.id;
          saved.member = result.member_id ?? null;
        }
        saved.cache[path] = result;
        saved.savedAt = Date.now();
        try {
          writeOffline(saved);
        } catch {
          /* Online saves do not depend on device storage. */
        }
      }
    }
    finish?.(true);
    return result;
  } catch (error) {
    if (canQueue && error instanceof TypeError) {
      try {
        const result = await enqueue();
        finish?.(true);
        return result;
      } catch (storageError) {
        finish?.(false);
        throw storageError;
      }
    }
    finish?.(false);
    throw error;
  }
}
export async function homeSnapshot(month?: string) {
  return collectEntryPages(async (cursor) => {
    const query = new URLSearchParams();
    if (month) query.set("month", month);
    if (cursor) query.set("cursor", cursor);
    return homeRequest("/api/home" + (query.size ? "?" + query : ""));
  });
}

let flushing: Promise<void> | null = null;
export function flushOffline() {
  if (flushing) return flushing;
  const replay = async () => {
    const state = readOffline();
    if (!navigator.onLine || !state.queue.length) return;
    try {
      const identityResponse = await fetch("/api/home", { cache: "no-store" });
      if (identityResponse.status === 401) {
        clearOffline();
        window.dispatchEvent(new Event("household-signed-out"));
        return;
      }
      if (!identityResponse.ok)
        throw new Error("Could not verify your household for offline sync.");
      const identity = await identityResponse.json();
      if (
        identity.member_id !== state.member ||
        identity.household?.id !== state.household
      )
        throw new Error(
          "Your selected person changed. Switch back to sync these queued changes, or discard them.",
        );
      while (navigator.onLine) {
        const current = readOffline();
        const change = current.queue[0];
        if (!change) break;
        const response = await fetch(change.path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(change.body),
        });
        if (response.status === 401) {
          clearOffline();
          window.dispatchEvent(new Event("household-signed-out"));
          return;
        }
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error ||
              "A queued change could not be saved. Review it before retrying.",
          );
        const latest = readOffline();
        latest.queue = latest.queue.filter((item) => item.id !== change.id);
        latest.error = "";
        writeOffline(latest);
      }
      window.dispatchEvent(new Event("household-offline-synced"));
    } catch (e) {
      const current = readOffline();
      current.error = (e as Error).message;
      writeOffline(current);
    }
  };
  flushing = (
    navigator.locks
      ? navigator.locks.request("common-ground-offline-replay", replay)
      : replay()
  ).finally(() => {
    flushing = null;
  });
  return flushing;
}
