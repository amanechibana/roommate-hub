import "server-only";
import webpush from "web-push";
import { sharedDatabase } from "./shared-server";

export type Subscription = {
  endpoint: string;
  member: string;
  keys: { p256dh: string; auth: string };
};

export function pushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
}

export function preparePush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:household@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

// One notification to one device. Dead subscriptions are pruned on the way
// out; transient failures are left for the next attempt.
export async function sendPush(
  sub: Subscription,
  payload: { title: string; body: string; tag: string; url: string },
): Promise<"sent" | "pruned" | "failed"> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload),
    );
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    // Statuses that mean the subscription itself is dead or malformed;
    // transient ones (402/413/429/5xx/no status) retry next time.
    if (status !== undefined && [400, 401, 403, 404, 410].includes(status)) {
      await sharedDatabase(
        "unsubscribe",
        { endpoint: sub.endpoint },
        "shared_push",
      ).catch(() => {});
      return "pruned";
    }
    // The endpoint is a capability URL, so log the failure without it.
    console.error("push send failed", status ?? (error as Error).name);
    return "failed";
  }
}

// One push to every subscribed device in the house except the sender's.
// Loads the roster itself so a route can fire it after responding.
export async function pushToHousemates(
  except: string,
  payload: { title: string; body: string; tag: string; url: string },
) {
  const push = await sharedDatabase("get", {}, "shared_push");
  const devices = (push.subscriptions as Subscription[]).filter(
    (sub) => sub.member !== except,
  );
  if (!devices.length) return 0;
  preparePush();
  let sent = 0;
  for (const sub of devices)
    if ((await sendPush(sub, payload)) === "sent") sent++;
  return sent;
}
