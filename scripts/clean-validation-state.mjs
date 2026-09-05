import { resolve } from "node:path";

import { cleanValidationArtifacts } from "./lib/validation-cleanup.mjs";
import { validationStateDirectory } from "./lib/validation-cache.mjs";

const root = resolve(import.meta.dirname, "..");
const stateDirectory = await validationStateDirectory(root);
const result = await cleanValidationArtifacts(stateDirectory);
process.stdout.write(
  `Removed ${result.removedFiles} validation log(s), ${result.removedBytes} byte(s), and ${result.removedTemporaryFiles} stale cache temp file(s).\n`,
);
