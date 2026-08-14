import assert from "node:assert/strict";
import test from "node:test";

import { bentoPublicTemplateSourceV1 } from "./builtins/bento/source.ts";
import { standardPublicTemplateSourceV1 } from "./builtins/standard/source.ts";
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

test("Standard and Bento compile to one deterministic immutable artifact contract", () => {
  const standard = compilePublicTemplate(standardPublicTemplateSourceV1);
  const bento = compilePublicTemplate(bentoPublicTemplateSourceV1);
  assert.equal(compiledPublicTemplateSchemaV1.safeParse(standard).success, true);
  assert.equal(compiledPublicTemplateSchemaV1.safeParse(bento).success, true);
  assert.equal(standard.sourceMode, "theme");
  assert.equal(standard.layout.id, "default-layout-v1");
  assert.equal(bento.sourceMode, "layout");
  assert.equal(
    standard.digest,
    "sha256-423220052fc7a3c6bc4836b6ee475a13e95ffecef074efd1574d2900a4d69317",
  );
  assert.equal(
    bento.digest,
    "sha256-77f1df05abc0fdf9822e6a03f15c15a347c59537ca9607fd77a1bce9a5828d6d",
  );
  assert.equal(
    stablePublicTemplateJson(compilePublicTemplate(bentoPublicTemplateSourceV1)),
    stablePublicTemplateJson(compilePublicTemplate(bentoPublicTemplateSourceV1)),
  );
  assert.deepEqual(
    Object.values(publicTemplateRegistry)
      .map(({ template }) => template.key)
      .sort(),
    ["bento@1", "standard@1"],
  );
  assert.deepEqual(
    publicTemplateOptions().map(({ key }) => key),
    ["bento@1", "standard@1"],
  );
});

test("template resolver honors legacy query, persistence, disable, fallback, and rollback", () => {
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
    resolvePublicTemplate({
      disabledKeys: new Set(["bento@1"]),
      persistedTemplateId: "bento",
      persistedTemplateVersion: 1,
    }).key,
    "standard@1",
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
