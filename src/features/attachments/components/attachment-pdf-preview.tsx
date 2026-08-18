"use client";

import { LoaderCircle } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const loadContinuousPdfViewer = () =>
  import("./continuous-pdf-viewer").then((module) => module.ContinuousPdfViewer);

const ContinuousPdfViewer = dynamic(loadContinuousPdfViewer, {
  loading: () => <PdfLoading label="Loading PDF viewer…" />,
  ssr: false,
});

export function preloadAttachmentPdfViewer() {
  void loadContinuousPdfViewer();
}

function PdfLoading({ label = "Loading PDF…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-[50dvh] items-center justify-center text-sm text-white/75"
      role="status"
    >
      <LoaderCircle aria-hidden="true" className="mr-2 size-4 animate-spin" /> {label}
    </div>
  );
}

export function AttachmentPdfPreview({
  fileName,
  onError,
  url,
}: {
  fileName: string;
  onError: () => void;
  url: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    let previewUrl: string | undefined;

    void loadContinuousPdfViewer();
    void fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`PDF request failed: ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        previewUrl = URL.createObjectURL(blob);
        setObjectUrl(previewUrl);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        onError();
      });

    return () => {
      controller.abort();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [onError, url]);

  if (!objectUrl) return <PdfLoading />;
  return <ContinuousPdfViewer fileName={fileName} onError={onError} url={objectUrl} />;
}
