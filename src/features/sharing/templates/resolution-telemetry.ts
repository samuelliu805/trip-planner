import type {
  PublicTemplateResolutionDiagnosticCode,
  PublicTemplateResolutionSource,
  TelemetryLogFields,
} from "../../../lib/telemetry/events.ts";

import type { ResolvedPublicTemplate } from "./resolver.ts";

function diagnosticCode(value: unknown): PublicTemplateResolutionDiagnosticCode | undefined {
  if (value === "DISABLED") return "public_template_disabled";
  if (value === "INVALID_ARTIFACT") return "public_template_invalid_artifact";
  if (value === "UNKNOWN_PERSISTED") return "public_template_unknown_persisted";
  return undefined;
}

function templateSource(value: ResolvedPublicTemplate["source"]): PublicTemplateResolutionSource {
  return value === "legacy-query" ? "legacy_query" : value;
}

export function publicTemplateResolutionWarningFields(
  resolution: Pick<ResolvedPublicTemplate, "diagnostics" | "source">,
): TelemetryLogFields | null {
  const actionableCode = resolution.diagnostics
    .map(({ code }) => diagnosticCode(code))
    .find((code) => code !== undefined);
  if (!actionableCode) return null;
  return {
    actor_type: "anonymous",
    fallback_used: resolution.source === "fallback",
    log_name: "public_template_resolution_warning",
    outcome: "observed",
    provider: "application",
    public_template_diagnostic_code: actionableCode,
    public_template_source: templateSource(resolution.source),
    route: "/share/[token]",
  };
}
