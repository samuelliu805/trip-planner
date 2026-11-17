import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthProvider } from "@/platform/composition/server";
import { T } from "@/features/i18n/i18n-provider";
import { browserAiRpc } from "@/features/ai/database.server";
import { invokeTool } from "@/features/ai/service";
import { editLibraryIdea, saveLibraryIdea } from "@/features/ai/web-actions";
import { placeMapUrl } from "@/features/ai/places-links";

type Idea = {
  id: string;
  name: string;
  revision: string;
  region: string | null;
  notes: string | null;
  source_url: string | null;
  verification_status: string;
  archived: boolean;
  reason: string | null;
  tags: string[];
  needs_completion: boolean;
  location_status: "none" | "resolved" | "needs_resolution" | "user_provided";
  location_ref: { provider: "google" | "amap" | "custom"; providerPlaceId?: string } | null;
};
export const dynamic = "force-dynamic";
export const metadata = { title: "Personal ideas", robots: { index: false, follow: false } };
export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  if (!(await getAuthProvider().getCurrentUser())) redirect("/login");
  const { cursor } = await searchParams;
  const result = (await invokeTool(await browserAiRpc(), "idea_search", {
    cursor,
    include_archived: true,
  })) as { items: Idea[]; next_cursor: string | null };
  return (
    <main className="mx-auto min-h-dvh max-w-3xl space-y-6 p-6">
      <nav className="flex gap-4">
        <Link className="min-h-11 underline" href="/trips">
          <T message="Trips" />
        </Link>
        <Link className="min-h-11 underline" href="/account/ai">
          <T message="Connect your AI" />
        </Link>
      </nav>
      <h1 className="text-3xl font-semibold">
        <T message="Personal ideas" />
      </h1>
      <p>
        <T message="Save ideas without dates or a trip, then use them in multiple trips." />
      </p>
      <form action={saveLibraryIdea} className="grid gap-3 rounded-xl border p-4">
        <input type="hidden" name="idempotency_key" value={randomUUID()} />
        <label className="grid gap-1">
          <T message="Name" />
          <input
            className="min-h-11 min-w-0 rounded-lg border p-2"
            name="name"
            required
            maxLength={160}
          />
        </label>
        <label className="grid gap-1">
          <T message="Region" />
          <input className="min-h-11 min-w-0 rounded-lg border p-2" name="region" maxLength={200} />
        </label>
        <button className="min-h-11 rounded-lg bg-primary px-4 text-primary-foreground">
          <T message="Save idea" />
        </button>
      </form>
      {result.items.map((idea) => (
        <article className="space-y-3 rounded-xl border p-4" key={idea.id} id={idea.id}>
          <h2 className="break-words text-xl font-semibold">{idea.name}</h2>
          <p className="text-sm">
            <T message={idea.needs_completion ? "Needs completion" : "Unverified source"} />
          </p>
          {idea.location_status === "resolved" && (
            <p>
              <T message="Map location resolved" />
            </p>
          )}
          {idea.location_status === "needs_resolution" && (
            <p>
              <T message="Location needs confirmation" />
            </p>
          )}
          {idea.location_status === "user_provided" && (
            <p>
              <T message="User-provided location" />
            </p>
          )}
          {idea.location_ref &&
            idea.location_ref.provider !== "custom" &&
            idea.location_ref.providerPlaceId && (
              <a
                className="inline-flex min-h-11 items-center underline"
                href={placeMapUrl(idea.location_ref.provider, idea.location_ref.providerPlaceId)}
                target="_blank"
                rel="noreferrer"
              >
                <T message="Open map location" />
              </a>
            )}
          {idea.source_url && (
            <a
              className="break-all underline"
              href={idea.source_url}
              rel="noreferrer"
              target="_blank"
            >
              {idea.source_url}
            </a>
          )}
          {idea.reason && <p className="break-words">{idea.reason}</p>}
          {idea.tags.length > 0 && <p>{idea.tags.join(" · ")}</p>}
          <form action={editLibraryIdea} className="grid gap-3">
            <input type="hidden" name="idea_id" value={idea.id} />
            <input type="hidden" name="expected_revision" value={idea.revision} />
            <input type="hidden" name="idempotency_key" value={randomUUID()} />
            <label className="grid gap-1">
              <T message="Name" />
              <input
                className="min-h-11 min-w-0 rounded-lg border p-2"
                name="name"
                defaultValue={idea.name}
                maxLength={160}
                required
              />
            </label>
            <label className="grid gap-1">
              <T message="Region" />
              <input
                className="min-h-11 min-w-0 rounded-lg border p-2"
                name="region"
                defaultValue={idea.region ?? ""}
                maxLength={200}
              />
            </label>
            <label className="grid gap-1">
              <T message="Notes" />
              <textarea
                className="min-h-20 min-w-0 rounded-lg border p-2"
                name="notes"
                defaultValue={idea.notes ?? ""}
                maxLength={5000}
              />
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input name="archived" type="checkbox" defaultChecked={idea.archived} />
              <T message="Archived" />
            </label>
            {idea.location_ref && (
              <label className="flex min-h-11 items-center gap-3">
                <input name="clear_location" type="checkbox" />
                <T message="Remove saved location" />
              </label>
            )}
            <button className="min-h-11 rounded-lg border px-4">
              <T message="Save changes" />
            </button>
          </form>
        </article>
      ))}
      {result.next_cursor && (
        <Link
          className="inline-flex min-h-11 items-center underline"
          href={`/ideas?cursor=${result.next_cursor}`}
        >
          <T message="Next page" />
        </Link>
      )}
    </main>
  );
}
