"use client";

import { Check, Copy, LoaderCircle, MessageCircle, Share2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

import { copyTextToClipboard } from "./copy-to-clipboard";

const subscribeToStaticBrowserState = () => () => {};
const isWechatBrowser = () => /MicroMessenger/i.test(window.navigator.userAgent);
const isWechatServer = () => false;

export function ShareQrCode({ label, url }: { label: string; url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !url) return;
    setError(false);
    setPending(true);
    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toCanvas(canvas, url, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 144,
          color: { dark: "#173b2d", light: "#ffffff" },
        }),
      )
      .catch(() => setError(true))
      .finally(() => setPending(false));
  }, [url]);

  if (error)
    return <p className="text-xs text-destructive">QR code unavailable. Copy the link instead.</p>;

  return (
    <figure
      aria-busy={pending}
      className="flex w-full shrink-0 flex-col items-center justify-center gap-2 text-center"
    >
      <div className="relative size-36 shrink-0">
        <canvas
          aria-label={`${label} QR code`}
          className={`block size-36 max-w-full border bg-white p-1 ${pending ? "opacity-20" : ""}`}
          ref={canvasRef}
          role="img"
        />
        {pending ? (
          <span className="absolute inset-0 flex items-center justify-center text-primary">
            <LoaderCircle aria-hidden="true" className="size-6 animate-spin" />
            <span className="sr-only">Generating QR code</span>
          </span>
        ) : null}
      </div>
      <figcaption className="text-xs font-medium text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

export function ShareLinkActions({
  description,
  onWechatToggle,
  qrExpanded,
  title,
  url,
}: {
  description: string;
  onWechatToggle: () => void;
  qrExpanded: boolean;
  title: string;
  url: string;
}) {
  const [status, setStatus] = useState<string>();
  const [copying, setCopying] = useState(false);
  const [sharing, setSharing] = useState(false);
  const wechat = useSyncExternalStore(
    subscribeToStaticBrowserState,
    isWechatBrowser,
    isWechatServer,
  );

  async function share() {
    if (sharing) return;
    setStatus(undefined);
    if (!navigator.share) {
      setStatus("Native sharing is unavailable here. Copy the link or scan the QR code.");
      return;
    }
    setSharing(true);
    try {
      await navigator.share({ text: description, title, url });
      setStatus("Shared.");
    } catch (error) {
      setStatus(
        error instanceof DOMException && error.name === "AbortError"
          ? "Share cancelled."
          : "Sharing was unavailable. Copy the link instead.",
      );
    } finally {
      setSharing(false);
    }
  }

  async function copy() {
    if (copying) return;
    setCopying(true);
    try {
      await copyTextToClipboard(url);
      setStatus("Link copied.");
    } catch {
      setStatus("Copy was unavailable. Select the URL and copy it manually.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button
          aria-busy={sharing}
          className="min-h-11 w-full sm:w-auto"
          disabled={sharing}
          onClick={() => void share()}
          type="button"
        >
          {sharing ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Share2 aria-hidden="true" className="size-4" />
          )}
          {sharing ? "Sharing…" : "Share"}
        </Button>
        <Button
          className="min-h-11 w-full sm:w-auto"
          disabled={copying}
          onClick={() => void copy()}
          type="button"
          variant="outline"
        >
          {copying ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : status === "Link copied." ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          {copying ? "Copying…" : "Copy link"}
        </Button>
        <Button
          aria-expanded={qrExpanded}
          className="col-span-2 min-h-11 w-full sm:col-auto sm:w-auto"
          onClick={() => {
            onWechatToggle();
            setStatus(wechat ? "Tap •••, then choose Send to Chat or Moments." : undefined);
          }}
          type="button"
          variant="outline"
        >
          <MessageCircle aria-hidden="true" className="size-4" /> WeChat
        </Button>
      </div>
      {status ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {status}
        </p>
      ) : null}
    </div>
  );
}
