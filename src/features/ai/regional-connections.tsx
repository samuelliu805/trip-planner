import { T } from "@/features/i18n/i18n-provider";
import { bindCnRegion, manageRegion } from "./regional-binding-actions";
import type { GatewayContext } from "./regional-gateway";

export function RegionalConnections({ account }: { account: GatewayContext }) {
  return (
    <section className="min-w-0 space-y-3 border-t pt-3">
      <p>
        <T message="Default data region" />: {account.default_region ?? "—"}
      </p>
      <p className="text-sm">
        <T message="Choose a default once here. Your MCP address stays the same when you add a region." />
      </p>
      {account.regions.map((grant) => (
        <div className="min-w-0 space-y-2 rounded-lg border p-3" key={grant.region}>
          <p className="font-medium">{grant.region === "cn" ? "CN" : "Global"}</p>
          <p className="break-words text-sm">{grant.scopes.join(" · ")}</p>
          <p className="break-all text-sm">
            {grant.all_trips ? (
              <T message="All current and future trips I can access" />
            ) : (
              grant.trip_ids.join(", ") || "—"
            )}
          </p>
          <div className="flex min-w-0 flex-wrap gap-3">
            {account.default_region !== grant.region ? (
              <form action={manageRegion}>
                <input type="hidden" name="connection_id" value={account.connection_id} />
                <input type="hidden" name="action" value="default" />
                <input type="hidden" name="region" value={grant.region} />
                <button className="min-h-11 rounded-lg border px-4">
                  <T message="Use as default" />
                </button>
              </form>
            ) : null}
            <form action={manageRegion}>
              <input type="hidden" name="connection_id" value={account.connection_id} />
              <input type="hidden" name="action" value="unbind" />
              <input type="hidden" name="region" value={grant.region} />
              <button className="min-h-11 rounded-lg border px-4">
                <T message="Unbind region" />
              </button>
            </form>
          </div>
        </div>
      ))}
      <form action={bindCnRegion}>
        <input type="hidden" name="connection_id" value={account.connection_id} />
        <button className="min-h-11 rounded-lg border px-4">
          <T
            message={
              account.regions.some((grant) => grant.region === "cn")
                ? "Renew CN authorization"
                : "Bind CN account"
            }
          />
        </button>
      </form>
    </section>
  );
}
