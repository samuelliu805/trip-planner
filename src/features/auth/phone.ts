const mainlandPhone = /^1[3-9]\d{9}$/;
const allowedFormatting = /^[+\d\s().-]+$/;

export function normalizeMainlandPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input || !allowedFormatting.test(input)) return null;
  const compact = input.replace(/[\s().-]/g, "");
  const national = compact.startsWith("+86") ? compact.slice(3) : compact;
  if (compact.startsWith("+") && !compact.startsWith("+86")) return null;
  return mainlandPhone.test(national) ? `+86${national}` : null;
}

export function maskMainlandPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `+86 •••• ${digits.slice(-4)}`;
}

export function phoneOtpResendState(resendAt: number, pending: boolean, now = Date.now()) {
  const secondsRemaining = Math.max(0, Math.ceil((resendAt - now) / 1_000));
  return Object.freeze({ disabled: pending || secondsRemaining > 0, secondsRemaining });
}
