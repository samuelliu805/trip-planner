export type AccountProfile = Readonly<{
  defaultCurrency: string;
  homeCity: string | null;
  preferredLocale: string | null;
}>;

export type UpdateAccountProfileInput = Readonly<{
  defaultCurrency: string;
  homeCity: string | null;
  preferredLocale: string;
}>;

export interface AccountProfileRepository {
  getForCurrentUser(): Promise<AccountProfile | null>;
  saveForCurrentUser(input: UpdateAccountProfileInput): Promise<AccountProfile>;
}
