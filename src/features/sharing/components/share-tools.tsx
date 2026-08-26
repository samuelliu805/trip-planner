"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { Check, Copy, LoaderCircle, MessageCircle, Share2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

import { copyTextToClipboard } from "./copy-to-clipboard";
import { resolveWechatShareMode } from "../wechat-share";

const subscribeToStaticBrowserState = () => () => {};
const isWechatBrowser = () => /MicroMessenger/i.test(window.navigator.userAgent);
const isWechatServer = () => false;
const mobileShareQuery = "(max-width: 899px), (pointer: coarse)";
const isMobileShareBrowser = () => window.matchMedia(mobileShareQuery).matches;
const isMobileShareServer = () => false;
const subscribeToMobileShareState = (onStoreChange: () => void) => {
  const media = window.matchMedia(mobileShareQuery);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
};

export function ShareQrCode({ label, url }: { label: string; url: string }) {
  const { t } = useI18n();
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
    return (
      <p className="text-xs text-destructive">
        <T message={"QR code unavailable. Copy the link instead."} />
      </p>
    );

  return (
    <figure
      aria-busy={pending}
      className="flex w-full shrink-0 flex-col items-center justify-center gap-2 text-center"
    >
      <div className="relative size-36 shrink-0">
        <canvas
          aria-label={t("{label} QR code", { label: t(label) })}
          className={`block size-36 max-w-full border bg-white p-1 ${pending ? "opacity-20" : ""}`}
          ref={canvasRef}
          role="img"
        />
        {pending ? (
          <span className="absolute inset-0 flex items-center justify-center text-primary">
            <LoaderCircle aria-hidden="true" className="size-6 animate-spin" />
            <span className="sr-only">
              <T message={"Generating QR code"} />
            </span>
          </span>
        ) : null}
      </div>
      <figcaption className="text-xs font-medium text-muted-foreground">
        <Localized value={label} />
      </figcaption>
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
  const [sharingTarget, setSharingTarget] = useState<"general" | "wechat">();
  const wechat = useSyncExternalStore(
    subscribeToStaticBrowserState,
    isWechatBrowser,
    isWechatServer,
  );
  const mobileShare = useSyncExternalStore(
    subscribeToMobileShareState,
    isMobileShareBrowser,
    isMobileShareServer,
  );
  const sharing = sharingTarget !== undefined;

  async function share(target: "general" | "wechat") {
    if (sharing) return;
    setStatus(undefined);
    setSharingTarget(target);
    try {
      if (!navigator.share) {
        if (target === "wechat") {
          await copyTextToClipboard(url);
          setStatus("Link copied. Open WeChat and paste it into a chat.");
        } else {
          setStatus("Native sharing is unavailable here. Copy the link instead.");
        }
        return;
      }
      await navigator.share({ text: description, title, url });
      setStatus("Shared.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("Share cancelled.");
      } else if (target === "wechat") {
        try {
          await copyTextToClipboard(url);
          setStatus("Link copied. Open WeChat and paste it into a chat.");
        } catch {
          setStatus("Sharing was unavailable. Copy the link instead.");
        }
      } else {
        setStatus("Sharing was unavailable. Copy the link instead.");
      }
    } finally {
      setSharingTarget(undefined);
    }
  }

  function shareToWechat() {
    const mode = resolveWechatShareMode({
      canNativeShare: typeof navigator.share === "function",
      isMobile: mobileShare,
      isWechatBrowser: wechat,
    });
    if (mode === "wechat-menu") {
      setStatus("Tap •••, then choose Send to Chat or Moments.");
    } else if (mode === "desktop-qr") {
      setStatus(undefined);
      onWechatToggle();
    } else {
      void share("wechat");
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
          aria-busy={sharingTarget === "general"}
          className="min-h-11 w-full sm:w-auto"
          disabled={sharing}
          onClick={() => void share("general")}
          type="button"
        >
          {sharingTarget === "general" ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Share2 aria-hidden="true" className="size-4" />
          )}
          <Localized value={sharingTarget === "general" ? "Sharing…" : "Share"} />
        </Button>
        <Button
          className="min-h-11 w-full sm:w-auto"
          disabled={copying || sharing}
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
          <Localized value={copying ? "Copying…" : "Copy link"} />
        </Button>
        <Button
          aria-busy={sharingTarget === "wechat"}
          aria-expanded={mobileShare ? undefined : qrExpanded}
          className="col-span-2 min-h-11 w-full sm:col-auto sm:w-auto"
          disabled={sharing || copying}
          onClick={shareToWechat}
          type="button"
          variant="outline"
        >
          {sharingTarget === "wechat" ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <MessageCircle aria-hidden="true" className="size-4" />
          )}{" "}
          <Localized value={sharingTarget === "wechat" ? "Opening share options…" : "WeChat"} />
        </Button>
      </div>
      {status ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          <Localized value={status} />
        </p>
      ) : null}
    </div>
  );
}
