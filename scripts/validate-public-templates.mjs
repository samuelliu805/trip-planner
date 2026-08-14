import { validateCompiledPublicTemplates } from "./public-template-build-lib.mjs";

const templates = await validateCompiledPublicTemplates();
process.stdout.write(`Validated ${templates.map(({ key }) => key).join(", ")}\n`);
