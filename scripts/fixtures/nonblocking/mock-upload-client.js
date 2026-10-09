async function request(path, input) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Upload HTTP ${response.status}`);
  return response.json();
}
export async function uploadFileAttachment(options) {
  const {
    file,
    operationId,
    expectedVersion,
    tripId,
    itemId,
    uploadSessionId,
    resumeUploaded,
    signal,
  } = options;
  const wire = { operationId, expectedVersion, tripId, itemId, uploadSessionId, name: file.name };
  await request("/prepare", wire);
  if (signal.aborted) throw new DOMException("Canceled", "AbortError");
  if (!resumeUploaded) {
    options.onProgress({ stage: "uploading", percent: 30 });
    await request("/bytes", {
      operationId,
      bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
    });
  }
  await options.onUploaded?.();
  options.onProgress({ stage: "finalizing", percent: 88 });
  return request("/finalize", wire);
}
export const commitAttachmentUploadSession = (input) => request("/bind", input);
