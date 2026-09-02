import { readFile } from "node:fs/promises";
import { stripVTControlCharacters } from "node:util";
import { pathToFileURL } from "node:url";

export function classifyCloudBaseFunctionInvokeText(input) {
  const text = stripVTControlCharacters(String(input)).slice(0, 65_536).toLowerCase();
  if (/cannot use import statement outside a module/.test(text)) {
    return "function-runtime-module-format";
  }
  if (
    text.includes("invoke") &&
    /cam authentication|unauthorized|not authorized|permission|access denied|无权限|未授权|拒绝访问/.test(
      text,
    )
  ) {
    return "scf-invoke-authorization";
  }
  if (
    /getfunction/.test(text) &&
    /unauthorized|permission|access denied|无权限|未授权/.test(text)
  ) {
    return "scf-get-function-authorization";
  }
  if (/not found|does not exist|不存在/.test(text)) return "function-not-found";
  if (/timeout|timed out|etimedout|超时/.test(text)) return "timeout";
  if (/调用失败|function (?:execution|invoke|run) failed|invoke failed/.test(text)) {
    return "function-invocation-failed";
  }
  return "unknown";
}

export function functionInvokeFailureGuidance(category) {
  switch (category) {
    case "scf-invoke-authorization":
      return "CloudBase CLI 3.8.1 calls the SCF Invoke action; allow scf:Invoke with resource * on the dedicated dev identity.";
    case "scf-get-function-authorization":
      return "Allow scf:GetFunction with resource * on the dedicated dev identity.";
    case "function-runtime-module-format":
      return "The deployed dev function still uses an incompatible Node module entrypoint; deploy the reviewed cleanup package to the approved dev function before rerunning.";
    case "function-invocation-failed":
      return "CAM login passed, but the pinned CLI rejected the function result; inspect the dev function runtime status without exposing its raw response.";
    case "function-not-found":
      return "Verify that trip-planner-cleanup exists in the approved CloudBase dev environment.";
    case "timeout":
      return "The bounded CloudBase function invocation timed out; retry after checking dev service health.";
    default:
      return "Verify scf:GetFunction and scf:Invoke with resource * for the dedicated dev identity.";
  }
}

export async function describeCloudBaseFunctionInvokeFailure(path) {
  let category = "unknown";
  try {
    category = classifyCloudBaseFunctionInvokeText(await readFile(path, "utf8"));
  } catch {
    // Keep the report bounded and secret-free when the CLI output cannot be read.
  }
  process.stderr.write(
    `CloudBase cleanup invocation failed (category=${category}). ${functionInvokeFailureGuidance(category)}\n`,
  );
  return category;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await describeCloudBaseFunctionInvokeFailure(process.argv[2]);
}
