// Intentionally exclude Error.message/stack: upstream failures can contain
// access tokens, private entry text, endpoint URLs, or request payloads.
export function logApiFailure(
  route: string,
  operation: string,
  error: unknown,
) {
  const raw =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const code = /^[A-Z0-9]{5}$/.test(raw) ? raw : null;
  console.error(
    JSON.stringify({
      event: "api_failure",
      route,
      operation,
      database_code: code,
      migration_related:
        code !== null && ["42883", "42P01", "42703"].includes(code),
    }),
  );
}
