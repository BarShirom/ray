import { t } from "../../i18n";

const utf8Encoder = new TextEncoder();

// Registration only: login keeps accepting existing passwords. Inspect the raw
// value without trimming, normalization or truncation, as the server does.
export function validateRegistrationPassword(password: string): string | undefined {
  if (!password) return t("auth.passwordRequired");
  // TextEncoder replaces unpaired surrogates, while bcryptjs encodes them
  // differently. Reject malformed text instead of changing the password.
  for (const character of password) {
    const unit = character.charCodeAt(0);
    if (character.length === 1 && unit >= 0xd800 && unit <= 0xdfff) return t("auth.passwordInvalidUnicode");
  }
  if (Array.from(password).length < 8) return t("auth.passwordTooShort");
  if (utf8Encoder.encode(password).length > 72) return t("auth.passwordTooLong");
  return undefined;
}
