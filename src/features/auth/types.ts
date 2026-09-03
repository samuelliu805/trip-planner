export type AuthActionState = {
  error?: string;
  success?: string;
};

export type PhoneOtpActionState = {
  error?: string;
  maskedPhone?: string;
  resendAt?: number;
  step: "phone" | "otp";
};
