import "server-only";

import type {
  AppUser,
  AuthenticationSessionProvider,
  OAuthSignInInput,
  SignInInput,
  SignUpInput,
} from "@/platform/contracts/auth";
import { PlatformOperationError } from "@/platform/contracts/errors";

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

export class SupabaseAuthProvider implements AuthenticationSessionProvider {
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
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword(input);
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

  async signUp(input: SignUpInput) {
    const supabase = await createSupabaseServerClient();
    const { emailRedirectTo, ...credentials } = input;
    const { data, error } = await supabase.auth.signUp({
      ...credentials,
      options: emailRedirectTo ? { emailRedirectTo } : undefined,
    });
    if (error) throw operationFailed("Account creation failed.", error);
    return {
      sessionCreated: Boolean(data.session),
      user: data.user ? appUser(data.user) : null,
    };
  }

  async startOAuthSignIn(input: OAuthSignInInput) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: input.provider,
      options: {
        queryParams: input.selectAccount ? { prompt: "select_account" } : undefined,
        redirectTo: input.redirectTo,
      },
    });
    if (error || !data.url) throw operationFailed("OAuth sign-in could not start.", error);
    return { redirectUrl: data.url };
  }
}
