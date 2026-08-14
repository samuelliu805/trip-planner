import {
  publicTemplatePartIds,
  publicTemplatePartIdSchema,
  publicTemplateRegionIdSchema,
  type PublicTemplatePartId,
  type PublicTemplateStyleRuleV1,
} from "../schema.ts";
import { PublicTemplateCompileError } from "./errors.ts";

const allowedProperties = new Set([
  "align-items",
  "background",
  "border",
  "border-color",
  "border-radius",
  "box-shadow",
  "color",
  "color-scheme",
  "display",
  "flex",
  "flex-direction",
  "font-family",
  "font-size",
  "font-weight",
  "gap",
  "grid-area",
  "grid-template-areas",
  "grid-template-columns",
  "grid-template-rows",
  "height",
  "isolation",
  "justify-content",
  "letter-spacing",
  "line-height",
  "margin",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "overflow",
  "overflow-x",
  "overflow-y",
  "padding",
  "place-items",
  "width",
]);

const allowedThemeProperties = new Set([
  "--accent",
  "--accent-foreground",
  "--background",
  "--border",
  "--card",
  "--card-foreground",
  "--destructive",
  "--foreground",
  "--input",
  "--muted",
  "--muted-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--public-blue",
  "--public-gold",
  "--public-peach",
  "--public-subtle",
  "--radius",
  "--ring",
  "--secondary",
  "--secondary-foreground",
]);

type ParsedSelector =
  | { kind: "layout" }
  | { kind: "part"; name: PublicTemplatePartId }
  | { kind: "region"; name: string };

type ParsedStyleRule = PublicTemplateStyleRuleV1 & { selector: ParsedSelector };

function cssError(message: string, forbidden = false): never {
  throw new PublicTemplateCompileError(forbidden ? "CSS_FORBIDDEN" : "CSS_INVALID", message);
}

function matchingBrace(source: string, openIndex: number) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function parseSelector(selector: string): ParsedSelector {
  if (selector === "tp-layout") return { kind: "layout" };
  const region = selector.match(/^tp-region\[name="([a-z][a-z0-9-]{0,39})"\]$/);
  if (region) {
    if (!publicTemplateRegionIdSchema.safeParse(region[1]).success)
      cssError(`Invalid region selector: ${selector}`);
    return { kind: "region", name: region[1] };
  }
  const part = selector.match(/^tp-part\[name="([a-z][a-z0-9-]{0,39})"\]$/);
  if (part) {
    const parsed = publicTemplatePartIdSchema.safeParse(part[1]);
    if (!parsed.success) cssError(`Unknown part selector: ${selector}`);
    return { kind: "part", name: parsed.data };
  }
  return cssError(`Selectors may target only a layout, region, or part host: ${selector}`, true);
}

function parseDeclarations(body: string) {
  if (body.includes("{") || body.includes("}")) cssError("Nested CSS rules are not allowed here.");
  const declarations = body
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(":");
      if (separator <= 0) cssError(`Invalid CSS declaration: ${entry}`);
      const property = entry.slice(0, separator).trim().toLowerCase();
      const value = entry.slice(separator + 1).trim();
      if (!allowedProperties.has(property) && !allowedThemeProperties.has(property))
        cssError(`CSS property is not available to templates: ${property}`, true);
      if (!value || /url\s*\(|expression\s*\(|javascript:|[<>{}\\]|@import/i.test(value))
        cssError(`Unsafe CSS value for ${property}.`, true);
      if (/--(?:matrix|map|public-map)[a-z0-9-]*/i.test(value))
        cssError("Table and Map internal tokens are locked.", true);
      return { property, value };
    });
  if (!declarations.length) cssError("Empty CSS rules are not allowed.");
  const properties = new Set<string>();
  for (const declaration of declarations) {
    if (properties.has(declaration.property))
      cssError(`Duplicate CSS property: ${declaration.property}`);
    properties.add(declaration.property);
  }
  return declarations.sort((left, right) => left.property.localeCompare(right.property));
}

function parseBlocks(source: string, media?: string): ParsedStyleRule[] {
  const rules: ParsedStyleRule[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const openIndex = source.indexOf("{", cursor);
    if (openIndex === -1) {
      if (source.slice(cursor).trim()) cssError("CSS contains an incomplete rule.");
      break;
    }
    const header = source.slice(cursor, openIndex).trim();
    const closeIndex = matchingBrace(source, openIndex);
    if (closeIndex === -1) cssError("CSS braces are unbalanced.");
    const body = source.slice(openIndex + 1, closeIndex);
    cursor = closeIndex + 1;

    if (header.startsWith("@")) {
      if (media) cssError("Nested CSS at-rules are not allowed.", true);
      const condition = header.match(
        /^@media\s+(\((?:min|max)-width:\s*[1-9][0-9]{1,3}px\)(?:\s+and\s+\((?:min|max)-width:\s*[1-9][0-9]{1,3}px\))?)$/,
      );
      if (!condition) cssError(`Unsupported CSS at-rule: ${header}`, true);
      rules.push(...parseBlocks(body, condition[1].replace(/\s+/g, " ")));
      continue;
    }

    rules.push({ declarations: parseDeclarations(body), media, selector: parseSelector(header) });
  }
  return rules;
}

function ruleCss(selector: string, rule: PublicTemplateStyleRuleV1) {
  const declarations = rule.declarations
    .map(({ property, value }) => `${property}:${value}`)
    .join(";");
  const css = `${selector}{${declarations}}`;
  return rule.media ? `@media ${rule.media}{${css}}` : css;
}

export function compilePublicTemplateCss(cssSource: string, rootSelector: string) {
  if (cssSource.length > 24_000) cssError("Template CSS is too large.");
  if (
    /@import|:global|url\s*\(|javascript:|\\|\[data-public-template|\.public-template-/i.test(
      cssSource,
    )
  )
    cssError("Template CSS contains imports, URLs, escapes, or cross-template selectors.", true);
  const source = cssSource.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  const rules = source ? parseBlocks(source) : [];
  const layoutStyles: PublicTemplateStyleRuleV1[] = [];
  const partHostStyles = Object.fromEntries(
    publicTemplatePartIds.map((part) => [part, [] as PublicTemplateStyleRuleV1[]]),
  ) as Record<PublicTemplatePartId, PublicTemplateStyleRuleV1[]>;
  const regionStyles: Record<string, PublicTemplateStyleRuleV1[]> = {};
  const css: string[] = [];

  for (const { selector, ...rule } of rules) {
    if (selector.kind === "layout") {
      layoutStyles.push(rule);
      css.push(ruleCss(rootSelector, rule));
    } else if (selector.kind === "region") {
      (regionStyles[selector.name] ??= []).push(rule);
      css.push(ruleCss(`${rootSelector} [data-tp-region="${selector.name}"]`, rule));
    } else {
      partHostStyles[selector.name].push(rule);
      css.push(ruleCss(`${rootSelector} [data-tp-part="${selector.name}"]`, rule));
    }
  }

  return { layoutStyles, partHostStyles, regionStyles, scopedCss: css.join("\n") };
}
