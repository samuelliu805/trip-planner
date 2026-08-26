import { z } from "zod";

export const updateAccountSchema = z.object({
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Choose a valid three-letter currency code."),
  homeCity: z.string().trim().max(120, "Keep your home city under 120 characters."),
  locale: z.enum(["en", "zh-CN"], "Choose your preferred language."),
});
