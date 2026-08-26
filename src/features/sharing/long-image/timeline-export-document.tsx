import type { CompiledPublicTemplateV1 } from "../templates/schema";
import type { PublicItinerary } from "../types";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import { PublicTimeline } from "../components/public-timeline";
import { PublicTripHeader } from "../components/public-trip-header";

const ignoreSelection = () => undefined;

export function TimelineExportDocument({
  destinationType,
  destinationUrl,
  includeHeader,
  itinerary,
  qrDataUrl,
  showIntro,
  template,
}: {
  destinationType: "share_page" | "homepage";
  destinationUrl: string;
  includeHeader: boolean;
  itinerary: PublicItinerary;
  qrDataUrl: string;
  showIntro: boolean;
  template: CompiledPublicTemplateV1;
}) {
  const { t } = useI18n();
  return (
    <main
      className={`timeline-export-document public-template-${template.id}`}
      data-public-template={template.id}
      data-public-template-key={template.key}
      data-public-template-version={template.version}
      data-timeline-export-root=""
    >
      <style data-public-template-styles={template.key}>{template.scopedCss}</style>
      {includeHeader ? (
        <header className="public-itinerary-header timeline-export-header">
          <div className="public-header-row">
            <div
              className="public-template-region public-template-region-brand-row"
              data-tp-region="brand-row"
            >
              <PublicTripHeader itinerary={itinerary} template={template} />
            </div>
          </div>
        </header>
      ) : null}
      <PublicTimeline
        itinerary={itinerary}
        onSelectDay={ignoreSelection}
        onSelectItem={ignoreSelection}
        showIntro={showIntro}
      />
      <footer className="timeline-export-footer">
        {/* eslint-disable-next-line @next/next/no-img-element -- generated QR data is already final. */}
        <img alt={t("QR code")} className="timeline-export-qr" src={qrDataUrl} />
        <div className="timeline-export-footer-copy">
          <strong>
            <T
              message={
                destinationType === "homepage"
                  ? "Plan your next journey with Trip Planner"
                  : "Scan to explore the full itinerary"
              }
            />
          </strong>
          <span>{new URL(destinationUrl).hostname}</span>
        </div>
      </footer>
    </main>
  );
}
