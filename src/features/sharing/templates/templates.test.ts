import assert from "node:assert/strict";
import test from "node:test";

import { bentoPublicTemplateSourceV1 } from "./builtins/bento/source.ts";
import { bentoPublicTemplateSourceV2 } from "./builtins/bento/v2.ts";
import { etherealPublicTemplateSourceV1 } from "./builtins/ethereal/source.ts";
import { journalPublicTemplateSourceV1 } from "./builtins/journal/source.ts";
import { neonPublicTemplateSourceV1 } from "./builtins/neon/source.ts";
import { standardPublicTemplateSourceV1 } from "./builtins/standard/source.ts";
import { traversePublicTemplateSourceV1 } from "./builtins/traverse/source.ts";
import {
  PublicTemplateCompileError,
  compilePublicTemplate,
  stablePublicTemplateJson,
} from "./compiler/index.ts";
import { defaultPublicTemplateLayoutV1 } from "./default-layout.ts";
import {
  DEFAULT_PUBLIC_TEMPLATE_KEY,
  getPublicTemplate,
  publicTemplateOptions,
  publicTemplateRegistry,
} from "./registry.ts";
import { resolvePublicTemplate } from "./resolver.ts";
import { compiledPublicTemplateSchemaV1, type PublicTemplateSourceV1 } from "./schema.ts";

function layoutSource(overrides: Partial<PublicTemplateSourceV1> = {}): PublicTemplateSourceV1 {
  return {
    id: "fixture",
    layoutHtml: defaultPublicTemplateLayoutV1,
    schemaVersion: 1,
    sourceMode: "layout",
    themeCss: "",
    version: 1,
    ...overrides,
  } as PublicTemplateSourceV1;
}

function expectCompileCode(
  source: PublicTemplateSourceV1,
  code: PublicTemplateCompileError["code"],
) {
  assert.throws(
    () => compilePublicTemplate(source),
    (error) => error instanceof PublicTemplateCompileError && error.code === code,
  );
}

test("built-ins compile to deterministic immutable artifact contracts", () => {
  const sources = [
    standardPublicTemplateSourceV1,
    bentoPublicTemplateSourceV1,
    bentoPublicTemplateSourceV2,
    etherealPublicTemplateSourceV1,
    journalPublicTemplateSourceV1,
    neonPublicTemplateSourceV1,
    traversePublicTemplateSourceV1,
  ];
  const [standard, bentoV1, bentoV2, ethereal, journal, neon, traverse] =
    sources.map(compilePublicTemplate);
  for (const template of [standard, bentoV1, bentoV2, ethereal, journal, neon, traverse])
    assert.equal(compiledPublicTemplateSchemaV1.safeParse(template).success, true);
  assert.equal(standard.sourceMode, "theme");
  assert.equal(standard.layout.id, "default-layout-v1");
  assert.equal(bentoV1.sourceMode, "layout");
  assert.equal(bentoV2.sourceMode, "theme");
  assert.equal(ethereal.sourceMode, "layout");
  assert.equal(journal.sourceMode, "layout");
  assert.equal(neon.sourceMode, "theme");
  assert.equal(traverse.sourceMode, "layout");
  for (const template of [standard, bentoV1, bentoV2, neon]) {
    const navigation = template.layout.children.find(
      (node) => node.type === "region" && node.name === "view-navigation",
    );
    const workspace = template.layout.children.find(
      (node) => node.type === "region" && node.name === "workspace",
    );
    assert.equal(navigation?.type, "region");
    assert.equal(JSON.stringify(navigation).includes('"name":"view-switcher"'), true);
    assert.equal(JSON.stringify(workspace).includes('"name":"view-switcher"'), false);
  }
  assert.equal(
    standard.digest,
    "sha256-3dc4f599d71ca425c554718b628676dd88deff1b5f38ca11289b9718a94a06c7",
  );
  assert.equal(
    bentoV1.digest,
    "sha256-7dca663c9eab80a28c8d4dbad175a18973aa63fd8cc23b9d37c5cb3d4657035c",
  );
  assert.equal(
    bentoV2.digest,
    "sha256-287bf4f40c8d8bef830e5e8ff4ca4b33e6db04aeb8afcf072cb9acddf6690c76",
  );
  assert.equal(
    ethereal.digest,
    "sha256-a3ee316d97fe7e18172d1a8a93aa3938ac31d4242ad25159ce73dc84756edb18",
  );
  assert.equal(
    journal.digest,
    "sha256-1ff987919ebc3db0d2007d2ec9e56093337a8e16db10a4d6422d76f4be0d28ba",
  );
  assert.equal(
    neon.digest,
    "sha256-377a5a704e0d5ffec35f883bd4dc76a00b0279c4a9105253973e9486449e2655",
  );
  assert.equal(
    traverse.digest,
    "sha256-b6728507733cf4396e6424d10284b6da2d02538b4e59aba2edd3d83a08b0b6e6",
  );
  for (const source of sources)
    assert.equal(
      stablePublicTemplateJson(compilePublicTemplate(source)),
      stablePublicTemplateJson(compilePublicTemplate(source)),
    );
  assert.deepEqual(
    Object.values(publicTemplateRegistry)
      .map(({ template }) => template.key)
      .sort(),
    ["bento@1", "bento@2", "ethereal@1", "journal@1", "neon@1", "standard@1", "traverse@1"],
  );
  assert.deepEqual(
    publicTemplateOptions().map(({ key }) => key),
    ["ethereal@1", "journal@1", "bento@2", "neon@1", "traverse@1"],
  );
  assert.deepEqual(
    publicTemplateOptions().map(({ label }) => label),
    ["Ethereal", "Journal", "Midnight", "Neon", "Traverse"],
  );
  assert.equal(publicTemplateRegistry["standard@1"].selectable, false);
});

test("template resolver honors legacy query, persistence, disable, fallback, and rollback", () => {
  assert.equal(DEFAULT_PUBLIC_TEMPLATE_KEY, "neon@1");
  assert.equal(
    resolvePublicTemplate({
      legacyTemplate: "standard",
      persistedTemplateId: "bento",
      persistedTemplateVersion: 1,
    }).key,
    "standard@1",
  );
  assert.equal(
    resolvePublicTemplate({ persistedTemplateId: "standard", persistedTemplateVersion: 1 }).key,
    "standard@1",
  );
  assert.equal(resolvePublicTemplate({}).key, DEFAULT_PUBLIC_TEMPLATE_KEY);
  assert.equal(
    resolvePublicTemplate({ persistedTemplateId: "ethereal", persistedTemplateVersion: 1 }).key,
    "ethereal@1",
  );
  assert.equal(
    resolvePublicTemplate({ persistedTemplateId: "journal", persistedTemplateVersion: 1 }).key,
    "journal@1",
  );
  assert.equal(
    resolvePublicTemplate({ persistedTemplateId: "traverse", persistedTemplateVersion: 1 }).key,
    "traverse@1",
  );
  assert.equal(
    resolvePublicTemplate({ persistedTemplateId: "neon", persistedTemplateVersion: 1 }).key,
    "neon@1",
  );
  assert.equal(
    resolvePublicTemplate({
      disabledKeys: new Set(["bento@1"]),
      persistedTemplateId: "bento",
      persistedTemplateVersion: 1,
    }).key,
    "neon@1",
  );
  assert.equal(
    resolvePublicTemplate({
      legacyTemplate: "bento",
      persistedTemplateId: "bento",
      persistedTemplateVersion: 1,
      runtimeEnabled: false,
    }).key,
    "standard@1",
  );
  assert.equal(
    resolvePublicTemplate({ persistedTemplateId: "unknown", persistedTemplateVersion: 9 })
      .diagnostics[0]?.code,
    "UNKNOWN_PERSISTED",
  );
  assert.strictEqual(getPublicTemplate("bento@1"), publicTemplateRegistry["bento@1"].template);
});

test("layout compiler rejects executable, unknown, missing, duplicate, deep, and oversized sources", () => {
  expectCompileCode(
    layoutSource({
      layoutHtml: defaultPublicTemplateLayoutV1.replace("</tp-layout>", "<script /></tp-layout>"),
    }),
    "LAYOUT_FORBIDDEN",
  );
  expectCompileCode(
    layoutSource({
      layoutHtml: defaultPublicTemplateLayoutV1.replace(
        'name="trip-header"',
        'onclick="run()" name="trip-header"',
      ),
    }),
    "LAYOUT_FORBIDDEN",
  );
  for (const tag of ["iframe", "form", "object", "embed"]) {
    expectCompileCode(
      layoutSource({
        layoutHtml: defaultPublicTemplateLayoutV1.replace("</tp-layout>", `<${tag} /></tp-layout>`),
      }),
      "LAYOUT_FORBIDDEN",
    );
  }
  expectCompileCode(
    layoutSource({
      layoutHtml: defaultPublicTemplateLayoutV1.replace("trip-header", "unknown-part"),
    }),
    "PART_UNKNOWN",
  );
  expectCompileCode(
    layoutSource({
      layoutHtml: defaultPublicTemplateLayoutV1.replace('<tp-part name="trip-header" />', ""),
    }),
    "PART_MISSING",
  );
  expectCompileCode(
    layoutSource({
      layoutHtml: defaultPublicTemplateLayoutV1.replace(
        '<tp-part name="active-view" />',
        '<tp-part name="active-view" /><tp-part name="active-view" />',
      ),
    }),
    "PART_DUPLICATE_LOCKED",
  );
  expectCompileCode(
    layoutSource({
      layoutHtml: defaultPublicTemplateLayoutV1.replace(
        '<tp-region name="mobile-overlays">',
        '<tp-region name="elsewhere">',
      ),
    }),
    "LAYOUT_INVALID",
  );
  expectCompileCode(layoutSource({ layoutHtml: " ".repeat(12_001) }), "LAYOUT_LIMIT");
  const layoutChildren = defaultPublicTemplateLayoutV1
    .replace(/^<tp-layout>/, "")
    .replace(/<\/tp-layout>$/, "");
  const nested = `${'<tp-region name="nested">'.repeat(7)}${layoutChildren}${"</tp-region>".repeat(7)}`;
  expectCompileCode(
    layoutSource({ layoutHtml: `<tp-layout>${nested}</tp-layout>` }),
    "LAYOUT_LIMIT",
  );
});

test("CSS compiler rejects imports, remote assets, escapes, cross-template and internal selectors", () => {
  const forbiddenCss = [
    '@import "https://example.invalid/theme.css";',
    'tp-layout { background: url("https://example.invalid/a.png"); }',
    ":global(.unsafe) { color: red; }",
    ".public-template-other { color: red; }",
    "tp-layout\\:hover { color: red; }",
    'tp-part[name="table"] .matrix-date-column { color: red; }',
    'tp-part[name="map-workspace"] .public-map-canvas { color: red; }',
  ];
  for (const themeCss of forbiddenCss)
    expectCompileCode(layoutSource({ themeCss }), "CSS_FORBIDDEN");
  expectCompileCode(layoutSource({ assetIds: ["unregistered-asset"] }), "ASSET_NOT_REGISTERED");
  expectCompileCode(
    layoutSource({ themeCss: `tp-layout { color: ${"a".repeat(24_001)}; }` }),
    "CSS_INVALID",
  );
});
