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
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path === "/api/home")
      window.dispatchEvent(new Event("household-signed-out"));
    throw new Error(result.error || "Could not reach your home.");
  }
  return result;
}
