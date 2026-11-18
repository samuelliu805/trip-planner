import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  Link2,
  PlugZap,
  Sparkles,
} from "lucide-react";
import { T, Localized } from "@/features/i18n/i18n-provider";
import { getRequestLocale } from "@/features/i18n/server";
import { AccountMenu } from "@/components/navigation/account-menu";
import { getAuthProvider } from "@/platform/composition/server";
import { appUserIdentityLabel } from "@/platform/contracts/auth";
import { aiConfig } from "@/features/ai/config";
import { browserAiRpc } from "@/features/ai/database.server";
import { callRpc } from "@/features/ai/service";
import { clientGuides } from "@/features/ai/client-guides";
import { ConnectionCard, type AiConnection } from "@/features/ai/connection-card";
import type { GatewayContext } from "@/features/ai/regional-gateway";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect your AI", robots: { index: false, follow: false } };
export default async function AiConnectionsPage() {
  const user = await getAuthProvider().getCurrentUser();
  if (!user) redirect("/login");
  const locale = await getRequestLocale();
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
        })) as AiConnection[]
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
    <main className="mx-auto min-h-dvh max-w-4xl space-y-7 px-4 py-6 sm:px-6 sm:py-8">
      <nav className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          href="/account"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          <T message="Account" />
        </Link>
        <AccountMenu identityLabel={appUserIdentityLabel(user)} />
      </nav>
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles aria-hidden="true" className="size-5" />
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">
            <T message="Connect your AI" />
          </h1>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          <T message="Use the same address for every region you authorize." />
        </p>
      </header>
      <section className="relative isolate overflow-hidden rounded-3xl border border-primary/20 bg-linear-to-br from-primary/10 via-card to-primary/5 p-5 shadow-sm sm:p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-20 -z-10 size-52 rounded-full bg-primary/10 blur-2xl"
        />
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-primary">
          <Link2 aria-hidden="true" className="size-4" />
          <T message="MCP address" />
        </p>
        {publicResource ? (
          <code className="block select-all break-all text-lg font-semibold leading-relaxed sm:text-2xl">
            {publicResource}
          </code>
        ) : (
          <p role="status" className="text-sm">
            <T message="Remote MCP is not enabled on this deployment." />
          </p>
        )}
      </section>
      <section className="space-y-3" aria-labelledby="ai-connections-heading">
        <div className="flex items-center gap-2">
          <h2 id="ai-connections-heading" className="text-lg font-semibold">
            <T message="Connections" />
          </h2>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium tabular-nums">
            {connections.length}
          </span>
        </div>
        {!connections.length && (
          <div
            className="rounded-2xl border border-dashed bg-card/70 px-5 py-8 text-center"
            role="status"
          >
            <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-muted text-primary">
              <PlugZap aria-hidden="true" className="size-6" />
            </span>
            <p className="font-medium">
              <T message="No AI connections yet." />
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              <T message="Add this address in your AI client, then authorize in your browser." />
            </p>
          </div>
        )}
        {connections.map((connection) => (
          <ConnectionCard
            connection={connection}
            account={regionalAccounts.find((account) => account.connection_id === connection.id)}
            locale={locale}
            key={connection.id}
          />
        ))}
      </section>
      <details className="group rounded-2xl border bg-card/80 shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 font-medium sm:px-5 [&::-webkit-details-marker]:hidden">
          <BookOpen aria-hidden="true" className="size-5 text-primary" />
          <T message="Client setup" />
          <ChevronDown
            aria-hidden="true"
            className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="grid min-w-0 gap-3 border-t p-4 sm:grid-cols-2 sm:p-5">
          {clientGuides.map((client) => (
            <details
              className="group/client min-w-0 rounded-xl border bg-background/60"
              key={client.name}
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                {client.name}
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 transition-transform group-open/client:rotate-180"
                />
              </summary>
              <div className="space-y-3 border-t p-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <Localized value={client.status} />
                </p>
                <pre className="whitespace-pre-wrap break-all rounded-lg bg-muted/70 p-3 text-xs leading-relaxed">
                  <Localized
                    value={client.guide.replaceAll("MCP_URL", publicResource ?? "MCP_URL")}
                  />
                </pre>
                <a
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  href={client.docs}
                  rel="noreferrer"
                  target="_blank"
                >
                  <T message="Official instructions" />
                  <ArrowUpRight aria-hidden="true" className="size-4" />
                </a>
              </div>
            </details>
          ))}
        </div>
      </details>
    </main>
  );
}
