import { writeCompiledPublicTemplates } from "./public-template-build-lib.mjs";

const templates = await writeCompiledPublicTemplates();
process.stdout.write(`Built ${templates.map(({ key }) => key).join(", ")}\n`);
