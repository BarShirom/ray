import { Buffer } from "node:buffer";

export const PASSWORD_MIN_CODE_POINTS = 8;
export const PASSWORD_MAX_UTF8_BYTES = 72;
export const PASSWORD_MESSAGES = Object.freeze({
  minimum: "Password must be at least 8 characters",
  maximum: "Password must be at most 72 UTF-8 bytes",
  invalidUnicode: "Password contains invalid Unicode",
});

// New registrations must fit bcrypt's effective input boundary. Keep the raw
// string: whitespace, combining marks and all well-formed Unicode are allowed.
export function registrationPasswordError(password: string): string | undefined {
  let codePoints = 0;
  for (const character of password) {
    const codeUnit = character.charCodeAt(0);
    // Iteration yields valid surrogate pairs together. A remaining surrogate is
    // ill-formed: bcryptjs and standard UTF-8 encoders encode it differently.
    if (character.length === 1 && codeUnit >= 0xd800 && codeUnit <= 0xdfff) {
      return PASSWORD_MESSAGES.invalidUnicode;
    }
    codePoints++;
  }
  if (codePoints < PASSWORD_MIN_CODE_POINTS) return PASSWORD_MESSAGES.minimum;
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_UTF8_BYTES) return PASSWORD_MESSAGES.maximum;
  return undefined;
}
