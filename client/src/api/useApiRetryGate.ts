import { useEffect, useState } from "react";
import type { ApiFailure } from "./errors";

/** Delay only explicit retries; never schedule a request or retain form data. */
export function useApiRetryGate(error: ApiFailure | null | undefined): boolean {
  const [elapsed, setElapsed] = useState<ApiFailure | null>(null);
  const seconds = error?.kind === "rate-limit" ? error.retryAfter ?? 0 : 0;
  useEffect(() => {
    if (!error || seconds <= 0) return;
    const timer = setTimeout(() => setElapsed(error), seconds * 1000);
    return () => clearTimeout(timer);
  }, [error, seconds]);
  return seconds > 0 && elapsed !== error;
}
