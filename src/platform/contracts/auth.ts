export type AppUserId = string;

export type AppUser = Readonly<{
  email: string | null;
  id: AppUserId;
  metadata: Readonly<Record<string, unknown>>;
  phone: string | null;
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
    }>
  | Readonly<{
      method: "phone_password";
      password: string;
      phone: string;
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
  establishSession(
    input: Readonly<{ accessToken: string; refreshToken: string }>,
  ): Promise<AppUser>;
}

export interface BrowserPhoneOtpProvider {
  clearChallenge(): void;
  requestOtp(
    input: Readonly<{
      intent: "sign_in" | "sign_up";
      password?: string;
      phone: string;
    }>,
  ): Promise<void>;
  requestPasswordResetOtp(phone: string): Promise<void>;
  resetPassword(code: string, password: string): Promise<void>;
  verifyOtp(code: string): Promise<Readonly<{ accessToken: string; refreshToken: string }>>;
}

export interface PasswordManagementProvider {
  changePassword(input: Readonly<{ currentPassword: string; newPassword: string }>): Promise<void>;
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
