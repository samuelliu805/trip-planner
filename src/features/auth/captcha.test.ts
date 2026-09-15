import assert from "node:assert/strict";
import test from "node:test";

import { captchaTokenFromFormData, missingCaptchaToken, turnstileSiteKey } from "./captcha.ts";

test("Turnstile configuration and submitted tokens are normalized", () => {
  assert.equal(turnstileSiteKey({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: " site-key " }), "site-key");
  assert.equal(turnstileSiteKey({}), undefined);

  const formData = new FormData();
  formData.set("captcha_token", " token ");
  assert.equal(captchaTokenFromFormData(formData), "token");
  assert.equal(
    missingCaptchaToken(formData, { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site-key" }),
    false,
  );
});

test("configured Turnstile fails closed when the form has no token", () => {
  assert.equal(
    missingCaptchaToken(new FormData(), { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site-key" }),
    true,
  );
  assert.equal(missingCaptchaToken(new FormData(), {}), false);
});
