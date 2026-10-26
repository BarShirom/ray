import { z } from "zod";
import { boundedArray, INPUT_LIMITS, TEXT_LIMIT_MESSAGE } from "./inputBounds.js";

export const createReportSchema = z.object({
  description: z
    .string()
    .max(INPUT_LIMITS.description, TEXT_LIMIT_MESSAGE)
    .refine((value) => value.trim().length > 0, "Description is required"),
  type: z.enum(["emergency", "food", "general"]),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  media: boundedArray(z.string().max(INPUT_LIMITS.url, TEXT_LIMIT_MESSAGE), INPUT_LIMITS.legacyMedia).optional(),
});
