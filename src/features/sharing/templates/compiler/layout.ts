import {
  PUBLIC_TEMPLATE_MAX_DEPTH,
  PUBLIC_TEMPLATE_MAX_NODES,
  lockedPublicTemplateParts,
  publicTemplatePartIdSchema,
  publicTemplateRegionIdSchema,
  requiredPublicTemplateParts,
  requiredPublicTemplateRegions,
  type PublicTemplateLayoutNodeV1,
  type PublicTemplatePartId,
} from "../schema.ts";
import { PublicTemplateCompileError } from "./errors.ts";

type OpenLayoutNode = {
  children: PublicTemplateLayoutNodeV1[];
  name?: string;
  type: "layout" | "region";
};

const forbiddenLayoutPattern =
  /<(?:script|iframe|form|object|embed)\b|\bon[a-z]+\s*=|dangerouslysetinnerhtml|javascript:|\{|\}/i;

function fail(
  code: "LAYOUT_FORBIDDEN" | "LAYOUT_INVALID" | "LAYOUT_LIMIT",
  message: string,
): never {
  throw new PublicTemplateCompileError(code, message);
}

function parseNameAttribute(attributes: string, tag: "tp-part" | "tp-region") {
  const match = attributes.match(/^\s*name\s*=\s*"([a-z][a-z0-9-]{0,39})"\s*\/?\s*$/);
  if (!match) fail("LAYOUT_INVALID", `${tag} requires exactly one quoted name attribute.`);
  return match[1];
}

export function parsePublicTemplateLayout(layoutHtml: string, layoutId: string) {
  if (layoutHtml.length > 12_000) fail("LAYOUT_LIMIT", "Layout source is too large.");
  if (forbiddenLayoutPattern.test(layoutHtml))
    fail("LAYOUT_FORBIDDEN", "Layout contains executable or forbidden markup.");

  const stack: OpenLayoutNode[] = [];
  let root: OpenLayoutNode | undefined;
  let cursor = 0;
  let nodeCount = 0;
  const tagPattern = /<[^>]*>/g;

  for (const match of layoutHtml.matchAll(tagPattern)) {
    const index = match.index ?? 0;
    if (layoutHtml.slice(cursor, index).trim())
      fail("LAYOUT_INVALID", "Raw text is not allowed in a template layout.");
    cursor = index + match[0].length;

    const parsed = match[0].match(/^<\s*(\/)?(tp-layout|tp-region|tp-part)([^>]*)>$/);
    if (!parsed) fail("LAYOUT_INVALID", `Illegal layout node: ${match[0].slice(0, 80)}`);
    const closing = Boolean(parsed[1]);
    const tag = parsed[2] as "tp-layout" | "tp-part" | "tp-region";
    const attributes = parsed[3];
    const selfClosing = /\/\s*$/.test(attributes);

    if (closing) {
      if (attributes.trim()) fail("LAYOUT_INVALID", "Closing tags cannot contain attributes.");
      const current = stack.pop();
      const expected = current?.type === "layout" ? "tp-layout" : "tp-region";
      if (!current || tag !== expected) fail("LAYOUT_INVALID", `Unexpected closing ${tag}.`);
      continue;
    }

    nodeCount += 1;
    if (nodeCount > PUBLIC_TEMPLATE_MAX_NODES)
      fail("LAYOUT_LIMIT", `Layout exceeds ${PUBLIC_TEMPLATE_MAX_NODES} nodes.`);
    if (stack.length > PUBLIC_TEMPLATE_MAX_DEPTH)
      fail("LAYOUT_LIMIT", `Layout exceeds depth ${PUBLIC_TEMPLATE_MAX_DEPTH}.`);

    if (tag === "tp-layout") {
      if (root || stack.length || attributes.trim())
        fail("LAYOUT_INVALID", "A layout needs one attribute-free tp-layout root.");
      if (selfClosing) fail("LAYOUT_INVALID", "tp-layout cannot be self-closing.");
      root = { children: [], type: "layout" };
      stack.push(root);
      continue;
    }

    const parent = stack.at(-1);
    if (!parent) fail("LAYOUT_INVALID", `${tag} must be inside tp-layout.`);
    const name = parseNameAttribute(attributes, tag);

    if (tag === "tp-part") {
      if (!selfClosing) fail("LAYOUT_INVALID", "tp-part must be self-closing.");
      const part = publicTemplatePartIdSchema.safeParse(name);
      if (!part.success)
        throw new PublicTemplateCompileError("PART_UNKNOWN", `Unknown public part: ${name}`);
      parent.children.push({ name: part.data, type: "part" });
      continue;
    }

    if (selfClosing) fail("LAYOUT_INVALID", "tp-region cannot be self-closing.");
    if (!publicTemplateRegionIdSchema.safeParse(name).success)
      fail("LAYOUT_INVALID", `Invalid region name: ${name}`);
    const region: OpenLayoutNode = { children: [], name, type: "region" };
    parent.children.push(region as PublicTemplateLayoutNodeV1);
    stack.push(region);
  }

  if (layoutHtml.slice(cursor).trim())
    fail("LAYOUT_INVALID", "Raw text is not allowed after the layout root.");
  if (!root || stack.length) fail("LAYOUT_INVALID", "Layout tags are unbalanced.");

  const partCounts = new Map<PublicTemplatePartId, number>();
  const regionCounts = new Map<string, number>();
  const visit = (nodes: PublicTemplateLayoutNodeV1[]) => {
    for (const node of nodes) {
      if (node.type === "part") partCounts.set(node.name, (partCounts.get(node.name) ?? 0) + 1);
      else {
        regionCounts.set(node.name, (regionCounts.get(node.name) ?? 0) + 1);
        visit(node.children);
      }
    }
  };
  visit(root.children);

  for (const region of requiredPublicTemplateRegions) {
    if (regionCounts.get(region) !== 1)
      fail("LAYOUT_INVALID", `Layout needs exactly one ${region} region.`);
  }

  for (const part of requiredPublicTemplateParts) {
    if (!partCounts.has(part))
      throw new PublicTemplateCompileError(
        "PART_MISSING",
        `Required public part is missing: ${part}`,
      );
  }
  const activeViewCount = partCounts.get("active-view") ?? 0;
  const viewPartCounts = ["overview", "table", "timeline"].map(
    (part) => partCounts.get(part as PublicTemplatePartId) ?? 0,
  );
  if (!activeViewCount && viewPartCounts.some((count) => count !== 1))
    throw new PublicTemplateCompileError(
      "PART_MISSING",
      "A template needs active-view or exactly one Overview, Table, and Timeline part.",
    );
  if (activeViewCount && viewPartCounts.some(Boolean))
    throw new PublicTemplateCompileError(
      "PART_DUPLICATE_LOCKED",
      "active-view cannot be combined with individual view parts.",
    );
  for (const part of lockedPublicTemplateParts) {
    if ((partCounts.get(part) ?? 0) > 1)
      throw new PublicTemplateCompileError(
        "PART_DUPLICATE_LOCKED",
        `Locked public part appears more than once: ${part}`,
      );
  }

  return { children: root.children, id: layoutId, type: "layout" as const };
}
