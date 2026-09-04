"use client";

import cloudbase from "@cloudbase/js-sdk";

import type { BrowserPhoneOtpProvider } from "../contracts/auth.ts";
import { PlatformOperationError } from "../contracts/errors.ts";

import { normalizeCloudBaseError } from "./errors.ts";

type SignInData = Readonly<{
  session?: Readonly<{ access_token?: unknown; refresh_token?: unknown }>;
  updateUser?: (input: { nonce: string; password: string }) => Promise<SignInResult>;
  verifyOtp?: (input: { token: string }) => Promise<SignInResult>;
}>;

type SignInResult = Readonly<{ data: SignInData | null; error: unknown | null }>;

type BrowserPhoneAuthClient = Readonly<{
  resetPasswordForEmail(phone: string): Promise<SignInResult>;
  signInWithOtp(input: {
    options: { shouldCreateUser: boolean };
    phone: string;
  }): Promise<SignInResult>;
  signUp(input: { password: string; phone: string }): Promise<SignInResult>;
}>;

function required(name: string, value: string | undefined) {
  if (value?.trim()) return value.trim();
  throw new PlatformOperationError(
    "provider_unavailable",
    `Missing required CloudBase browser configuration: ${name}.`,
  );
}

function nationalPhone(phone: string) {
  const match = /^\+86(1[3-9]\d{9})$/.exec(phone);
  if (!match)
    throw new PlatformOperationError("invalid_credentials", "The phone number is invalid.");
  return match[1];
}

function sessionTokens(data: SignInData | null) {
  const accessToken = data?.session?.access_token;
  const refreshToken = data?.session?.refresh_token;
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    throw new PlatformOperationError(
      "authentication_required",
      "Phone sign-in could not be completed. Please try again.",
    );
  }
  return Object.freeze({ accessToken, refreshToken });
}

export class CloudBaseBrowserPhoneOtpProvider implements BrowserPhoneOtpProvider {
  private readonly auth: BrowserPhoneAuthClient;
  private passwordResetter: SignInData["updateUser"];
  private verifiedSession?: Readonly<{ accessToken: string; refreshToken: string }>;
  private verifier: SignInData["verifyOtp"];

  constructor(auth?: BrowserPhoneAuthClient) {
    this.auth =
      auth ??
      (() => {
        const app = cloudbase.init({
          accessKey: required(
            "NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY",
            process.env.NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY,
          ),
          auth: { detectSessionInUrl: false },
          env: required("NEXT_PUBLIC_CLOUDBASE_ENV_ID", process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID),
          persistence: "none",
          region: required(
            "NEXT_PUBLIC_CLOUDBASE_REGION",
            process.env.NEXT_PUBLIC_CLOUDBASE_REGION,
          ),
        });
        return app.auth as unknown as BrowserPhoneAuthClient;
      })();
  }

  clearChallenge() {
    this.verifiedSession = undefined;
    this.passwordResetter = undefined;
    this.verifier = undefined;
  }

  async requestOtp(
    input: Readonly<{
      intent: "sign_in" | "sign_up";
      password?: string;
      phone: string;
    }>,
  ) {
    this.clearChallenge();
    try {
      const phone = nationalPhone(input.phone);
      const result =
        input.intent === "sign_up"
          ? await this.auth.signUp({ password: input.password ?? "", phone })
          : await this.auth.signInWithOtp({
              options: { shouldCreateUser: false },
              phone,
            });
      if (result.error) throw result.error;
      if (typeof result.data?.verifyOtp !== "function") {
        throw new PlatformOperationError(
          "provider_unavailable",
          "A verification code could not be requested.",
        );
      }
      this.verifier = result.data.verifyOtp.bind(result.data);
    } catch (error) {
      throw normalizeCloudBaseError(error, "A verification code could not be requested.");
    }
  }

  async requestPasswordResetOtp(phone: string) {
    this.clearChallenge();
    try {
      const result = await this.auth.resetPasswordForEmail(nationalPhone(phone));
      if (result.error) throw result.error;
      if (typeof result.data?.updateUser !== "function") {
        throw new PlatformOperationError(
          "provider_unavailable",
          "A password reset code could not be requested.",
        );
      }
      this.passwordResetter = result.data.updateUser.bind(result.data);
    } catch (error) {
      throw normalizeCloudBaseError(error, "A password reset code could not be requested.");
    }
  }

  async resetPassword(code: string, password: string) {
    if (!this.passwordResetter) {
      throw new PlatformOperationError(
        "otp_expired",
        "Your verification request has expired. Request a new code.",
      );
    }
    try {
      const result = await this.passwordResetter({ nonce: code, password });
      if (result.error) throw result.error;
      this.passwordResetter = undefined;
    } catch (error) {
      throw normalizeCloudBaseError(error, "Password could not be reset. Please try again.");
    }
  }

  async verifyOtp(code: string) {
    if (this.verifiedSession) return this.verifiedSession;
    if (!this.verifier) {
      throw new PlatformOperationError(
        "otp_expired",
        "Your verification request has expired. Request a new code.",
      );
    }
    try {
      const result = await this.verifier({ token: code });
      if (result.error) throw result.error;
      const tokens = sessionTokens(result.data);
      this.verifiedSession = tokens;
      this.verifier = undefined;
      return tokens;
    } catch (error) {
      throw normalizeCloudBaseError(
        error,
        "Phone sign-in could not be completed. Please try again.",
      );
    }
  }
}
