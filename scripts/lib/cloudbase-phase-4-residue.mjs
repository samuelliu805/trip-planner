import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { runCloudBaseSdkCall, safeCloudBaseError } from "./cloudbase-phase-4-live-requests.mjs";

const execFileAsync = promisify(execFile);

async function executeReadOnlyRows(config, sql, timeoutMilliseconds, label) {
  const { stdout } = await execFileAsync(
    "npx",
    [
      "--yes",
      "--package",
      "@cloudbase/cli@3.8.1",
      "tcb",
      "db",
      "execute",
      "--env-id",
      config.CLOUDBASE_ENV_ID,
      "--sql",
      sql,
      "--json",
    ],
    { maxBuffer: 1024 * 1024, timeout: timeoutMilliseconds },
  );
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`${label} returned invalid JSON`);
  const payload = JSON.parse(stdout.slice(start, end + 1));
  const resultRows = payload?.data?.Rows ?? [];
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
