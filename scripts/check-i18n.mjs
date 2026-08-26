import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import ts from "typescript";

const localizedAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);
const copyPropertyNames = new Set([
  "cancelLabel",
  "description",
  "empty",
  "error",
  "help",
  "label",
  "loadingLabel",
  "message",
  "pendingLabel",
  "placeholder",
  "saveLabel",
  "success",
  "title",
]);
const errors = [];

function files(...args) {
  return execFileSync("rg", ["--files", ...args], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
}

function normalize(message) {
  return message
    .replaceAll("&amp;", "&")
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replace(/\s+/g, " ")
    .trim();
}

function sourceFile(file) {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function location(file, parsed, node) {
  const { line } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
  return `${file}:${line + 1}`;
}

function literalChoices(expression) {
  if (!expression) return [];
  if (ts.isStringLiteralLike(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
    return [expression.text];
  if (ts.isConditionalExpression(expression))
    return [...literalChoices(expression.whenTrue), ...literalChoices(expression.whenFalse)];
  if (ts.isParenthesizedExpression(expression)) return literalChoices(expression.expression);
  if (
    ts.isBinaryExpression(expression) &&
    [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(
      expression.operatorToken.kind,
    )
  )
    return [...literalChoices(expression.left), ...literalChoices(expression.right)];
  return [];
}

const catalog = new Map();
const normalizedCatalog = new Set();
for (const file of files("src/features/i18n/messages", "-g", "*.ts")) {
  const parsed = sourceFile(file);
  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isStringLiteral(node.name) || ts.isIdentifier(node.name))
    ) {
      const key = node.name.text;
      const previous = catalog.get(key);
      if (previous)
        errors.push(`${location(file, parsed, node)} duplicates “${key}” from ${previous}.`);
      else catalog.set(key, location(file, parsed, node));
      normalizedCatalog.add(normalize(key));
      if (ts.isStringLiteralLike(node.initializer) && !node.initializer.text.trim())
        errors.push(`${location(file, parsed, node)} has an empty translation for “${key}”.`);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
}

function requireTranslation(file, parsed, node, rawMessage) {
  const message = normalize(rawMessage);
  if (/[A-Za-z]/.test(message) && !normalizedCatalog.has(message))
    errors.push(`${location(file, parsed, node)} is missing a zh-CN translation for “${message}”.`);
}

const productionFiles = files("src", "-g", "*.ts", "-g", "*.tsx").filter(
  (file) =>
    !file.includes("/features/i18n/messages/") &&
    !file.includes("/generated/") &&
    !file.endsWith(".test.ts") &&
    !file.endsWith(".test.tsx") &&
    !file.endsWith("src/types/database.ts"),
);

for (const file of productionFiles) {
  const parsed = sourceFile(file);
  function visit(node) {
    if (ts.isJsxText(node) && /[A-Za-z]/.test(node.text))
      errors.push(
        `${location(file, parsed, node)} contains raw JSX copy “${normalize(node.text)}”; wrap it in T.`,
      );

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(parsed);
      if (tag === "T" || tag === "Localized") {
        const propName = tag === "T" ? "message" : "value";
        const prop = node.attributes.properties.find(
          (attribute) =>
            ts.isJsxAttribute(attribute) && attribute.name.getText(parsed) === propName,
        );
        if (prop?.initializer) {
          const choices = ts.isStringLiteral(prop.initializer)
            ? [prop.initializer.text]
            : ts.isJsxExpression(prop.initializer)
              ? literalChoices(prop.initializer.expression)
              : [];
          for (const choice of choices) requireTranslation(file, parsed, prop, choice);
        }
      }

      if (/^[a-z]/.test(tag)) {
        for (const attribute of node.attributes.properties) {
          if (!ts.isJsxAttribute(attribute)) continue;
          const name = attribute.name.getText(parsed);
          if (
            localizedAttributes.has(name) &&
            attribute.initializer &&
            ts.isStringLiteral(attribute.initializer) &&
            /[A-Za-z]/.test(attribute.initializer.text)
          ) {
            const marker = `data-i18n-${name}`;
            const marked = node.attributes.properties.some(
              (candidate) =>
                ts.isJsxAttribute(candidate) && candidate.name.getText(parsed) === marker,
            );
            if (!marked)
              errors.push(
                `${location(file, parsed, attribute)} has static ${name} copy without ${marker}.`,
              );
          }
          if (name.startsWith("data-i18n-") && attribute.initializer) {
            const choices = ts.isStringLiteral(attribute.initializer)
              ? [attribute.initializer.text]
              : ts.isJsxExpression(attribute.initializer)
                ? literalChoices(attribute.initializer.expression)
                : [];
            for (const choice of choices) requireTranslation(file, parsed, attribute, choice);
          }
        }
      }
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const argument =
        node.expression.text === "t"
          ? node.arguments[0]
          : node.expression.text === "translateMessage"
            ? node.arguments[1]
            : undefined;
      for (const choice of literalChoices(argument)) requireTranslation(file, parsed, node, choice);
    }

    if (ts.isPropertyAssignment(node)) {
      const name =
        ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : "";
      if (copyPropertyNames.has(name) && ts.isStringLiteralLike(node.initializer))
        requireTranslation(file, parsed, node, node.initializer.text);
    }

    ts.forEachChild(node, visit);
  }
  visit(parsed);
}

if (errors.length) {
  console.error(`i18n check failed with ${errors.length} issue(s):\n${errors.join("\n")}`);
  process.exit(1);
}

console.log(`i18n check passed (${catalog.size} zh-CN messages, ${productionFiles.length} files).`);
