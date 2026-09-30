import { renderTimelineExport } from "../../src/features/sharing/long-image/dom-renderer";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../../src/features/i18n/i18n-provider";
import { TimelineExportDocument } from "../../src/features/sharing/long-image/timeline-export-document";
import { getPublicTemplate } from "../../src/features/sharing/templates/registry";
import type { PublicItinerary } from "../../src/features/sharing/types";

declare global {
  interface Window {
    testExport: (
      itinerary: PublicItinerary,
      templateId: string,
    ) => Promise<Array<{ width: number; height: number; data: number[] }>>;
    testExportDocument: (itinerary: PublicItinerary, templateId: string) => void;
  }
}
window.testExport = async (itinerary, templateId) => {
  const parts = await renderTimelineExport({
    itinerary,
    templateId,
    templateVersion: 1,
    locale: "en",
    destinationType: "share_page",
    destinationUrl: "http://localhost:3000/share/11111111-1111-4111-8111-111111111111",
  });
  return Promise.all(
    parts.map(async (part) => ({
      ...part,
      blob: undefined,
      data: Array.from(new Uint8Array(await part.blob.arrayBuffer())),
    })),
  );
};
window.testExportDocument = (itinerary, templateId) => {
  const host = document.createElement("div");
  host.style.width = "540px";
  document.body.append(host);
  createRoot(host).render(
    <I18nProvider initialLocale="en">
      <TimelineExportDocument
        itinerary={itinerary}
        template={getPublicTemplate(`${templateId}@1`)!}
        destinationType="share_page"
        destinationUrl="http://localhost:3000/share/11111111-1111-4111-8111-111111111111"
        includeHeader
        showIntro
        qrDataUrl="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
      />
    </I18nProvider>,
  );
};
