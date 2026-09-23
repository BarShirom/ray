// HTTP route IDs match the existing 24-hex-string contract, including uppercase.
export function isPublicId(value: unknown): value is string {
  return typeof value === "string" && value.length === 24 && /^[0-9a-fA-F]{24}$/.test(value);
}
