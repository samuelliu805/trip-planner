import { PublicMediaExportContext } from "../components/public-media-export-context";
import type { CompiledPublicTemplateV1 } from "../templates/schema";
import type { PublicItinerary } from "../types";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import { ItineraryEdition } from "../components/editorial/itinerary-edition";
import { publicDisplayItinerary } from "../editorial-presentation";
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
    <PublicMediaExportContext.Provider value={true}>
      <main
        className={`timeline-export-document public-template-${template.id} ${template.id === "journal" || template.id === "ethereal" ? "edition-export" : ""}`}
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
        {template.id === "journal" || template.id === "ethereal" ? (
          <ItineraryEdition
            itinerary={publicDisplayItinerary(itinerary)}
            onSelectDay={ignoreSelection}
            onSelectItem={ignoreSelection}
            templateId={template.id}
            exporting
            includeCover={includeHeader}
          />
        ) : (
          <PublicTimeline
            itinerary={itinerary}
            onSelectDay={ignoreSelection}
            onSelectItem={ignoreSelection}
            showIntro={showIntro}
          />
        )}
        <footer className="timeline-export-footer">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated QR data is already final. */}
          <img alt={t("QR code")} className="timeline-export-qr" src={qrDataUrl} />
          <div className="timeline-export-footer-copy">
            <strong>
              <T
                message={
                  destinationType === "homepage"
                    ? "Plan your next journey with There we go"
                    : "Scan to explore the full itinerary"
                }
              />
            </strong>
            <span>{new URL(destinationUrl).hostname}</span>
          </div>
        </footer>
      </main>
    </PublicMediaExportContext.Provider>
  );
}
