import {
  artifactPaths,
  checkArtifacts,
  renderArtifacts,
  verifyBootstrapManifest,
  writeArtifacts,
} from "./lib/cloudbase-pg-baseline-lib.mjs";

const command = process.argv[2] ?? "check";
const manifest = verifyBootstrapManifest();
const rendered = renderArtifacts(manifest);

if (command === "build") {
  writeArtifacts(rendered);
  console.log(`Built ${Object.keys(rendered).length} deterministic CloudBase PG artifacts.`);
} else if (command === "check") {
  checkArtifacts(rendered);
  console.log(
    `CloudBase PG baseline passed: ${manifest.migrations.length} frozen migrations and ${Object.keys(artifactPaths).length} byte-identical artifacts.`,
  );
} else {
  throw new Error(`Unknown command: ${command}`);
}
