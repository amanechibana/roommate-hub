import { beginSave } from "./save-status";

export const hasDatabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
export async function homeRequest(
  path: string,
  method = "GET",
  body?: unknown,
) {
  const finish =
    method === "POST" && ["/api/home", "/api/expenses"].includes(path)
      ? beginSave()
      : undefined;
  try {
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
      if (response.status === 401 && path !== "/api/session")
        window.dispatchEvent(new Event("household-signed-out"));
      const error = new Error(result.error || "Could not reach your home.");
      if (result.rejected === true) Object.assign(error, { rejected: true });
      throw error;
    }
    finish?.(true);
    return result;
  } catch (error) {
    finish?.(false);
    throw error;
  }
}
