import { z } from "zod";

// Product text limits count Unicode code points, as Zod's string checks do.
// The wider transport ceiling counts UTF-16 units and also bounds ignored fields.
export const INPUT_LIMITS = Object.freeze({
  personName: 100,
  company: 200,
  stationName: 200,
  email: 254,
  description: 10_000,
  feedingNote: 4_000,
  url: 2_048,
  legacyMedia: 6,
  depth: 4,
  objectFields: 32,
  fieldName: 128,
  values: 128,
  stringUnits: 32_768,
  errors: 8,
});

export const TEXT_LIMIT_MESSAGE = "Text exceeds allowed length";
export const ARRAY_LIMIT_MESSAGE = "Too many items";
export const SHAPE_LIMIT_MESSAGE = "Request structure exceeds allowed limits";

// A .max() on an array alone can still parse every item and allocate every issue.
// The pipe never reaches the item schema when this first check fails.
export function boundedArray<T extends z.ZodType>(item: T, limit: number) {
  return z.unknown()
    .refine(value => !Array.isArray(value) || value.length <= limit, ARRAY_LIMIT_MESSAGE)
    .pipe(z.array(item));
}

const fields = new Set([
  "firstName", "lastName", "email", "password", "company", "name", "location",
  "estimatedCats", "estimatedKittens", "image", "notes", "fedAt", "period", "food",
  "water", "note", "description", "type", "media", "imageAssetId", "mediaAssetIds",
  "purpose", "contentType", "byteLength", "checksum",
]);
export type BodyShapeError = { field: string; message: string };

// Iterative, bounded traversal runs before Zod, including on fields a schema strips.
// Check container sizes before queuing their children, and return only one issue.
export function bodyShapeError(input: unknown): BodyShapeError | undefined {
  const error = (field: string, message = SHAPE_LIMIT_MESSAGE): BodyShapeError => ({ field, message });
  if (input === null || typeof input !== "object" || Array.isArray(input)) return error("body");
  const pending = [{ value: input as unknown, depth: 0, field: "body" }];
  let values = 1;
  while (pending.length) {
    const { value, depth, field } = pending.pop()!;
    if (typeof value === "string") {
      if (value.length > INPUT_LIMITS.stringUnits) return error(field, TEXT_LIMIT_MESSAGE);
      continue;
    }
    if (value === null || typeof value !== "object") continue;
    if (depth > INPUT_LIMITS.depth) return error(field);
    if (Array.isArray(value)) {
      if (value.length > INPUT_LIMITS.legacyMedia) return error(field, ARRAY_LIMIT_MESSAGE);
      if ((values += value.length) > INPUT_LIMITS.values) return error(field);
      for (const child of value) pending.push({ value: child, depth: depth + 1, field });
      continue;
    }
    let count = 0;
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (++count > INPUT_LIMITS.objectFields || key.length > INPUT_LIMITS.fieldName || ++values > INPUT_LIMITS.values) return error(field);
      pending.push({
        value: (value as Record<string, unknown>)[key], depth: depth + 1,
        field: depth === 0 && fields.has(key) ? key : field,
      });
    }
  }
}
