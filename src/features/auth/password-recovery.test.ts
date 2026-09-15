import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { passwordRecoverySchema, passwordResetRequestSchema } from "./schema.ts";

test("email password recovery validates the address and replacement password", () => {
  assert.equal(
    passwordResetRequestSchema.safeParse({ email: "traveler@example.com" }).success,
    true,
  );
  assert.equal(passwordResetRequestSchema.safeParse({ email: "not-an-email" }).success, false);

  assert.equal(
    passwordRecoverySchema.safeParse({ confirmation: "Journey123", password: "Journey123" })
      .success,
    true,
  );
  assert.equal(
    passwordRecoverySchema.safeParse({ confirmation: "Journey124", password: "Journey123" })
      .success,
    false,
  );
  assert.equal(
    passwordRecoverySchema.safeParse({ confirmation: "12345678", password: "12345678" }).success,
    false,
  );
});

test("Global email auth keeps confirmation, CAPTCHA, and recovery wired through Supabase", async () => {
  const [actions, callback, provider, recovery] = await Promise.all([
    readFile(new URL("./actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/auth/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../platform/supabase/auth-provider.ts", import.meta.url), "utf8"),
    readFile(new URL("./password-recovery-actions.ts", import.meta.url), "utf8"),
  ]);

  assert.match(actions, /const siteUrl = siteUrlFromHeaders\(await headers\(\)\)/);
  assert.match(actions, /verificationRedirectTo: confirmationUrl\.toString\(\)/);
  assert.match(actions, /captchaToken: captchaTokenFromFormData\(formData\)/);
  assert.match(provider, /signInWithPassword\(credentials\)/);
  assert.match(provider, /resetPasswordForEmail\(input\.email/);
  assert.match(recovery, /const siteUrl = siteUrlFromHeaders\(await headers\(\)\)/);
  assert.match(
    provider,
    /completePasswordRecovery[\s\S]*updateUser\(\{ password: input\.newPassword \}\)/,
  );
  assert.match(recovery, /auth_flow", "recovery"/);
  assert.match(callback, /authFlow === "recovery" \? "\/reset-password\?recovery=1"/);
});
