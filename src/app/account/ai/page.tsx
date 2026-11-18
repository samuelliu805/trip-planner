import Link from "next/link";
import { redirect } from "next/navigation";
import { T, Localized } from "@/features/i18n/i18n-provider";
import { getAuthProvider } from "@/platform/composition/server";
import { aiConfig } from "@/features/ai/config";
import { browserAiRpc } from "@/features/ai/database.server";
import { callRpc } from "@/features/ai/service";
import { revokeConnection } from "@/features/ai/web-actions";
import { clientGuides } from "@/features/ai/client-guides";
import { RegionalConnections } from "@/features/ai/regional-connections";
import type { GatewayContext } from "@/features/ai/regional-gateway";

type Connection = {
  id: string;
  client_name: string;
  scopes: string[];
  trip_ids: string[];
  all_trips: boolean;
  last_used_at: string | null;
  revoked_at: string | null;
  activated_at: string | null;
};
export const dynamic = "force-dynamic";
export const metadata = { title: "Connect your AI", robots: { index: false, follow: false } };
export default async function AiConnectionsPage() {
  if (!(await getAuthProvider().getCurrentUser())) redirect("/login");
  const config = (() => {
    try {
      return aiConfig({
        regional: process.env.APP_REGION === "cn" && process.env.MCP_REGIONAL_API_ENABLED === "1",
      });
    } catch {
      return null;
    }
  })();
  const connections = config
    ? (
        (await callRpc(await browserAiRpc(), "ai_connections_v1", {
          action: "list",
        })) as Connection[]
      ).filter((connection) => !connection.revoked_at)
    : [];
  const regionalAccounts =
    process.env.MCP_REGIONAL_GATEWAY_ENABLED === "1"
      ? ((await callRpc(await browserAiRpc(), "ai_gateway_manage_v1", {
          action: "list",
          input: {},
        })) as GatewayContext[])
      : [];
  const publicResource =
    process.env.APP_REGION === "cn" && process.env.MCP_GATEWAY_ORIGIN
      ? `${process.env.MCP_GATEWAY_ORIGIN}/mcp`
      : config?.resource;
  return (
    <main className="mx-auto min-h-dvh max-w-3xl space-y-6 p-6">
      <nav className="flex gap-4">
        <Link className="min-h-11 underline" href="/account">
          <T message="Account" />
        </Link>
        <Link className="min-h-11 underline" href="/ideas">
          <T message="Personal ideas" />
        </Link>
      </nav>
      <h1 className="text-3xl font-semibold">
        <T message="Connect your AI" />
      </h1>
      <p>
        <T message="Your AI extracts and plans. Trip Planner saves structured data. No model API key is required." />
      </p>
      {publicResource ? (
        <code className="block break-all rounded-lg bg-muted p-4">{publicResource}</code>
      ) : (
        <p role="status">
          <T message="Remote MCP is not enabled on this deployment." />
        </p>
      )}
      <h2 className="text-xl font-semibold">
        <T message="Connections" />
      </h2>
      {!connections.length && (
        <p>
          <T message="No AI connections yet." />
        </p>
      )}
      {connections.map((connection) => (
        <article className="space-y-2 rounded-xl border p-4" key={connection.id}>
          <h3 className="break-words font-semibold">{connection.client_name}</h3>
          <p className="break-words text-sm">{connection.scopes.join(" · ")}</p>
          <p className="break-all text-sm">
            {connection.all_trips ? (
              <T message="All current and future trips I can access" />
            ) : (
              connection.trip_ids.join(", ")
            )}
          </p>
          <p>
            <T
              message={
                connection.revoked_at
                  ? "Revoked"
                  : connection.activated_at
                    ? "Connected"
                    : "Awaiting token exchange"
              }
            />
          </p>
          <p className="text-sm">
            <T message="Last used" />:{" "}
            {connection.last_used_at ? (
              <time dateTime={connection.last_used_at}>
                {new Date(connection.last_used_at).toISOString()}
              </time>
            ) : (
              "—"
            )}
          </p>
          {!connection.revoked_at && (
            <form action={revokeConnection}>
              <input type="hidden" name="connection_id" value={connection.id} />
              <button className="min-h-11 rounded-lg border px-4">
                <T
                  message={
                    process.env.APP_REGION === "cn"
                      ? "Revoke CN authorization"
                      : "Revoke connection"
                  }
                />
              </button>
            </form>
          )}
          {regionalAccounts.find((account) => account.connection_id === connection.id) ? (
            <RegionalConnections
              account={regionalAccounts.find((account) => account.connection_id === connection.id)!}
            />
          ) : null}
        </article>
      ))}
      <h2 className="text-xl font-semibold">
        <T message="Client setup" />
      </h2>
      {clientGuides.map((client) => (
        <article className="space-y-2 rounded-xl border p-4" key={client.name}>
          <h3 className="font-semibold">{client.name}</h3>
          <p className="text-sm text-muted-foreground">
            <Localized value={client.status} />
          </p>
          <pre className="whitespace-pre-wrap break-words text-sm">
            <Localized value={client.guide.replaceAll("MCP_URL", publicResource ?? "MCP_URL")} />
          </pre>
          <a
            className="inline-flex min-h-11 items-center underline"
            href={client.docs}
            rel="noreferrer"
            target="_blank"
          >
            <T message="Official instructions" />
          </a>
        </article>
      ))}
    </main>
  );
}
