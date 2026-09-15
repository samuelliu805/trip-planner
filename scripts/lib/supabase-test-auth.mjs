import assert from "node:assert/strict";

function resultData(result, label) {
  if (result.error) {
    throw new Error(
      `${label}: ${result.error.code ?? "error"} ${String(result.error.message ?? "").slice(0, 240)}`,
    );
  }
  return result.data;
}

async function directly(_label, operation) {
  return operation();
}

export async function signInWithAdminMagicLink({
  admin,
  client,
  email,
  expectedUserId,
  label = "temporary user",
  run = directly,
}) {
  const generated = resultData(
    await run(`${label} controlled link`, () =>
      admin.auth.admin.generateLink({ email, type: "magiclink" }),
    ),
    `${label} controlled link`,
  );
  const tokenHash = generated.properties?.hashed_token;
  assert.ok(tokenHash, `${label} controlled link did not return a token hash.`);

  const verified = resultData(
    await run(`${label} controlled verification`, () =>
      client.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" }),
    ),
    `${label} controlled verification`,
  );
  assert.equal(verified.user?.id, expectedUserId, `${label} established the wrong user.`);
  assert.ok(
    verified.session?.access_token && verified.session.refresh_token,
    `${label} did not establish a complete session.`,
  );
  return verified.session;
}
