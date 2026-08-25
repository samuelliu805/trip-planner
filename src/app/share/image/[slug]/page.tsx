import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ShareImagePageContent } from "@/features/sharing/components/share-image-page-content";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { getShareImageManifest } from "@/features/sharing/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const slugSchema = z.string().regex(/^[0-9a-f]{24}$/);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getRequestLocale()]);
  const manifest = slugSchema.safeParse(slug).success ? await getShareImageManifest(slug) : null;
  return {
    robots: { follow: false, index: false, noarchive: true },
    title: manifest
      ? `${manifest.title} · ${translateMessage(locale, "Timeline image")}`
      : translateMessage(locale, "Shared image unavailable"),
  };
}

export default async function ShareImagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) notFound();
  const manifest = await getShareImageManifest(slug);
  if (!manifest) notFound();

  return (
    <main className="min-h-dvh bg-muted/30 px-3 py-6 sm:px-6">
      <ShareImagePageContent
        expiresAt={manifest.expiresAt}
        parts={manifest.parts}
        permanentSlug={manifest.permanentSlug}
        title={manifest.title}
        versionNumber={manifest.versionNumber}
      />
    </main>
  );
}
