import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type PhoneChallenge = Readonly<{
  expiresAt: number;
  isUser: boolean;
  issuedAt: number;
  phone: string;
  verificationId: string;
}>;

const version = "v1";

function encryptionKey(secret: string) {
  return createHash("sha256")
    .update("trip-planner/cloudbase/phone-challenge/v1\0")
    .update(secret)
    .digest();
}

function decodeBase64Url(value: string) {
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw new Error("Non-canonical base64url");
  return decoded;
}

export function sealPhoneChallenge(challenge: PhoneChallenge, secret: string) {
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), initializationVector);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(challenge), "utf8"),
    cipher.final(),
  ]);
  return [
    version,
    initializationVector.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function openPhoneChallenge(
  value: string | undefined,
  secret: string,
  now = Date.now(),
): PhoneChallenge | null {
  if (!value || value.length > 4_096) return null;
  try {
    const [candidateVersion, initializationVector, authenticationTag, ciphertext, extra] =
      value.split(".");
    if (
      candidateVersion !== version ||
      !initializationVector ||
      !authenticationTag ||
      !ciphertext ||
      extra
    )
      return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(secret),
      decodeBase64Url(initializationVector),
    );
    decipher.setAuthTag(decodeBase64Url(authenticationTag));
    const parsed = JSON.parse(
      Buffer.concat([decipher.update(decodeBase64Url(ciphertext)), decipher.final()]).toString(
        "utf8",
      ),
    ) as Partial<PhoneChallenge>;
    if (
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= now ||
      parsed.expiresAt > now + 10 * 60_000 ||
      typeof parsed.issuedAt !== "number" ||
      parsed.issuedAt > now + 5_000 ||
      typeof parsed.isUser !== "boolean" ||
      typeof parsed.phone !== "string" ||
      !/^\+861[3-9]\d{9}$/.test(parsed.phone) ||
      typeof parsed.verificationId !== "string" ||
      !parsed.verificationId ||
      parsed.verificationId.length > 512
    )
      return null;
    return Object.freeze(parsed as PhoneChallenge);
  } catch {
    return null;
  }
}

export function openFirstPhoneChallenge(
  values: readonly (string | undefined)[],
  secret: string,
  now = Date.now(),
) {
  for (const value of values) {
    const challenge = openPhoneChallenge(value, secret, now);
    if (challenge) return challenge;
  }
  return null;
}
