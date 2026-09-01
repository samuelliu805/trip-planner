import { readFirstJsonObject } from "./cloudbase-cli-json.mjs";

const failureMessage = "CloudBase Run detail verification failed.\n";

async function main() {
  const path = process.argv[2];
  const expectedServiceName = process.argv[3];
  const requireOnlineVersion = process.argv[4] === "--require-online-version";
  if (
    !path ||
    !/^[A-Za-z0-9-]+$/.test(expectedServiceName ?? "") ||
    (process.argv[4] && !requireOnlineVersion) ||
    process.argv[5]
  ) {
    throw new Error();
  }

  const payload = await readFirstJsonObject(path);
  const baseInfo = payload?.data?.BaseInfo;
  if (!baseInfo || typeof baseInfo !== "object" || Array.isArray(baseInfo)) {
    throw new Error();
  }
  if (baseInfo.ServerName !== expectedServiceName) {
    throw new Error();
  }
  if (typeof baseInfo.Status !== "string" || baseInfo.Status.toLowerCase() !== "normal") {
    throw new Error();
  }
  if (requireOnlineVersion) {
    const onlineVersions = payload?.data?.OnlineVersionInfos;
    if (
      !Array.isArray(onlineVersions) ||
      onlineVersions.length === 0 ||
      !onlineVersions.some(
        (version) =>
          version &&
          typeof version === "object" &&
          !Array.isArray(version) &&
          (version.FlowRatio === 100 || version.FlowRatio === "100"),
      )
    ) {
      throw new Error();
    }
  }

  process.stdout.write(`CloudBase Run service ${expectedServiceName} reports Status=normal.\n`);
}

main().catch(() => {
  process.stderr.write(failureMessage);
  process.exitCode = 1;
});
