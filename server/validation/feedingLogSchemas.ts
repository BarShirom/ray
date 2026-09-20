import { z } from "zod";

export const createFeedingLogSchema = z.strictObject({
  fedAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional(),
  period: z.enum(["morning", "noon", "evening"]).optional(),
  food: z.boolean().optional(),
  water: z.boolean().optional(),
  note: z.string().trim().optional(),
});
