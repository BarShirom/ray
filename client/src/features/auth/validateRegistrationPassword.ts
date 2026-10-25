import { t } from "../../i18n";

// Match registerSchema's current Zod minimum, including its Unicode code-point count.
// Inspect the value only: passwords are never trimmed, normalized, or rewritten.
export function validateRegistrationPassword(password: string): string | undefined {
  if (!password) return t("auth.passwordRequired");
  if (Array.from(password).length < 8) return t("auth.passwordTooShort");
  return undefined;
}
