import { pathToFileURL } from "node:url";

import { prepareStandaloneRuntime } from "./lib/standalone-runtime.mjs";

const serverPath = await prepareStandaloneRuntime();
await import(pathToFileURL(serverPath).href);
