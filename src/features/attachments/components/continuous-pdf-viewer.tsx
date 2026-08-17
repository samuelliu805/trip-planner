"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export function ContinuousPdfViewer({
  fileName,
  onError,
  url,
}: {
  fileName: string;
  onError: () => void;
  url: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageWidth, setPageWidth] = useState(320);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => setPageWidth(Math.max(240, Math.min(960, container.clientWidth)));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl" ref={containerRef}>
      <Document
        error={null}
        file={url}
        loading={
          <div className="flex min-h-[50dvh] items-center justify-center text-sm text-white/75">
            <LoaderCircle aria-hidden="true" className="mr-2 size-4 animate-spin" /> Loading PDF…
          </div>
        }
        onLoadError={onError}
        onLoadSuccess={({ numPages }) => setPageCount(numPages)}
      >
        <div
          aria-label={`${fileName}, ${pageCount} ${pageCount === 1 ? "page" : "pages"}`}
          className="flex min-w-0 flex-col items-center gap-4 pb-4"
          data-continuous-pdf=""
        >
          {Array.from({ length: pageCount }, (_, index) => (
            <figure className="m-0 max-w-full" data-pdf-page={index + 1} key={index + 1}>
              <Page
                loading={
                  <div
                    className="grid min-h-72 place-items-center bg-white text-sm text-black/60"
                    style={{ width: pageWidth }}
                  >
                    Loading page {index + 1}…
                  </div>
                }
                pageNumber={index + 1}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                width={pageWidth}
              />
              <figcaption className="pt-2 text-center text-xs text-white/65">
                Page {index + 1} of {pageCount}
              </figcaption>
            </figure>
          ))}
        </div>
      </Document>
    </div>
  );
}
