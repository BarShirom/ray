import { z } from "zod";

export const createReportSchema = z.object({
  description: z
    .string()
    .refine((value) => value.trim().length > 0, "Description is required"),
  type: z.enum(["emergency", "food", "general"]),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  media: z.array(z.string()).optional(),
});
