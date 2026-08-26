import { getFontEmbedCSS, toCanvas } from "html-to-image";
import QRCode from "qrcode";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import type { Locale } from "@/features/i18n/config";
import { I18nProvider } from "@/features/i18n/i18n-provider";

import {
  LEGACY_PUBLIC_TEMPLATE_KEY,
  getPublicTemplate,
  registeredPublicTemplateKey,
} from "../templates/registry";
import type { PublicItinerary, PublicItineraryDay } from "../types";
import {
  TIMELINE_EXPORT_CSS_WIDTH,
  TIMELINE_EXPORT_MAX_CSS_HEIGHT,
  TIMELINE_EXPORT_MAX_HEIGHT,
  TIMELINE_EXPORT_PIXEL_RATIO,
  TIMELINE_EXPORT_WIDTH,
  paginateTimelineDayHeights,
  splitTimelineExportDays,
} from "./layout";
import { TimelineExportDocument } from "./timeline-export-document";

type RenderTimelineExportInput = {
  destinationType: "share_page" | "homepage";
  destinationUrl: string;
  itinerary: PublicItinerary;
  locale: Locale;
  templateId: string;
  templateVersion: number;
};

type DocumentOptions = RenderTimelineExportInput & {
  days: PublicItineraryDay[];
  includeHeader: boolean;
  qrDataUrl: string;
  showIntro: boolean;
};

const transparentPixel = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

function paint() {
  return new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

async function waitForImages(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) return resolve();
          const timeout = window.setTimeout(resolve, 15_000);
          const done = () => {
            window.clearTimeout(timeout);
            resolve();
          };
          image.addEventListener("load", done, { once: true });
          image.addEventListener("error", done, { once: true });
        }),
    ),
  );
}

async function settleDocument(node: HTMLElement) {
  await Promise.race([
    document.fonts?.ready ?? Promise.resolve(),
    new Promise<void>((resolve) => window.setTimeout(resolve, 15_000)),
  ]);
  await waitForImages(node);
  await paint();
}

function createCaptureHost() {
  const host = document.createElement("div");
  host.dataset.timelineExportHost = "";
  Object.assign(host.style, {
    left: "-10000px",
    pointerEvents: "none",
    position: "fixed",
    top: "0",
    width: `${TIMELINE_EXPORT_CSS_WIDTH}px`,
    zIndex: "-1",
  });
  document.body.append(host);
  return host;
}

async function showDocument(
  host: HTMLElement,
  root: Root,
  options: DocumentOptions,
  template: NonNullable<ReturnType<typeof getPublicTemplate>>,
) {
  const itinerary = { ...options.itinerary, days: options.days };
  flushSync(() => {
    root.render(
      <I18nProvider initialLocale={options.locale}>
        <TimelineExportDocument
          destinationType={options.destinationType}
          destinationUrl={options.destinationUrl}
          includeHeader={options.includeHeader}
          itinerary={itinerary}
          qrDataUrl={options.qrDataUrl}
          showIntro={options.showIntro}
          template={template}
        />
      </I18nProvider>,
    );
  });
  const documentNode = host.firstElementChild;
  if (!(documentNode instanceof HTMLElement)) throw new Error("Timeline export did not mount.");
  await settleDocument(documentNode);
  return documentNode;
}

function documentHeight(node: HTMLElement) {
  return Math.ceil(Math.max(node.scrollHeight, node.getBoundingClientRect().height));
}

function dayMeasurements(node: HTMLElement) {
  const dayNodes = Array.from(node.querySelectorAll<HTMLElement>(".timeline-section-v4"));
  const dayHeights = dayNodes.map((day) => day.getBoundingClientRect().height);
  const sections = node.querySelector<HTMLElement>(".timeline-sections-v4");
  const dayGap = sections ? Number.parseFloat(getComputedStyle(sections).rowGap) || 0 : 0;
  return { dayGap, dayHeights };
}

async function captureDocument(
  node: HTMLElement,
  fontEmbedCSS?: string,
): Promise<{ blob: Blob; height: number; width: typeof TIMELINE_EXPORT_WIDTH }> {
  const height = documentHeight(node);
  if (height > TIMELINE_EXPORT_MAX_CSS_HEIGHT)
    throw new Error("A Timeline image part exceeded the safe browser canvas height.");
  const backgroundColor = getComputedStyle(node).backgroundColor;
  const canvas = await toCanvas(node, {
    backgroundColor,
    cacheBust: false,
    fontEmbedCSS,
    height,
    imagePlaceholder: transparentPixel,
    pixelRatio: TIMELINE_EXPORT_PIXEL_RATIO,
    preferredFontFormat: "woff2",
    skipAutoScale: true,
    width: TIMELINE_EXPORT_CSS_WIDTH,
  });
  if (canvas.width !== TIMELINE_EXPORT_WIDTH || canvas.height > TIMELINE_EXPORT_MAX_HEIGHT)
    throw new Error("The Timeline image dimensions are invalid.");
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("The browser could not encode the Timeline image.");
  return { blob, height: canvas.height, width: TIMELINE_EXPORT_WIDTH };
}

export async function renderTimelineExport(input: RenderTimelineExportInput) {
  const templateKey = registeredPublicTemplateKey(input.templateId, input.templateVersion);
  const template =
    (templateKey ? getPublicTemplate(templateKey) : undefined) ??
    getPublicTemplate(LEGACY_PUBLIC_TEMPLATE_KEY);
  if (!template) throw new Error("The Share Page template is unavailable.");
  const qrDataUrl = await QRCode.toDataURL(input.destinationUrl, {
    color: { dark: "#172b20", light: "#ffffff" },
    errorCorrectionLevel: "Q",
    margin: 3,
    width: 180,
  });
  const days = splitTimelineExportDays(input.itinerary.days);
  const host = createCaptureHost();
  const root = createRoot(host);

  try {
    let node = await showDocument(
      host,
      root,
      {
        ...input,
        days,
        includeHeader: true,
        qrDataUrl,
        showIntro: true,
      },
      template,
    );
    let fontEmbedCSS: string | undefined;
    try {
      fontEmbedCSS = await getFontEmbedCSS(node, { preferredFontFormat: "woff2" });
    } catch {
      fontEmbedCSS = undefined;
    }
    if (documentHeight(node) <= TIMELINE_EXPORT_MAX_CSS_HEIGHT)
      return [await captureDocument(node, fontEmbedCSS)];

    const { dayGap, dayHeights } = dayMeasurements(node);
    const firstPageChromeHeight =
      documentHeight(node) -
      dayHeights.reduce((sum, height) => sum + height, 0) -
      Math.max(0, dayHeights.length - 1) * dayGap;
    node = await showDocument(
      host,
      root,
      {
        ...input,
        days: [],
        includeHeader: false,
        qrDataUrl,
        showIntro: false,
      },
      template,
    );
    const pages = paginateTimelineDayHeights({
      continuationChromeHeight: documentHeight(node),
      dayGap,
      dayHeights,
      firstPageChromeHeight,
    });
    if (pages.length > 20) throw new Error("This Timeline needs more than 20 image parts.");

    const rendered = [];
    for (const [index, page] of pages.entries()) {
      node = await showDocument(
        host,
        root,
        {
          ...input,
          days: days.slice(page.start, page.end),
          includeHeader: index === 0,
          qrDataUrl,
          showIntro: index === 0,
        },
        template,
      );
      rendered.push(await captureDocument(node, fontEmbedCSS));
    }
    return rendered;
  } finally {
    root.unmount();
    host.remove();
  }
}

export async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
