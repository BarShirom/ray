// Ray returns Retry-After as delta seconds. Ignore dates, malformed values and
// implausible waits instead of displaying untrusted header text or scheduling retries.
export function retryAfterSeconds(headers: unknown): number | undefined {
  if (headers === null || typeof headers !== "object") return;
  const values = headers as Record<string, unknown> & { get?: (name: string) => unknown };
  const value = typeof values.get === "function" ? values.get("retry-after") : values["retry-after"] ?? values["Retry-After"];
  if (typeof value !== "string" || value.length > 16) return;
  const text = value.trim();
  if (!/^\d{1,5}$/.test(text)) return;
  const seconds = Number(text);
  return seconds >= 1 && seconds <= 86_400 ? seconds : undefined;
}
