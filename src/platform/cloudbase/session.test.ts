import assert from "node:assert/strict";
import test from "node:test";

import {
  clearCloudBaseSession,
  cloudBaseCookieNames,
  writeCloudBaseSession,
} from "./session-cookies.ts";

test("writes phone-auth sessions only to the existing HttpOnly CN cookies", () => {
  const writes: Array<{
    name: string;
    options: Readonly<Record<string, unknown>>;
    value: string;
  }> = [];
  writeCloudBaseSession(
    {
      get() {
        return undefined;
      },
      set(name, value, options) {
        writes.push({ name, options, value });
      },
    },
    {
      accessToken: "access-token",
      refreshToken: "refresh-token",
    },
  );

  assert.deepEqual(
    writes.map(({ name }) => name),
    [cloudBaseCookieNames.accessToken, cloudBaseCookieNames.refreshToken],
  );
  assert.ok(writes.every(({ options }) => options.httpOnly === true && options.sameSite === "lax"));
});

test("sign-out clearing removes both CN session cookies", () => {
  const deleted: string[] = [];
  clearCloudBaseSession({
    delete(name) {
      deleted.push(name);
    },
    get() {
      return undefined;
    },
  });
  assert.deepEqual(deleted, [cloudBaseCookieNames.accessToken, cloudBaseCookieNames.refreshToken]);
});
