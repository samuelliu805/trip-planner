import { Check, ChevronDown, Globe, Link2, MapPin, ShieldCheck } from "lucide-react";
import { T } from "@/features/i18n/i18n-provider";
import { bindCnRegion, manageRegion } from "./regional-binding-actions";
import { ConnectionPermissions } from "./connection-permissions";
import type { GatewayContext } from "./regional-gateway";

export function RegionalConnections({ account }: { account: GatewayContext }) {
  const cnBound = account.regions.some((grant) => grant.region === "cn");
  return (
    <section className="min-w-0 space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground">
        <T message="Data regions" />
      </h4>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {account.regions.map((grant) => {
          const isDefault = account.default_region === grant.region;
          const Icon = grant.region === "cn" ? MapPin : Globe;
          return (
            <div
              className={`min-w-0 rounded-xl border p-3 ${isDefault ? "border-primary/35 bg-primary/5 ring-1 ring-primary/10" : "bg-muted/30"}`}
              key={grant.region}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${grant.region === "cn" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200"}`}
                >
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <p className="font-semibold">{grant.region === "cn" ? "CN" : "Global"}</p>
                {isDefault && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                    <Check aria-hidden="true" className="size-3" />
                    <T message="Default" />
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {grant.scopes.some((scope) => scope.startsWith("trips:")) ? (
                  grant.all_trips ? (
                    <T message="All accessible trips" />
                  ) : (
                    <>
                      <T message="Selected trips" /> · {grant.trip_ids.length}
                    </>
                  )
                ) : (
                  <>
                    <T message="Permissions" /> · {grant.scopes.length}
                  </>
                )}
              </p>
              {!isDefault && (
                <form action={manageRegion} className="mt-2">
                  <input type="hidden" name="connection_id" value={account.connection_id} />
                  <input type="hidden" name="action" value="default" />
                  <input type="hidden" name="region" value={grant.region} />
                  <button className="min-h-11 w-full rounded-lg border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <T message="Use as default" />
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        <T
          message={
            account.default_region
              ? "New trips and ideas use the default region."
              : "Choose a default data region."
          }
        />
      </p>
      {!cnBound && (
        <form action={bindCnRegion}>
          <input type="hidden" name="connection_id" value={account.connection_id} />
          <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Link2 aria-hidden="true" className="size-4" />
            <T message="Bind CN account" />
          </button>
        </form>
      )}
      <details className="group rounded-xl border bg-muted/20">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <ShieldCheck aria-hidden="true" className="size-4 text-muted-foreground" />
          <T message="Permissions and access" />
          <ChevronDown
            aria-hidden="true"
            className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="grid min-w-0 gap-5 border-t p-3 sm:grid-cols-2">
          {account.regions.map((grant) => (
            <div className="min-w-0 space-y-3" key={grant.region}>
              <h5 className="font-semibold">{grant.region === "cn" ? "CN" : "Global"}</h5>
              <ConnectionPermissions grant={grant} />
              <div className="flex flex-wrap gap-x-3">
                {grant.region === "cn" && (
                  <form action={bindCnRegion}>
                    <input type="hidden" name="connection_id" value={account.connection_id} />
                    <button className="min-h-11 rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary/5">
                      <T message="Renew CN authorization" />
                    </button>
                  </form>
                )}
                <form action={manageRegion}>
                  <input type="hidden" name="connection_id" value={account.connection_id} />
                  <input type="hidden" name="action" value="unbind" />
                  <input type="hidden" name="region" value={grant.region} />
                  <button className="min-h-11 rounded-lg px-2 text-sm text-destructive hover:bg-destructive/10">
                    <T message="Unbind region" />
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
