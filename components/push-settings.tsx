"use client";
import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { homeRequest } from "@/lib/home-client";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function serverKey(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(window.atob(normalized), (char) => char.charCodeAt(0));
}

/**
 * Moves this device's push row to whoever is using it now, or clears it when
 * the device stops being a person. The row is keyed to the member selected
 * when it opted in, so without this the morning digest keeps arriving for the
 * housemate who last used the phone. Best effort: the settings panel re-points
 * a stale row on its next visit anyway.
 */
export async function movePushSubscription(toPerson: boolean) {
  if (!KEY || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await homeRequest("/api/push", "POST", {
      operation: toPerson ? "subscribe" : "unsubscribe",
      subscription: subscription.toJSON(),
    });
    // A shared screen is nobody in particular and gets no personal digest,
    // so let the browser go too rather than leaving a dead endpoint behind.
    if (!toPerson) await subscription.unsubscribe();
  } catch {
    /* Reminders stay as they were; settings can fix them. */
  }
}

export default function PushSettings() {
  const [state, setState] = useState<"checking" | "unsupported" | "off" | "on">(
    "checking",
  );
  const [needsInstall, setNeedsInstall] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!KEY || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      // iOS Safari only exposes PushManager once the app is installed to the
      // Home Screen, so nudge instead of declaring the device unsupported.
      // iPadOS reports itself as Macintosh; touch points give it away.
      if (
        KEY &&
        (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))) &&
        !window.matchMedia("(display-mode: standalone)").matches
      )
        setNeedsInstall(true);
      setState("unsupported");
      return;
    }
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => {
        if (!subscription) return setState("off");
        setState("on");
        // Idempotent re-subscribe: refreshes the server's last-seen and
        // self-heals a lost row. Only an explicit rejection means this device
        // isn't really on — a network blip or signed-out state must not tear
        // down a healthy subscription.
        void homeRequest("/api/push", "POST", {
          operation: "subscribe",
          subscription: subscription.toJSON(),
        }).catch((err: Error & { rejected?: boolean }) => {
          if (!err.rejected) return;
          void subscription.unsubscribe().catch(() => {});
          setState("off");
        });
      })
      .catch(() => setState("off"));
  }, []);

  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      await navigator.serviceWorker.register("/sw.js", {
        updateViaCache: "none",
      });
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: serverKey(KEY!) as BufferSource,
      });
      try {
        await homeRequest("/api/push", "POST", {
          operation: "subscribe",
          subscription: subscription.toJSON(),
        });
      } catch (err) {
        // Don't leave the browser subscribed when the server never heard of it.
        await subscription.unsubscribe().catch(() => {});
        throw err;
      }
      setState("on");
      setMessage("This device gets the morning digest now.");
    } catch (err) {
      setMessage(
        typeof Notification !== "undefined" &&
          Notification.permission === "denied"
          ? "Notifications are blocked for this site in your browser settings."
          : (err as Error).message || "Couldn’t turn reminders on. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await homeRequest("/api/push", "POST", {
          operation: "unsubscribe",
          subscription: subscription.toJSON(),
        });
        await subscription.unsubscribe();
      }
      setState("off");
    } catch (err) {
      setMessage((err as Error).message || "Couldn’t turn reminders off.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage("");
    try {
      const result = await homeRequest("/api/reminders", "POST");
      setMessage(
        result.sent
          ? "Sent — check this device’s notifications."
          : "No subscribed devices for you yet.",
      );
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") return null;
  return (
    <>
      <h3>Morning reminders</h3>
      {!KEY ? (
        <p className="subtle">
          Reminders need push keys — see the README’s notifications section.
        </p>
      ) : state === "unsupported" ? (
        <p className="subtle">
          {needsInstall
            ? "On iPhone or iPad, first add this app to your Home Screen (Share → Add to Home Screen), then turn reminders on from there."
            : "This browser doesn’t support notifications."}
        </p>
      ) : (
        <>
          <p className="subtle">
            A daily notification with the day’s chores, upcoming bills, and
            needed shopping items — for whoever this device belongs to. Each
            device opts in separately.
          </p>
          {state === "on" ? (
            <>
              <Button
                className="button secondary"
                disabled={busy}
                onClick={() => void test()}
              >
                <BellRing size={16} /> Send today’s digest now
              </Button>{" "}
              <Button
                className="button secondary"
                disabled={busy}
                onClick={() => void disable()}
              >
                Turn off
              </Button>
            </>
          ) : (
            <Button
              className="button secondary"
              disabled={busy}
              onClick={() => void enable()}
            >
              <BellRing size={16} /> Turn on for this device
            </Button>
          )}
          {message && <p className="subtle">{message}</p>}
        </>
      )}
    </>
  );
}
