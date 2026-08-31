import type { SignInInput } from "../contracts/auth.ts";
import { PlatformOperationError } from "../contracts/errors.ts";

export function supabasePasswordCredentials(input: SignInInput) {
  if (input.method === "email_password") {
    return { email: input.email, password: input.password };
  }

  throw new PlatformOperationError(
    "unsupported_operation",
    "Supabase does not support username and password sign-in.",
  );
}
