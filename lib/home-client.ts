export const hasDatabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
export async function homeRequest(
  path: string,
  method = "GET",
  body?: unknown,
) {
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
    // Sign-in attempts also 401 on a wrong code; those must not bounce the
    // person back to the code screen they are already on.
    if (response.status === 401 && path !== "/api/session")
      window.dispatchEvent(new Event("household-signed-out"));
    const error = new Error(result.error || "Could not reach your home.");
    if (result.rejected === true) Object.assign(error, { rejected: true });
    throw error;
  }
  return result;
}
