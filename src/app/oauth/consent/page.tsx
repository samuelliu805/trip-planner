import Link from "next/link";
import { T } from "@/features/i18n/i18n-provider";
import { getAuthProvider, getTripRepository } from "@/platform/composition/server";
import { completeAuthorization } from "@/features/ai/consent-actions";
import { loadAuthorization } from "@/features/ai/oauth-request.server";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Connect your AI",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ request_id?: string }>;
}) {
  const nonce = (await searchParams).request_id ?? "";
  const authorization = await loadAuthorization(nonce).catch(() => null);
  if (!authorization)
    return (
      <main className="mx-auto max-w-xl space-y-4 p-6">
        <p>
          <T message="Authorization expired. Start again from your AI client." />
        </p>
        <Link href="/account/ai">
          <T message="Connect your AI" />
        </Link>
      </main>
    );
  const user = await getAuthProvider().getCurrentUser();
  const { parameters, oauth } = authorization;
  const client = (await oauth.store("client_get", { id: parameters.client_id })) as {
    client_name: string;
  };
  const trips = user ? (await getTripRepository().listForCurrentUser()).slice(0, 50) : [];
  return (
    <main className="mx-auto min-h-dvh max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">
        <T message="Connect your AI" />
      </h1>
      <p className="break-words font-medium">{client.client_name}</p>
      <p className="break-all text-sm text-muted-foreground">{parameters.redirect_uri}</p>
      <p>
        <T message="Your AI extracts and plans. Trip Planner saves structured data. No model API key is required." />
      </p>
      {!user ? (
        <Link className="inline-flex min-h-11 items-center underline" href="/login">
          <T message="Sign in to review this connection" />
        </Link>
      ) : (
        <form action={completeAuthorization} className="space-y-6">
          <input type="hidden" name="request_id" value={nonce} />
          <fieldset className="space-y-2">
            <legend className="font-semibold">
              <T message="Permissions" />
            </legend>
            {parameters.scope.split(" ").map((scope) => (
              <label key={scope} className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="scopes" value={scope} defaultChecked />
                {scope}
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="font-semibold">
              <T message="Trip access" />
            </legend>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="all_trips" />
              <T message="All current and future trips I can access" />
            </label>
            <p className="text-sm text-muted-foreground">
              <T message="Or select individual trips. Idea permissions apply to your personal library." />
            </p>
            {trips.map((trip) => (
              <label key={trip.id} className="flex min-h-11 min-w-0 items-center gap-3">
                <input type="checkbox" name="trip_ids" value={trip.id} />
                <span className="min-w-0 break-words">{trip.title}</span>
              </label>
            ))}
          </fieldset>
          <p className="text-sm">
            <T message="You can revoke this connection at any time. Current trip collaboration permissions still apply." />
          </p>
          <div className="flex gap-3">
            <button
              className="min-h-11 rounded-lg bg-primary px-5 text-primary-foreground"
              name="decision"
              value="allow"
            >
              <T message="Allow connection" />
            </button>
            <button className="min-h-11 rounded-lg border px-5" name="decision" value="deny">
              <T message="Deny" />
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
