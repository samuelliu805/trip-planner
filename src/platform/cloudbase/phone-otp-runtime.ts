import { PlatformOperationError } from "../contracts/errors.ts";

import type { PhoneChallenge } from "./phone-challenge-codec";

export type CloudBasePhoneAuthClient = Readonly<{
  getVerification(input: { phone_number: string }): Promise<{
    is_user?: boolean;
    verification_id?: string;
  }>;
  signInWithSms(input: {
    phoneNum: string;
    verificationCode: string;
    verificationInfo: { is_user: boolean; verification_id: string };
  }): Promise<unknown>;
  signUp(input: {
    locale: string;
    phone_number: string;
    verification_code: string;
    verification_token: string;
  }): Promise<unknown>;
  verify(input: {
    verification_code: string;
    verification_id: string;
  }): Promise<{ verification_token?: string }>;
}>;

function toCloudBasePhoneNumber(phone: string) {
  const match = /^\+86(1[3-9]\d{9})$/.exec(phone);
  if (!match) {
    throw new PlatformOperationError("invalid_credentials", "The phone number is invalid.");
  }

  // CloudBase JS SDK 3.9 normalizes unspaced values by prepending +86. Supplying
  // its documented country-code separator avoids turning E.164 into `+86 +86…`.
  return `+86 ${match[1]}`;
}

export async function requestCloudBasePhoneOtp(auth: CloudBasePhoneAuthClient, phone: string) {
  const result = await auth.getVerification({ phone_number: toCloudBasePhoneNumber(phone) });
  if (typeof result.verification_id !== "string" || !result.verification_id) {
    throw new PlatformOperationError(
      "provider_unavailable",
      "A verification code could not be requested.",
    );
  }
  return Object.freeze({
    isUser: result.is_user === true,
    verificationId: result.verification_id,
  });
}

export async function completeCloudBasePhoneOtp(
  auth: CloudBasePhoneAuthClient,
  challenge: PhoneChallenge,
  code: string,
) {
  if (challenge.isUser) {
    await auth.signInWithSms({
      phoneNum: toCloudBasePhoneNumber(challenge.phone),
      verificationCode: code,
      verificationInfo: { is_user: true, verification_id: challenge.verificationId },
    });
    return;
  }
  const verification = await auth.verify({
    verification_code: code,
    verification_id: challenge.verificationId,
  });
  if (!verification.verification_token) {
    throw new PlatformOperationError("otp_invalid", "That verification code is incorrect.");
  }
  await auth.signUp({
    locale: "zh-CN",
    phone_number: toCloudBasePhoneNumber(challenge.phone),
    verification_code: code,
    verification_token: verification.verification_token,
  });
}
