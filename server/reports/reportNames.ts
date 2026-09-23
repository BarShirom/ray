import type { ReportNameFields } from "./reportStore.js";

// Preserve the existing truthy legacy-name / first-last fallback, without trimming.
export function reportFullName(user: ReportNameFields | null | undefined): string | null {
  if (!user) return null;
  if (user.name) return user.name;
  const parts = [user.firstName, user.lastName].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}
