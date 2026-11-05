import { z } from "zod";
import { INPUT_LIMITS, TEXT_LIMIT_MESSAGE } from "./inputBounds.js";
import { registrationPasswordError } from "./passwordPolicy.js";

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(INPUT_LIMITS.personName, TEXT_LIMIT_MESSAGE),
  lastName: z.string().trim().min(1, "Last name is required").max(INPUT_LIMITS.personName, TEXT_LIMIT_MESSAGE),
  email: z.string().max(INPUT_LIMITS.email, TEXT_LIMIT_MESSAGE).pipe(z.email("Invalid email")),
  password: z.string().superRefine((password, context) => {
    const message = registrationPasswordError(password);
    if (message) context.addIssue({ code: "custom", message });
  }),
  company: z.string().max(INPUT_LIMITS.company, TEXT_LIMIT_MESSAGE).optional(),
});

export const loginSchema = z.object({
  email: z.string().max(INPUT_LIMITS.email, TEXT_LIMIT_MESSAGE).pipe(z.email("Invalid email")),
  // Preserve raw existing-account verification, including historical overlong
  // inputs. A strict login byte limit needs an explicit compatibility decision.
  password: z.string().min(1, "Password is required"),
});
