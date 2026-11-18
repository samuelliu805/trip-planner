import { Check, ChevronDown, Clock3, Sparkles, Unplug } from "lucide-react";
import { T } from "@/features/i18n/i18n-provider";
import type { Locale } from "@/features/i18n/config";
import { ConnectionPermissions } from "./connection-permissions";
import { RegionalConnections } from "./regional-connections";
import type { GatewayContext } from "./regional-gateway";
import { revokeConnection } from "./web-actions";

export type AiConnection = {
  id: string;
  client_name: string;
  scopes: string[];
  trip_ids: string[];
  all_trips: boolean;
  last_used_at: string | null;
  revoked_at: string | null;
  activated_at: string | null;
};

export function ConnectionCard({
  connection,
  account,
  locale,
}: {
  connection: AiConnection;
  account?: GatewayContext;
  locale: Locale;
}) {
  const connected = Boolean(connection.activated_at);
  const StatusIcon = connected ? Check : Clock3;
  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="flex min-w-0 items-center gap-3 p-4 sm:p-5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-lg font-semibold">{connection.client_name || "MCP"}</h3>
          <span
            className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${connected ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"}`}
          >
            <StatusIcon aria-hidden="true" className="size-3" />
            <T message={connected ? "Connected" : "Awaiting connection"} />
          </span>
        </div>
      </header>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        {account ? (
          <RegionalConnections account={account} />
        ) : (
          <details className="group rounded-xl border bg-muted/30">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <T message="Permissions and access" />
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="border-t p-3">
              <ConnectionPermissions grant={connection} />
            </div>
          </details>
        )}
      </div>
      <footer className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-4 py-2 sm:px-5">
        <div className="min-w-0 text-xs text-muted-foreground">
          <p>
            <T message="Last used" />
          </p>
          {connection.last_used_at ? (
            <time className="mt-0.5 block font-medium" dateTime={connection.last_used_at}>
              {new Intl.DateTimeFormat(locale, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
                timeZone: "UTC",
              }).format(new Date(connection.last_used_at))}{" "}
              <T message="UTC" />
            </time>
          ) : (
            "—"
          )}
        </div>
        <form action={revokeConnection}>
          <input type="hidden" name="connection_id" value={connection.id} />
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Unplug aria-hidden="true" className="size-4" />
            <T
              message={
                process.env.APP_REGION === "cn" ? "Revoke CN authorization" : "Revoke connection"
              }
            />
          </button>
        </form>
      </footer>
    </article>
  );
}
