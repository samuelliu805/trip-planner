import assert from "node:assert/strict";
import test from "node:test";

import {
  cloudBaseRunUpdateBody,
  readCloudBaseBuildUpload,
  submitCloudBaseRunSource,
} from "./cloudbase-run-source-submitter.mjs";

const uploadPayload = {
  Response: {
    PackageName: "package-name",
    PackageVersion: "package-version",
    UploadHeaders: [
      { Key: "Content-Type", Value: "application/zip" },
      { Key: "x-cos-meta-source", Value: "cloudbase" },
    ],
    UploadUrl: "https://example.cos.ap-shanghai.myqcloud.com/source.zip?signature=secret",
  },
};

test("accepts bounded HTTPS CloudBase upload metadata", () => {
  assert.deepEqual(readCloudBaseBuildUpload(uploadPayload), {
    headers: [
      { key: "Content-Type", value: "application/zip" },
      { key: "x-cos-meta-source", value: "cloudbase" },
    ],
    packageName: "package-name",
    packageVersion: "package-version",
    uploadUrl: uploadPayload.Response.UploadUrl,
  });
  assert.deepEqual(readCloudBaseBuildUpload({ data: uploadPayload.Response }), {
    headers: [
      { key: "Content-Type", value: "application/zip" },
      { key: "x-cos-meta-source", value: "cloudbase" },
    ],
    packageName: "package-name",
    packageVersion: "package-version",
    uploadUrl: uploadPayload.Response.UploadUrl,
  });
});

test("rejects unsafe upload URLs and header injection", () => {
  assert.throws(
    () =>
      readCloudBaseBuildUpload({
        ...uploadPayload.Response,
        UploadUrl: "http://example.invalid/source.zip",
      }),
    /clean HTTPS URL/,
  );
  assert.throws(
    () =>
      readCloudBaseBuildUpload({
        ...uploadPayload.Response,
        UploadHeaders: [{ Key: "x-safe", Value: "yes\r\nx-unsafe: injected" }],
      }),
    /upload header value was invalid/,
  );
});

test("builds the same full-release update used by the CloudBase CLI", () => {
  assert.deepEqual(
    cloudBaseRunUpdateBody({
      envId: "env-id",
      packageName: "package-name",
      packageVersion: "package-version",
      serviceName: "service-name",
    }),
    {
      DeployInfo: {
        DeployType: "package",
        PackageName: "package-name",
        PackageVersion: "package-version",
        ReleaseType: "FULL",
      },
      EnvId: "env-id",
      Items: [
        { IntValue: 8080, Key: "Port" },
        { ArrayValue: ["OA", "PUBLIC", "MINIAPP"], Key: "AccessTypes" },
      ],
      ServerName: "service-name",
    },
  );
});

test("uploads with curl before registering the exact package release", async () => {
  const calls = [];
  const logs = [];
  const responses = [
    {
      code: 0,
      output: `CloudBase CLI\n${JSON.stringify({ data: uploadPayload.Response })}`,
      timedOut: false,
    },
    { code: 0, output: "", timedOut: false },
    { code: 0, output: '{"RequestId":"request-id"}', timedOut: false },
  ];
  await submitCloudBaseRunSource({
    archivePath: "/tmp/source.zip",
    cli: ["--yes", "--package", "@cloudbase/cli@3.8.1", "tcb"],
    envId: "env-id",
    log: (message) => logs.push(message),
    run: async (...arguments_) => {
      calls.push(arguments_);
      return responses.shift();
    },
    serviceName: "service-name",
  });

  assert.equal(calls.length, 3);
  assert.equal(calls[0][0], "npx");
  const describeIndex = calls[0][1].indexOf("api");
  assert.deepEqual(calls[0][1].slice(describeIndex, describeIndex + 3), [
    "api",
    "tcb",
    "DescribeCloudBaseBuildService",
  ]);
  assert.equal(calls[1][0], "curl");
  assert.ok(calls[1][1].includes("--upload-file"));
  assert.ok(calls[1][1].includes(uploadPayload.Response.UploadUrl));
  assert.equal(calls[1][1][calls[1][1].indexOf("--max-time") + 1], "600");
  assert.equal(
    calls[1][1][calls[1][1].indexOf("--write-out") + 1],
    "\nhttp=%{http_code} uploaded=%{size_upload} total=%{time_total}",
  );
  assert.equal(calls[1][2].timeoutMs, 630_000);
  assert.equal(calls[2][0], "npx");
  assert.ok(calls[2][1].includes("UpdateCloudRunServer"));
  const body = JSON.parse(calls[2][1][calls[2][1].indexOf("--body") + 1]);
  assert.equal(body.DeployInfo.PackageName, "package-name");
  assert.equal(responses.length, 0);
  assert.deepEqual(logs, [
    "Requesting a fresh CloudBase source upload target.",
    "Uploading the bounded CloudBase source archive with curl.",
    "Registering the uploaded package as a full CloudBase Run release.",
  ]);
});

test("reports bounded upload failure metrics without exposing signed URLs", async () => {
  const responses = [
    { code: 0, output: JSON.stringify({ data: uploadPayload.Response }), timedOut: false },
    {
      code: 22,
      output:
        "<Error><Code>RequestTimeTooSkewed</Code></Error>\nhttp=403 uploaded=3680694 total=280.123456",
      errorOutput: `curl: (22) ${uploadPayload.Response.UploadUrl}`,
      timedOut: false,
    },
  ];
  await assert.rejects(
    submitCloudBaseRunSource({
      archivePath: "/tmp/source.zip",
      cli: ["--yes", "--package", "@cloudbase/cli@3.8.1", "tcb"],
      envId: "env-id",
      run: async () => responses.shift(),
      serviceName: "service-name",
    }),
    (error) =>
      error.message ===
      "CloudBase source archive upload failed (curl exit 22, HTTP 403, COS RequestTimeTooSkewed, uploaded 3680694 bytes in 280.123456s, process timeout false).",
  );
});
