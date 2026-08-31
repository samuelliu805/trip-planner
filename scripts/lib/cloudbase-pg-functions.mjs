import { splitStatements } from "./cloudbase-pg-baseline-lib.mjs";

export function splitArguments(text) {
  const result = [];
  let start = 0;
  let depth = 0;
  let quote = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "'" && text[index - 1] !== "\\") quote = !quote;
    if (quote) continue;
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      result.push(text.slice(start, index));
      start = index + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) result.push(tail);
  return result;
}

export function normalizeType(value) {
  return value
    .replace(/\bpublic\./gi, "")
    .replace(/\s*\[\s*\]/g, "[]")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseArgument(argument, index) {
  const withoutDefault = argument.split(/\s+(?:default|=)\s+/i)[0].trim();
  const tokens = withoutDefault.replace(/^(?:in|out|inout|variadic)\s+/i, "").split(/\s+/);
  if (tokens.length === 1) return { name: `arg_${index + 1}`, type: normalizeType(tokens[0]) };
  return { name: tokens[0].replaceAll('"', ""), type: normalizeType(tokens.slice(1).join(" ")) };
}

function truncateIdentifier(name) {
  return Buffer.from(name).subarray(0, 63).toString();
}

export function parseFunctions(sql) {
  const latest = new Map();
  for (const statement of splitStatements(sql)) {
    if (/^\s*(?:--[^\n]*\n\s*)*drop\s+function\b/i.test(statement)) {
      for (const dropped of statement.matchAll(
        /([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi,
      )) {
        const types = splitArguments(dropped[3]).map(normalizeType).join(",");
        const name = truncateIdentifier(dropped[2].toLowerCase());
        latest.delete(`${dropped[1].toLowerCase()}.${name}(${types})`);
      }
      continue;
    }
    const rename = statement.match(
      /alter\s+function\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*\(([^)]*)\)\s+rename\s+to\s+([a-z_][a-z0-9_]*)/i,
    );
    if (rename) {
      const types = splitArguments(rename[3]).map(normalizeType).join(",");
      const oldName = truncateIdentifier(rename[2].toLowerCase());
      const key = `${rename[1].toLowerCase()}.${oldName}(${types})`;
      const existing = latest.get(key);
      if (existing) {
        const name = truncateIdentifier(rename[4].toLowerCase());
        latest.delete(key);
        latest.set(`${existing.schema}.${name}(${types})`, {
          ...existing,
          name,
          signature: `${name}(${types})`,
        });
      }
      continue;
    }
    const securityInvoker = statement.match(
      /alter\s+function\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*\(([^)]*)\)\s+security\s+invoker/i,
    );
    if (securityInvoker) {
      const types = splitArguments(securityInvoker[3]).map(normalizeType).join(",");
      const name = truncateIdentifier(securityInvoker[2].toLowerCase());
      const key = `${securityInvoker[1].toLowerCase()}.${name}(${types})`;
      const existing = latest.get(key);
      if (existing) latest.set(key, { ...existing, securityDefiner: false });
      continue;
    }
    const match = statement.match(
      /create\s+(?:or\s+replace\s+)?function\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*returns\s+([\s\S]*?)(?=\s+language\s+)/i,
    );
    if (!match) continue;
    const args = splitArguments(match[3]).map(parseArgument);
    const name = truncateIdentifier(match[2].toLowerCase());
    const types = args.map((argument) => argument.type).join(",");
    const calls = [...statement.matchAll(/(?:public|app_private)\.([a-z_][a-z0-9_]*)\s*\(/gi)].map(
      (call) => truncateIdentifier(call[1].toLowerCase()),
    );
    const routine = {
      schema: match[1].toLowerCase(),
      name,
      signature: `${name}(${types})`,
      arguments: args,
      returns: normalizeType(match[4]),
      securityDefiner: /\bsecurity\s+definer\b/i.test(statement),
      safeSearchPath: /\bset\s+search_path\s*=\s*''/i.test(statement),
      calls: [...new Set(calls.filter((called) => called !== name))].sort(),
      source: statement,
    };
    latest.set(`${routine.schema}.${routine.signature}`, routine);
  }
  return [...latest.values()];
}
