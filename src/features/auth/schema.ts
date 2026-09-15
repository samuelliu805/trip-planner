import { z } from "zod";

export const emailCredentialSchema = z.object({
  credential: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const signupCredentialSchema = emailCredentialSchema.extend({
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const usernameCredentialSchema = z.object({
  credential: z.string().trim().min(1, "Enter your username.").max(128, "Username is too long."),
  password: z.string().min(1, "Enter your password."),
});

export const phoneCredentialSchema = z.object({
  credential: z.string().trim(),
  password: z.string().min(1, "Enter your password."),
});

export const passwordResetRequestSchema = z.object({
  email: z.email("Enter a valid email address."),
});

export const passwordRecoverySchema = z
  .object({
    confirmation: z.string(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(32, "Password must be 32 characters or fewer.")
      .regex(/[A-Za-z]/, "Password must include a letter.")
      .regex(/\d/, "Password must include a number."),
  })
  .refine(({ confirmation, password }) => confirmation === password, {
    message: "The new passwords do not match.",
    path: ["confirmation"],
  });
