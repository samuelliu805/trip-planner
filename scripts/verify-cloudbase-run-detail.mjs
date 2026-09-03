import { readFirstJsonObject } from "./cloudbase-cli-json.mjs";

const failureMessage = "CloudBase Run detail verification failed.\n";

class MissingRuntimeEnvironmentNamesError extends Error {
  constructor(names) {
    super(`Missing required CloudBase Run runtime variable names: ${names.join(", ")}.`);
  }
}

class RuntimeEnvironmentMetadataError extends Error {
  constructor(names) {
    super(
      `Unable to inspect CloudBase Run runtime environment metadata. Required variable names: ${names.join(", ")}.`,
    );
  }
}

class NonNormalServiceError extends Error {
  constructor(serviceName) {
    super(
      `CloudBase Run service ${serviceName} is not Normal. Resume the approved dev service before live verification.`,
    );
  }
}

async function main() {
  const path = process.argv[2];
  const expectedServiceName = process.argv[3];
  const flags = process.argv.slice(4);
  const requireOnlineVersion = flags.includes("--require-online-version");
  const requiredRuntimeEnvironmentNames = [];
  for (let index = 0; index < flags.length; index += 1) {
    if (flags[index] === "--require-online-version") continue;
    if (flags[index] !== "--require-runtime-env") throw new Error();
    const name = flags[index + 1];
    if (!/^[A-Z][A-Z0-9_]*$/.test(name ?? "")) throw new Error();
    requiredRuntimeEnvironmentNames.push(name);
    index += 1;
  }
  if (
    !path ||
    !/^[A-Za-z0-9-]+$/.test(expectedServiceName ?? "") ||
    new Set(requiredRuntimeEnvironmentNames).size !== requiredRuntimeEnvironmentNames.length
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
    throw new NonNormalServiceError(expectedServiceName);
  }
  if (requiredRuntimeEnvironmentNames.length) {
    const rawEnvironment = payload?.data?.ServerConfig?.EnvParams;
    if (typeof rawEnvironment !== "string" || !rawEnvironment.trim()) {
      throw new RuntimeEnvironmentMetadataError(requiredRuntimeEnvironmentNames);
    }
    let environment;
    try {
      environment = JSON.parse(rawEnvironment);
    } catch {
      throw new RuntimeEnvironmentMetadataError(requiredRuntimeEnvironmentNames);
    }
    if (!environment || typeof environment !== "object" || Array.isArray(environment)) {
      throw new RuntimeEnvironmentMetadataError(requiredRuntimeEnvironmentNames);
    }
    const missingNames = requiredRuntimeEnvironmentNames.filter(
      (name) => !Object.prototype.hasOwnProperty.call(environment, name),
    );
    if (missingNames.length) throw new MissingRuntimeEnvironmentNamesError(missingNames);
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
  if (requiredRuntimeEnvironmentNames.length) {
    process.stdout.write(
      `Required CloudBase Run runtime variable names are present: ${requiredRuntimeEnvironmentNames.join(", ")}.\n`,
    );
  }
}

main().catch((error) => {
  process.stderr.write(
    error instanceof MissingRuntimeEnvironmentNamesError ||
      error instanceof RuntimeEnvironmentMetadataError ||
      error instanceof NonNormalServiceError
      ? `${failureMessage.trimEnd()} ${error.message}\n`
      : failureMessage,
  );
  process.exitCode = 1;
});
