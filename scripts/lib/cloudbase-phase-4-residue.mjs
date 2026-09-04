import { createHash, createHmac } from "node:crypto";

import { runCloudBaseSdkCall, safeCloudBaseError } from "./cloudbase-phase-4-live-requests.mjs";

let credentialPromise;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return createHmac("sha256", key).update(value).digest(encoding);
}

async function managementCredential(config, timeoutMilliseconds) {
  if (credentialPromise) return credentialPromise;
  credentialPromise = (async () => {
    const apiKey = process.env.CLOUDBASE_API_KEY?.trim();
    if (!apiKey) throw new Error("CLOUDBASE_API_KEY is unavailable for the PG residue audit");
    const endpoint = new URL(
      `/capi/credential`,
      `https://${config.CLOUDBASE_ENV_ID}.${config.CLOUDBASE_REGION}.tcb-api.tencentcloudapi.com`,
    );
    const response = await fetch(endpoint, {
      body: JSON.stringify({ env: config.CLOUDBASE_ENV_ID }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(timeoutMilliseconds),
    });
    const payload = await response.json();
    if (!response.ok || payload?.code !== 0) {
      throw new Error(
        `CloudBase management credential exchange failed (${payload?.code ?? response.status})`,
      );
    }
    const credential = payload?.data;
    if (!credential?.TmpSecretId || !credential?.TmpSecretKey || !credential?.Token) {
      throw new Error("CloudBase management credential exchange returned incomplete data");
    }
    return credential;
  })();
  try {
    return await credentialPromise;
  } catch (error) {
    credentialPromise = undefined;
    throw error;
  }
}

async function executeReadOnlyRows(config, sql, timeoutMilliseconds, label) {
  const credential = await managementCredential(config, timeoutMilliseconds);
  const action = "ExecutePGSql";
  const service = "tcb";
  const host = "tcb.tencentcloudapi.com";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const body = JSON.stringify({ EnvId: config.CLOUDBASE_ENV_ID, Sql: sql });
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalHeaders =
    `content-type:application/json; charset=utf-8\nhost:${host}\n` +
    `x-tc-action:${action.toLowerCase()}\n`;
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, sha256(body)].join(
    "\n",
  );
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    timestamp,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const secretDate = hmac(`TC3${credential.TmpSecretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = hmac(secretSigning, stringToSign, "hex");
  const authorization =
    `TC3-HMAC-SHA256 Credential=${credential.TmpSecretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const response = await fetch(`https://${host}`, {
    body,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      Host: host,
      "X-TC-Action": action,
      "X-TC-Region": config.CLOUDBASE_REGION,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Token": credential.Token,
      "X-TC-Version": "2018-06-08",
    },
    method: "POST",
    signal: AbortSignal.timeout(timeoutMilliseconds),
  });
  const payload = await response.json();
  const result = payload?.Response;
  if (!response.ok || result?.Error) {
    throw new Error(`${label} failed (${result?.Error?.Code ?? response.status})`);
  }
  const resultRows = result?.Rows ?? [];
  if (!Array.isArray(resultRows)) throw new Error(`${label} returned invalid rows`);
  return resultRows.map((resultRow) => {
    const values = JSON.parse(resultRow);
    if (!Array.isArray(values)) throw new Error(`${label} returned an invalid row`);
    return values;
  });
}

async function readWithRetry(config, sql, timeoutMilliseconds, label) {
  const result = await runCloudBaseSdkCall(
    async () => ({
      data: await executeReadOnlyRows(config, sql, timeoutMilliseconds, label),
      error: null,
    }),
    label,
    { timeoutMilliseconds },
  );
  if (result?.error) {
    throw new Error(`${label}: ${safeCloudBaseError(result.error)}`, {
      cause: result.error,
    });
  }
  return result.data;
}

export async function cloudBaseTestUserOwnerIds(config, usernames, timeoutMilliseconds = 15_000) {
  if (
    !Array.isArray(usernames) ||
    usernames.length === 0 ||
    usernames.some((username) => !/^[a-z0-9_-]{5,64}$/.test(username))
  ) {
    throw new Error("PG test-user audit usernames are invalid");
  }
  const quoted = usernames.map((username) => `'${username}'`).join(", ");
  const rows = await readWithRetry(
    config,
    `select username, sub from auth.users where username in (${quoted}) order by username`,
    timeoutMilliseconds,
    "CloudBase PG test-user identity audit",
  );
  const identities = new Map();
  for (const values of rows) {
    if (
      values.length !== 2 ||
      !usernames.includes(values[0]) ||
      !/^[A-Za-z0-9:_-]{1,64}$/.test(values[1])
    ) {
      throw new Error("CloudBase PG test-user identity audit returned an invalid row");
    }
    identities.set(values[0], values[1]);
  }
  if (identities.size !== usernames.length) {
    throw new Error("CloudBase PG test-user identity audit did not find every test user");
  }
  return usernames.map((username) => identities.get(username));
}

export async function cloudBasePhaseFourResidueRows(
  config,
  ownerIds,
  timeoutMilliseconds = 15_000,
) {
  const rows = [];
  for (const ownerId of ownerIds) {
    if (!/^[A-Za-z0-9:_-]{1,64}$/.test(ownerId)) {
      throw new Error("PG residue audit owner ID is invalid");
    }
    const sql =
      "select bucket_id, name from storage.objects " +
      "where bucket_id in ('trip-assets', 'share-images') " +
      `and split_part(name, '/', 1) = '${ownerId}' order by bucket_id, name`;
    const resultRows = await readWithRetry(
      config,
      sql,
      timeoutMilliseconds,
      "CloudBase PG residue audit",
    );
    for (const values of resultRows) {
      if (values.length !== 2) throw new Error("PG residue audit returned an invalid row");
      rows.push({ bucket_id: values[0], name: values[1] });
    }
  }
  return rows;
}
