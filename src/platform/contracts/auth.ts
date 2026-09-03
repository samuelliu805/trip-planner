export type AppUserId = string;

export type AppUser = Readonly<{
  email: string | null;
  id: AppUserId;
  metadata: Readonly<Record<string, unknown>>;
}>;

export type SignInInput =
  | Readonly<{
      email: string;
      method: "email_password";
      password: string;
    }>
  | Readonly<{
      method: "username_password";
      password: string;
      username: string;
    }>;

export type PublicSelfRegistrationInput = Readonly<{
  email: string;
  method: "email_password";
  password: string;
  verificationRedirectTo?: string;
}>;

export type RedirectOAuthSignInInput = Readonly<{
  authorizationParameters?: Readonly<Record<string, string>>;
  provider: string;
  redirectTo: string;
}>;

export type ProviderTokenSignInInput = Readonly<{
  provider: string;
  token: string;
}>;

export interface AuthProvider {
  getCurrentUser(): Promise<AppUser | null>;
  requireUser(): Promise<AppUser>;
  signIn(input: SignInInput): Promise<AppUser>;
  signOut(): Promise<void>;
}

export interface PhoneOtpAuthProvider {
  clearChallenge(): Promise<void>;
  requestOtp(input: Readonly<{ phone: string }>): Promise<Readonly<{ resendAt: number }>>;
  verifyOtp(input: Readonly<{ code: string }>): Promise<AppUser>;
}

export interface PublicSelfRegistrationProvider {
  signUp(
    input: PublicSelfRegistrationInput,
  ): Promise<{ sessionCreated: boolean; user: AppUser | null }>;
}

export interface RedirectOAuthProvider {
  startOAuthSignIn(input: RedirectOAuthSignInInput): Promise<{ redirectUrl: string }>;
}

export interface AuthorizationCodeExchangeProvider {
  exchangeAuthorizationCode(code: string): Promise<AppUser>;
}

export interface ProviderTokenSignInProvider {
  signInWithProviderToken(input: ProviderTokenSignInInput): Promise<AppUser>;
}
