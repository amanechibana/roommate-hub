import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_DURATION = 60 * 60 * 24 * 30;
export function equalSecret(a: string, b: string): boolean {
  const key = "common-ground-constant-time-comparison";
  return timingSafeEqual(
    createHmac("sha256", key).update(a).digest(),
    createHmac("sha256", key).update(b).digest(),
  );
}
export function makeSession(
  secret: string,
  code: string,
  now = Date.now(),
): string {
  const payload = `${Math.floor(now / 1000) + SESSION_DURATION}.${randomBytes(24).toString("base64url")}`;
  return `${payload}.${createHmac("sha256", secret).update(`${code}:${payload}`).digest("base64url")}`;
}
export function validSession(
  token: string | undefined,
  secret: string,
  code: string,
  now = Date.now(),
): boolean {
  if (!token || !secret || !code || token.length > 256) return false;
  const [expiry, nonce, signature, ...extra] = token.split(".");
  const seconds = Math.floor(now / 1000);
  if (
    extra.length ||
    !nonce ||
    !signature ||
    !/^\d+$/.test(expiry) ||
    Number(expiry) <= seconds ||
    Number(expiry) > seconds + SESSION_DURATION
  )
    return false;
  return equalSecret(
    signature,
    createHmac("sha256", secret)
      .update(`${code}:${expiry}.${nonce}`)
      .digest("base64url"),
  );
}
