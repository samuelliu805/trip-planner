import { credentialHash } from "./oauth-model";
import {
  AiError,
  callRpc,
  invokeTool,
  type AiAuthorization,
  type PlacesToolRunner,
  type Rpc,
} from "./service";
import { isToolName, toolSchemas } from "./schemas";
import {
  handleRegion,
  mapResourceIds,
  regionalInput,
  regionalOutput,
  type DataRegion,
} from "./regional-handles";
import type { Json } from "@/types/database";

export type RegionalGrant = {
  region: DataRegion;
  grant_id: string;
  user_id: string;
  scopes: string[];
  trip_ids: string[];
  all_trips: boolean;
  expires_at: string | null;
};
export type GatewayContext = {
  connection_id: string;
  status: string;
  default_region: DataRegion | null;
  regions: RegionalGrant[];
  url: string;
};
export type ToolRunner = (
  tool: string,
  input: unknown,
  authorization: AiAuthorization,
) => Promise<Json>;
export type RegionalAdapter = (
  tool: string,
  input: Record<string, unknown>,
  authorization: AiAuthorization,
  context: GatewayContext,
  grant: RegionalGrant,
) => Promise<Json>;

export async function gatewayContext(rpc: Rpc, authorization: AiAuthorization) {
  return (await callRpc(rpc, "ai_gateway_service_v1", {
    action: "context",
    input: authorization,
  })) as GatewayContext;
}

export function createRegionalGateway(
  rpc: Rpc,
  originFor: (region: DataRegion) => string,
  remote: RegionalAdapter,
  places?: PlacesToolRunner,
): ToolRunner {
  const execute: RegionalAdapter = async (tool, input, authorization, context, grant) => {
    // No backend is queried until all references in a composite operation agree.
    const args = regionalInput(input as Json, grant.region);
    const result =
      grant.region === "global"
        ? await invokeTool(rpc, tool, args, authorization, places)
        : await remote(tool, args, authorization, context, grant);
    return regionalOutput(result, grant.region, originFor(grant.region));
  };
  return async (tool, rawInput, authorization) => {
    if (!isToolName(tool)) throw new AiError("UNKNOWN_TOOL");
    const input = toolSchemas[tool].parse(rawInput) as Record<string, unknown>;
    // Re-read before account/list, before a cache hit, and on every new tool call.
    const context = await gatewayContext(rpc, authorization);
    if (tool === "account_get") {
      const regions = await Promise.all(
        context.regions.map(async (grant) => {
          try {
            const actual = (await execute(
              "account_get",
              {},
              authorization,
              context,
              grant,
            )) as Record<string, Json>;
            return { ...grant, scopes: actual.scopes, status: "connected" };
          } catch (error) {
            return {
              ...grant,
              status: "unavailable",
              error: error instanceof AiError ? error.code : "REGION_UNAVAILABLE",
            };
          }
        }),
      );
      const global = regions.find((grant) => grant.region === "global");
      return {
        ...context,
        ...(global && {
          user_id: global.user_id,
          scopes: global.scopes,
          trip_ids: global.trip_ids,
          all_trips: global.all_trips,
        }),
        regions,
        bound_regions: regions.map((r) => r.region),
      } as Json;
    }
    const explicit = input.region as DataRegion | undefined;
    delete input.region;
    const cursor = typeof input.cursor === "string" ? input.cursor : undefined;
    if (
      (tool === "trip_list" || tool === "idea_search") &&
      !explicit &&
      (!cursor || cursor.startsWith("page:"))
    )
      return aggregate(rpc, tool, input, authorization, context, execute);
    const { cursor: _cursor, ...query } = input;
    void _cursor;
    const fingerprint = credentialHash(
      JSON.stringify({ tool, query, explicit, grants: context.regions }),
    );
    let cursorRegion: DataRegion | undefined;
    if (cursor?.startsWith("page:")) {
      const saved = (await callRpc(rpc, "ai_gateway_service_v1", {
        action: "cursor_get",
        input: {
          ...authorization,
          cursor_id: cursor.slice(5),
          fingerprint,
        },
      })) as { region: DataRegion; cursor: string };
      cursorRegion = saved.region;
      input.cursor = saved.cursor;
    }
    const references = new Set<DataRegion>();
    mapResourceIds(input as Json, (id) => {
      references.add(handleRegion(id));
      return id;
    });
    if (references.size > 1) throw new AiError("CROSS_REGION_OPERATION");
    const inferred = references.values().next().value;
    if (explicit && inferred && explicit !== inferred) throw new AiError("CROSS_REGION_OPERATION");
    const region = inferred ?? explicit ?? cursorRegion ?? context.default_region;
    if (!region) throw new AiError("REGION_SELECTION_REQUIRED");
    const grant = context.regions.find((grant) => grant.region === region);
    if (!grant) throw new AiError("REGION_AUTHORIZATION_REQUIRED");
    const result = await execute(tool, input, authorization, context, grant);
    if (
      result &&
      typeof result === "object" &&
      !Array.isArray(result) &&
      typeof result.next_cursor === "string"
    ) {
      const id = await callRpc(rpc, "ai_gateway_service_v1", {
        action: "cursor_save",
        input: {
          ...authorization,
          fingerprint,
          positions: { region, cursor: result.next_cursor },
        },
      });
      return { ...result, next_cursor: `page:${id}` };
    }
    return result;
  };
}

type Positions = Partial<Record<DataRegion, string | null>>;
async function aggregate(
  rpc: Rpc,
  tool: string,
  input: Record<string, unknown>,
  authorization: AiAuthorization,
  context: GatewayContext,
  execute: RegionalAdapter,
): Promise<Json> {
  const { cursor, ...query } = input;
  const grants = [...context.regions].sort((a, b) =>
    a.region === b.region ? 0 : a.region === "global" ? -1 : 1,
  );
  const fingerprint = credentialHash(JSON.stringify({ tool, query, grants }));
  let positions: Positions = {};
  if (cursor) {
    positions = (await callRpc(rpc, "ai_gateway_service_v1", {
      action: "cursor_get",
      input: {
        ...authorization,
        cursor_id: String(cursor).replace(/^page:/, ""),
        fingerprint,
      },
    })) as Positions;
  }
  const items: Json[] = [],
    failures: Json[] = [];
  let remaining = Number(input.limit ?? 25);
  for (const grant of grants) {
    if (positions[grant.region] === null || remaining === 0) continue;
    const previous = positions[grant.region];
    try {
      const result = (await execute(
        tool,
        { ...query, limit: remaining, ...(previous && { cursor: previous }) },
        authorization,
        context,
        grant,
      )) as { items: Json[]; next_cursor: string | null };
      items.push(
        ...result.items.map((item) => ({ ...(item as object), data_region: grant.region })),
      );
      remaining -= result.items.length;
      positions[grant.region] = result.next_cursor ?? null;
    } catch (error) {
      failures.push({
        region: grant.region,
        code: error instanceof AiError ? error.code : "REGION_UNAVAILABLE",
      });
    }
  }
  const more = grants.some((grant) => positions[grant.region] !== null);
  const next = more
    ? await callRpc(rpc, "ai_gateway_service_v1", {
        action: "cursor_save",
        input: {
          ...authorization,
          fingerprint,
          positions,
        },
      })
    : null;
  return {
    items,
    next_cursor: next ? `page:${next}` : null,
    partial: failures.length > 0,
    failures,
  };
}
