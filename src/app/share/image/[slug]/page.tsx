import { Download } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { getShareImageManifest } from "@/features/sharing/data";
import { formatShareImageExpiry } from "@/features/sharing/long-image/expiration";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const slugSchema = z.string().regex(/^[0-9a-f]{24}$/);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const manifest = slugSchema.safeParse(slug).success ? await getShareImageManifest(slug) : null;
  return {
    robots: { follow: false, index: false, noarchive: true },
    title: manifest ? `${manifest.title} · Timeline image` : "Shared image unavailable",
  };
}

export default async function ShareImagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) notFound();
  const manifest = await getShareImageManifest(slug);
  if (!manifest) notFound();

  return (
    <main className="min-h-dvh bg-muted/30 px-3 py-6 sm:px-6">
      <div className="mx-auto max-w-[1120px] space-y-5">
        <header className="border bg-background p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Shared trip image
            </p>
            <h1 className="mt-1 text-xl font-semibold">{manifest.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {manifest.expiresAt
                ? `Available until ${formatShareImageExpiry(manifest.expiresAt)} · `
                : ""}
              Version {manifest.versionNumber} · {manifest.parts.length}{" "}
              {manifest.parts.length === 1 ? "part" : "parts"}
            </p>
          </div>
        </header>
        {manifest.parts.map((part) => {
          const source = `/share/image/${manifest.permanentSlug}/part/${part.partNumber}`;
          return (
            <figure className="space-y-2" key={part.partNumber}>
              {/* eslint-disable-next-line @next/next/no-img-element -- preserve the exact 1080 px export without image optimization. */}
              <img
                alt={`${manifest.title}, Timeline image part ${part.partNumber}`}
                className="h-auto w-full border bg-white"
                height={part.height}
                loading={part.partNumber === 1 ? "eager" : "lazy"}
                src={source}
                width={part.width}
              />
              <div className="flex justify-end">
                <Button asChild className="min-h-11" variant="outline">
                  <a
                    download={`${manifest.title}-part-${part.partNumber}.jpg`}
                    href={`${source}?download=1`}
                  >
                    <Download className="size-4" /> Download part {part.partNumber}
                  </a>
                </Button>
              </div>
            </figure>
          );
        })}
      </div>
    </main>
  );
}
