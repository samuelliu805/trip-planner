"use client";

import { Check, Copy, MessageCircle, Share2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const subscribeToStaticBrowserState = () => () => {};
const isWechatBrowser = () => /MicroMessenger/i.test(window.navigator.userAgent);
const isWechatServer = () => false;

export function ShareQrCode({ label, url }: { label: string; url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !url) return;
    setError(false);
    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toCanvas(canvas, url, {
          errorCorrectionLevel: "M",
          margin: 1,
          scale: 5,
          color: { dark: "#173b2d", light: "#ffffff" },
        }),
      )
      .catch(() => setError(true));
  }, [url]);

  if (error)
    return <p className="text-xs text-destructive">QR code unavailable. Copy the link instead.</p>;

  return (
    <figure className="space-y-2 text-center">
      <canvas
        aria-label={`${label} QR code`}
        className="mx-auto size-36 border bg-white p-1"
        ref={canvasRef}
        role="img"
      />
      <figcaption className="text-xs font-medium text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

export function ShareLinkActions({
  description,
  title,
  url,
}: {
  description: string;
  title: string;
  url: string;
}) {
  const [status, setStatus] = useState<string>();
  const wechat = useSyncExternalStore(
    subscribeToStaticBrowserState,
    isWechatBrowser,
    isWechatServer,
  );

  async function share() {
    setStatus(undefined);
    if (!navigator.share) {
      setStatus("Native sharing is unavailable here. Copy the link or scan the QR code.");
      return;
    }
    try {
      await navigator.share({ text: description, title, url });
      setStatus("Shared.");
    } catch (error) {
      setStatus(
        error instanceof DOMException && error.name === "AbortError"
          ? "Share cancelled."
          : "Sharing was unavailable. Copy the link instead.",
      );
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied.");
    } catch {
      setStatus("Copy was unavailable. Select the URL and copy it manually.");
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button className="min-h-11 w-full sm:w-auto" onClick={() => void share()} type="button">
          <Share2 aria-hidden="true" className="size-4" /> Share
        </Button>
        <Button
          className="min-h-11 w-full sm:w-auto"
          onClick={() => void copy()}
          type="button"
          variant="outline"
        >
          {status === "Link copied." ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          Copy link
        </Button>
        <Button
          className="col-span-2 min-h-11 w-full sm:col-auto sm:w-auto"
          onClick={() => setStatus("Tap •••, then choose Send to Chat or Moments.")}
          type="button"
          variant="outline"
        >
          <MessageCircle aria-hidden="true" className="size-4" /> Share to WeChat
        </Button>
      </div>
      {wechat ? (
        <p className="border-l-2 border-primary bg-primary/5 px-3 py-2 text-sm">
          Tap •••, then choose Send to Chat or Moments.
        </p>
      ) : null}
      {status ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {status}
        </p>
      ) : null}
    </div>
  );
}
