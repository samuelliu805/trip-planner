import assert from "node:assert/strict";
import test from "node:test";

import { defaultLocaleForRegion, resolveLocaleState } from "./config.ts";

test("uses regional locale defaults", () => {
  assert.equal(defaultLocaleForRegion("global"), "en");
  assert.equal(defaultLocaleForRegion("cn"), "zh-CN");
});

test("resolves browser cookie, then profile, then regional default", () => {
  assert.deepEqual(
    resolveLocaleState({ appRegion: "cn", browserLocale: "en", profileLocale: "zh-CN" }),
    { locale: "en", source: "browser" },
  );
  assert.deepEqual(resolveLocaleState({ appRegion: "cn", profileLocale: "en" }), {
    locale: "en",
    source: "profile",
  });
  assert.deepEqual(resolveLocaleState({ appRegion: "cn" }), {
    locale: "zh-CN",
    source: "regional_default",
  });
});
