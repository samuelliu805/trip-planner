export type AppUserId = string;

export type AppUser = Readonly<{
  email: string | null;
  id: AppUserId;
  metadata: Readonly<Record<string, unknown>>;
}>;

export type SignInInput = Readonly<{ email: string; password: string }>;
export type SignUpInput = SignInInput & Readonly<{ emailRedirectTo?: string }>;
export type OAuthSignInInput = Readonly<{
  provider: "google";
  redirectTo: string;
  selectAccount?: boolean;
}>;

export interface AuthProvider {
  getCurrentUser(): Promise<AppUser | null>;
  requireUser(): Promise<AppUser>;
  signIn(input: SignInInput): Promise<AppUser>;
  signOut(): Promise<void>;
}

export interface AuthenticationSessionProvider extends AuthProvider {
  exchangeAuthorizationCode(code: string): Promise<AppUser>;
  signUp(input: SignUpInput): Promise<{ sessionCreated: boolean; user: AppUser | null }>;
  startOAuthSignIn(input: OAuthSignInInput): Promise<{ redirectUrl: string }>;
}
