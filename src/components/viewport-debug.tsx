"use client";

import { useEffect, useState } from "react";

/** Add `?viewport-debug=1` to any URL to switch the readout on. */
const debugFlag = "viewport-debug";

type Reading = Array<[string, string]>;

function read(): Reading {
  const viewport = window.visualViewport;
  const root = document.documentElement;
  const style = root.style;
  const px = (value: number | undefined) => (value === undefined ? "—" : `${Math.round(value)}`);

  return [
    ["window h", px(window.innerHeight)],
    ["visual h", px(viewport?.height)],
    ["keyboard", px(window.innerHeight - (viewport?.height ?? window.innerHeight))],
    ["offsetTop", px(viewport?.offsetTop)],
    ["pageTop", px(viewport?.pageTop)],
    ["scale", viewport ? viewport.scale.toFixed(3) : "—"],
    ["scrollY", px(window.scrollY)],
    ["root client h", px(root.clientHeight)],
    ["root scroll h", px(root.scrollHeight)],
    ["body scroll h", px(document.body.scrollHeight)],
    ["--vv-top", style.getPropertyValue("--visual-viewport-top") || "unset"],
    ["--vv-height", style.getPropertyValue("--visual-viewport-height") || "unset"],
  ];
}

/**
 * An on-device readout of the numbers behind the iPadOS keyboard behaviour. A desktop browser has
 * no software keyboard, so the only way to see what the platform actually reports is to put it on
 * screen and screenshot it. Pinned to the visible band so a panned page cannot carry it away.
 */
export function ViewportDebug() {
  const [reading, setReading] = useState<Reading | null>(null);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has(debugFlag)) return;
    const viewport = window.visualViewport;
    const sample = () => setReading(read());

    sample();
    // The transient states matter as much as the settled ones, hence a ticker beside the events.
    const ticker = window.setInterval(sample, 200);
    viewport?.addEventListener("resize", sample);
    viewport?.addEventListener("scroll", sample);
    window.addEventListener("resize", sample);
    return () => {
      window.clearInterval(ticker);
      viewport?.removeEventListener("resize", sample);
      viewport?.removeEventListener("scroll", sample);
      window.removeEventListener("resize", sample);
    };
  }, []);

  if (!reading) return null;

  return (
    <div
      className="pointer-events-none fixed left-2 z-[200] rounded-lg bg-black/80 px-2.5 py-2 font-mono text-[11px] leading-[1.35] text-white"
      style={{ top: "calc(var(--visual-viewport-top, 0px) + 0.5rem)" }}
    >
      {reading.map(([label, value]) => (
        <div className="flex gap-2" key={label}>
          <span className="w-24 shrink-0 text-white/60">{label}</span>
          <span className="tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  );
}
