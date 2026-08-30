import "server-only";

import type {
  AppUser,
  AuthProvider,
  AuthorizationCodeExchangeProvider,
  PublicSelfRegistrationInput,
  PublicSelfRegistrationProvider,
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
  user_metadata?: Record<string, unknown>;
};

function appUser(user: SupabaseUserShape): AppUser {
  return Object.freeze({
    email: user.email ?? null,
    id: user.id,
    metadata: Object.freeze({ ...(user.user_metadata ?? {}) }),
  });
}

function operationFailed(message: string, cause?: unknown) {
  return new PlatformOperationError("unexpected", message, { cause });
}

export class SupabaseAuthProvider
  implements
    AuthProvider,
    AuthorizationCodeExchangeProvider,
    PublicSelfRegistrationProvider,
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
      options: input.verificationRedirectTo
        ? { emailRedirectTo: input.verificationRedirectTo }
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
