import Link from "next/link";
import { getAuthProvider, getTripRepository } from "@/platform/composition/server";
import { regionalConfig } from "@/features/ai/regional-config";
import { regionalFetch } from "@/features/ai/regional-auth";
import { credentialHash } from "@/features/ai/oauth-model";
import { authorizeCnRegion } from "@/features/ai/regional-binding-actions";
import { T } from "@/features/i18n/i18n-provider";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Authorize CN data",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function RegionConsent({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const state = (await searchParams).state ?? "";
  const pending =
    process.env.APP_REGION === "cn" &&
    process.env.MCP_REGIONAL_API_ENABLED === "1" &&
    /^[A-Za-z0-9_-]{43}$/.test(state)
      ? ((await regionalFetch(regionalConfig(), "cn", "gateway", {
          action: "binding",
          state_hash: credentialHash(state),
        }).catch(() => null)) as { scopes: string[] } | null)
      : null;
  if (!pending)
    return (
      <main className="mx-auto max-w-xl p-6">
        <T message="Authorization expired. Start again from your AI client." />
      </main>
    );
  const user = await getAuthProvider().getCurrentUser();
  const trips = user ? (await getTripRepository().listForCurrentUser()).slice(0, 50) : [];
  return (
    <main className="mx-auto min-h-dvh max-w-xl space-y-6 overflow-x-hidden p-6">
      <h1 className="text-2xl font-semibold">
        <T message="Authorize CN data" />
      </h1>
      <p>
        <T message="Keep the same MCP address. This consent grants access only to your signed-in CN account." />
      </p>
      {!user ? (
        <Link
          className="inline-flex min-h-11 items-center underline"
          href={`/api/ai/region/login?state=${state}`}
        >
          <T message="Sign in to review this connection" />
        </Link>
      ) : (
        <form action={authorizeCnRegion} className="space-y-6">
          <input type="hidden" name="state" value={state} />
          <fieldset>
            <legend>
              <T message="Permissions" />
            </legend>
            {pending.scopes.map((scope) => (
              <label className="flex min-h-11 items-center gap-3" key={scope}>
                <input type="checkbox" name="scopes" value={scope} defaultChecked />
                {scope}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>
              <T message="Trip access" />
            </legend>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="all_trips" />
              <T message="All current and future trips I can access" />
            </label>
            {trips.map((trip) => (
              <label className="flex min-h-11 min-w-0 items-center gap-3" key={trip.id}>
                <input type="checkbox" name="trip_ids" value={trip.id} />
                <span className="min-w-0 break-words">{trip.title}</span>
              </label>
            ))}
          </fieldset>
          <button className="min-h-11 rounded-lg bg-primary px-5 text-primary-foreground">
            <T message="Allow connection" />
          </button>
          <Link
            className="ml-4 inline-flex min-h-11 items-center underline"
            href={`${regionalConfig().gatewayOrigin}/account/ai`}
          >
            <T message="Deny" />
          </Link>
        </form>
      )}
    </main>
  );
}
