import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { maskMainlandPhone, normalizeMainlandPhone, phoneOtpResendState } from "./phone.ts";

test("normalizes supported mainland China phone formats", () => {
  assert.equal(normalizeMainlandPhone("13800138000"), "+8613800138000");
  assert.equal(normalizeMainlandPhone("+86 138-0013-8000"), "+8613800138000");
  assert.equal(normalizeMainlandPhone("+86 (138) 0013 8000"), "+8613800138000");
});

test("rejects unsupported countries and invalid mainland prefixes", () => {
  assert.equal(normalizeMainlandPhone("+1 415 555 0100"), null);
  assert.equal(normalizeMainlandPhone("12800138000"), null);
  assert.equal(normalizeMainlandPhone("1380013800"), null);
  assert.equal(normalizeMainlandPhone("13800138000 ext 2"), null);
});

test("masks the phone number without retaining its middle digits", () => {
  assert.equal(maskMainlandPhone("+8613800138000"), "+86 •••• 8000");
});

test("keeps resend disabled through the full countdown and while a request is pending", () => {
  const now = 1_800_000_000_000;
  assert.deepEqual(phoneOtpResendState(now + 60_000, false, now), {
    disabled: true,
    secondsRemaining: 60,
  });
  assert.deepEqual(phoneOtpResendState(now, false, now), {
    disabled: false,
    secondsRemaining: 0,
  });
  assert.equal(phoneOtpResendState(now, true, now).disabled, true);
});

test("phone auth fields share numeric typography without a fake verification code", async () => {
  const [form, fields] = await Promise.all([
    readFile(new URL("./components/phone-auth-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/phone-credential-fields.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(fields, /font-sans text-base leading-none/);
  assert.match(fields, />\+86<\/span>/);
  assert.match(fields, /name=\{name\}[\s\S]*pattern="\[0-9\]\{11\}"/);
  assert.match(form, /name="code"[\s\S]*pattern="\[0-9\]\{6\}"/);
  assert.doesNotMatch(
    `${form}\n${fields}`,
    /placeholder="000000"|defaultValue="000000"|value="000000"/,
  );
});
