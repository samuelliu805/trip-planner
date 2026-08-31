import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { format } from "prettier";
import { root } from "./lib/cloudbase-pg-baseline-lib.mjs";
import { parseFunctions } from "./lib/cloudbase-pg-functions.mjs";

const migrationDir = join(root, "cloudbase/migrations");
const allowlistPath = join(root, "database/cloudbase/rpc-allowlist.json");
const catalogPath = join(root, "database/cloudbase/rpc-catalog.json");
const grantsPath = join(root, "database/cloudbase/overlays/rpc-grants.sql");

function reachableNames(functions, roots) {
  const byName = new Map();
  for (const routine of functions) {
    const existing = byName.get(routine.name) ?? [];
    existing.push(routine);
    byName.set(routine.name, existing);
  }
  const reached = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    const current = queue.shift();
    for (const routine of byName.get(current) ?? []) {
      for (const called of routine.calls) {
        if (!reached.has(called)) {
          reached.add(called);
          queue.push(called);
        }
      }
    }
  }
  return reached;
}

function buildCatalog() {
  const baseline = readdirSync(migrationDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(migrationDir, name), "utf8"))
    .join("\n");
  const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
  const authenticated = new Map(allowlist.authenticated);
  const anonymous = new Map(allowlist.anonymous);
  const phase4Names = new Set(allowlist.phase4);
  const functions = parseFunctions(baseline);
  const publicFunctions = functions.filter((routine) => routine.schema === "public");
  const triggerNames = new Set(
    publicFunctions
      .filter((routine) => routine.returns === "trigger")
      .map((routine) => routine.name),
  );
  const roots = new Set([
    ...publicFunctions
      .filter((routine) => authenticated.has(routine.signature) || anonymous.has(routine.signature))
      .map((routine) => routine.name),
    ...triggerNames,
    "app_current_user_id",
    "is_trip_member",
    "variant_trip_id",
  ]);
  const internalNames = reachableNames(functions, roots);

  const catalog = publicFunctions
    .map((routine) => {
      let category = "obsolete_legacy";
      let authorization = null;
      if (authenticated.has(routine.signature)) {
        category = "external_authenticated";
        authorization = authenticated.get(routine.signature);
      } else if (anonymous.has(routine.signature)) {
        category = "external_anonymous";
        authorization = anonymous.get(routine.signature);
      } else if (triggerNames.has(routine.name)) category = "trigger";
      else if (phase4Names.has(routine.name)) category = "phase_4";
      else if (internalNames.has(routine.name)) category = "internal_helper";
      return {
        schema: routine.schema,
        signature: routine.signature,
        arguments: routine.arguments,
        returns: routine.returns,
        securityDefiner: routine.securityDefiner,
        safeSearchPath: routine.safeSearchPath,
        category,
        authorization,
      };
    })
    .sort((left, right) => left.signature.localeCompare(right.signature));

  const privateHelpers = functions
    .filter((routine) => routine.schema === "app_private")
    .map((routine) => routine.signature)
    .sort();
  verifyCatalog({ allowlist, functions, catalog, privateHelpers });
  return { version: 1, publicFunctionCount: catalog.length, catalog, privateHelpers };
}

function verifyCatalog({ allowlist, functions, catalog, privateHelpers }) {
  const external = catalog.filter((routine) => routine.category.startsWith("external_"));
  const expectedCount = allowlist.authenticated.length + allowlist.anonymous.length;
  const anonymousSignatures = new Set(allowlist.anonymous.map(([signature]) => signature));
  if (external.length !== expectedCount)
    throw new Error("External RPC allowlist does not match catalog");
  if (catalog.some((routine) => routine.securityDefiner && !routine.safeSearchPath)) {
    throw new Error("SECURITY DEFINER function has an unsafe search_path");
  }
  const functionByName = new Map(functions.map((routine) => [routine.name, routine]));
  const reachedFrom = (name) => reachableNames(functions, new Set([name]));
  for (const routine of external.filter((item) => item.category === "external_authenticated")) {
    const reached = reachedFrom(routine.signature.slice(0, routine.signature.indexOf("(")));
    if (!reached.has("app_current_user_id"))
      throw new Error(`${routine.signature} lacks auth claim use`);
    const source = functionByName.get(routine.signature.split("(")[0])?.source ?? "";
    if (/\b(?:owner_id|user_id|created_by|applied_by)\s+(?:varchar|text|uuid)/i.test(source)) {
      throw new Error(`${routine.signature} accepts a caller-supplied identity`);
    }
    if (routine.authorization === "owner_guard") {
      const reachableSource = [...reached]
        .map((name) => functionByName.get(name)?.source ?? "")
        .join("\n");
      if (
        !reached.has("is_trip_owner") &&
        !/(?:owner_id|created_by|user_id)\s*=.*app_current_user_id/is.test(reachableSource)
      ) {
        throw new Error(`${routine.signature} lacks reviewed business authorization`);
      }
    }
  }
  for (const routine of external.filter((item) => item.category === "external_anonymous")) {
    const reached = reachedFrom(routine.signature.slice(0, routine.signature.indexOf("(")));
    const reachableSource = [...reached]
      .map((name) => functionByName.get(name)?.source ?? "")
      .join("\n");
    if (!/(?:token|revoked_at|expires_at|is_active)/i.test(reachableSource)) {
      throw new Error(`${routine.signature} lacks a public-token availability guard`);
    }
  }
  if (
    !privateHelpers.includes("app_current_user_id()") ||
    !privateHelpers.includes("is_trip_member(uuid)")
  ) {
    throw new Error("Required internal helpers are not in app_private");
  }
  if (catalog.some((routine) => routine.signature.startsWith("phase2_rename_owned_trip("))) {
    throw new Error("Phase 2 probe remains in the final function catalog");
  }
  const grants = readFileSync(grantsPath, "utf8");
  if (
    !/REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;/i.test(
      grants,
    )
  ) {
    throw new Error("RPC grants do not fail closed before applying the allowlist");
  }
  const normalizedGrants = grants.replaceAll(
    "public.public_itinerary_view",
    "public_itinerary_view",
  );
  const actualGrants = new Map();
  for (const match of normalizedGrants.matchAll(
    /GRANT EXECUTE ON FUNCTION public\.([^;]+?) TO ([a-z, ]+);/gi,
  )) {
    actualGrants.set(
      match[1].replace(/\s+/g, "").replaceAll("doubleprecision", "double precision"),
      match[2].replace(/\s+/g, ""),
    );
  }
  if (actualGrants.size !== expectedCount) throw new Error("Unexpected extra public RPC grant");
  for (const [signature] of [...allowlist.authenticated, ...allowlist.anonymous]) {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll(",", ",\\s*");
    if (
      !new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escaped} TO `, "i").test(normalizedGrants)
    ) {
      throw new Error(`Missing exact SQL grant: ${signature}`);
    }
    const expectedRoles = anonymousSignatures.has(signature)
      ? "anon,authenticated"
      : "authenticated";
    if (actualGrants.get(signature) !== expectedRoles)
      throw new Error(`Unexpected roles: ${signature}`);
  }
}

const command = process.argv[2] ?? "check";
const expected = await format(JSON.stringify(buildCatalog()), { parser: "json", printWidth: 100 });
if (command === "build") writeFileSync(catalogPath, expected);
else if (command === "check") {
  if (readFileSync(catalogPath, "utf8") !== expected) throw new Error("RPC catalog artifact drift");
} else throw new Error(`Unknown command: ${command}`);

console.log(`CloudBase PG RPC surface ${command} passed.`);
