import "server-only";

import type {
  AppUser,
  AuthProvider,
  AuthorizationCodeExchangeProvider,
  PublicSelfRegistrationInput,
  PublicSelfRegistrationProvider,
  PasswordManagementProvider,
  PasswordRecoveryProvider,
  RedirectOAuthProvider,
  RedirectOAuthSignInInput,
  SignInInput,
} from "@/platform/contracts/auth";
import { PlatformOperationError } from "@/platform/contracts/errors";

import { supabasePasswordCredentials } from "./auth-input";
import { createSupabaseServerClient } from "./server";

type SupabaseUserShape = {
  email?: string;
  id: string;
  phone?: string;
  user_metadata?: Record<string, unknown>;
};

function appUser(user: SupabaseUserShape): AppUser {
  return Object.freeze({
    email: user.email ?? null,
    id: user.id,
    metadata: Object.freeze({ ...(user.user_metadata ?? {}) }),
    phone: user.phone ?? null,
  });
}

function operationFailed(message: string, cause?: unknown) {
  const code =
    typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : undefined;
  if (code === "email_not_confirmed") {
    return new PlatformOperationError("email_not_confirmed", "Email confirmation is required.", {
      cause,
    });
  }
  if (code === "invalid_credentials") {
    return new PlatformOperationError("invalid_credentials", "Invalid credentials.", { cause });
  }
  if (code === "captcha_failed" || code === "captcha_required") {
    return new PlatformOperationError(
      "captcha_required",
      "Complete the security check, then try again.",
      { cause },
    );
  }
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
    return new PlatformOperationError(
      "rate_limited",
      "Too many requests. Wait a moment, then try again.",
      { cause },
    );
  }
  return new PlatformOperationError("unexpected", message, { cause });
}

export class SupabaseAuthProvider
  implements
    AuthProvider,
    AuthorizationCodeExchangeProvider,
    PublicSelfRegistrationProvider,
    PasswordManagementProvider,
    PasswordRecoveryProvider,
    RedirectOAuthProvider
{
  async getCurrentUser() {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user ? appUser(data.user) : null;
  }

  async requireUser() {
    const user = await this.getCurrentUser();
    if (!user)
      throw new PlatformOperationError("authentication_required", "Authentication is required.");
    return user;
  }

  async signIn(input: SignInInput) {
    const credentials = supabasePasswordCredentials(input);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    if (error || !data.user) throw operationFailed("Authentication failed.", error);
    return appUser(data.user);
  }

  async signOut() {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw operationFailed("Sign out failed.", error);
  }

  async changePassword(input: Readonly<{ currentPassword: string; newPassword: string }>) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({
      current_password: input.currentPassword,
      password: input.newPassword,
    });
    if (error) throw operationFailed("Password could not be changed.", error);
  }

  async completePasswordRecovery(input: Readonly<{ newPassword: string }>) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password: input.newPassword });
    if (error) throw operationFailed("Password could not be reset.", error);
  }

  async requestPasswordRecovery(
    input: Readonly<{ captchaToken?: string; email: string; redirectTo: string }>,
  ) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
      captchaToken: input.captchaToken,
      redirectTo: input.redirectTo,
    });
    if (error) throw operationFailed("Password recovery email could not be sent.", error);
  }

  async verifyPasswordRecoveryToken(tokenHash: string) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });
    if (error || !data.user) throw operationFailed("Password recovery link is invalid.", error);
    return appUser(data.user);
  }

  async exchangeAuthorizationCode(code: string) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) throw operationFailed("Authorization code exchange failed.", error);
    return appUser(data.user);
  }

  async signUp(input: PublicSelfRegistrationInput) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options:
        input.verificationRedirectTo || input.captchaToken
          ? {
              captchaToken: input.captchaToken,
              emailRedirectTo: input.verificationRedirectTo,
            }
          : undefined,
    });
    if (error) throw operationFailed("Account creation failed.", error);
    return {
      sessionCreated: Boolean(data.session),
      user: data.user ? appUser(data.user) : null,
    };
  }

  async startOAuthSignIn(input: RedirectOAuthSignInInput) {
    if (input.provider !== "google") {
      throw new PlatformOperationError(
        "unsupported_operation",
        `Supabase redirect OAuth is not configured for ${input.provider}.`,
      );
    }
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        queryParams: input.authorizationParameters,
        redirectTo: input.redirectTo,
      },
    });
    if (error || !data.url) throw operationFailed("OAuth sign-in could not start.", error);
    return { redirectUrl: data.url };
  }
}
