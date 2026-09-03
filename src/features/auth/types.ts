export type AuthActionState = {
  error?: string;
  success?: string;
};

export type PhoneOtpActionState = {
  /** Encrypted and authenticated; contains no readable phone number or provider challenge. */
  challengeToken?: string;
  error?: string;
  maskedPhone?: string;
  resendAt?: number;
  step: "phone" | "otp";
};
