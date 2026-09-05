import { readdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

async function entriesOrEmpty(path) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function cleanValidationArtifacts(stateDirectory) {
  const logDirectory = resolve(stateDirectory, "logs");
  const logEntries = await entriesOrEmpty(logDirectory);
  let removedBytes = 0;
  let removedFiles = 0;
  for (const entry of logEntries) {
    if (!entry.isFile()) continue;
    removedBytes += (await stat(resolve(logDirectory, entry.name))).size;
    removedFiles += 1;
  }
  await rm(logDirectory, { force: true, recursive: true });

  const staleCacheFiles = (await entriesOrEmpty(stateDirectory)).filter(
    (entry) => entry.isFile() && /^static-\d+\.tmp$/.test(entry.name),
  );
  await Promise.all(
    staleCacheFiles.map((entry) => rm(resolve(stateDirectory, entry.name), { force: true })),
  );
  return { removedBytes, removedFiles, removedTemporaryFiles: staleCacheFiles.length };
}
