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

export const changePasswordSchema = z
  .object({
    confirmation: z.string(),
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(32, "Password must be 32 characters or fewer.")
      .regex(/[A-Za-z]/, "Password must include a letter.")
      .regex(/\d/, "Password must include a number."),
  })
  .refine(({ confirmation, newPassword }) => confirmation === newPassword, {
    message: "The new passwords do not match.",
    path: ["confirmation"],
  });
