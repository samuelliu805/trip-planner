type TurnstileEnvironment = Readonly<Record<string, string | undefined>>;

export function turnstileSiteKey(environment: TurnstileEnvironment = process.env) {
  const value = environment.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return value || undefined;
}

export function captchaTokenFromFormData(formData: FormData) {
  const value = formData.get("captcha_token");
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function missingCaptchaToken(
  formData: FormData,
  environment: TurnstileEnvironment = process.env,
) {
  return Boolean(turnstileSiteKey(environment) && !captchaTokenFromFormData(formData));
}
