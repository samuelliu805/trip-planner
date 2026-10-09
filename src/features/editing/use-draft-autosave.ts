"use client";
import { useCallback, useEffect, useRef } from "react";

/** A close flush captures the current fields before their form unmounts. */
export function useDraftAutosave(
  enabled: boolean,
  signature: string,
  submit: () => void | Promise<void>,
) {
  const submitRef = useRef(submit),
    composing = useRef(false),
    accepted = useRef<string | undefined>(undefined),
    enabledRef = useRef(enabled);
  useEffect(() => {
    submitRef.current = submit;
    enabledRef.current = enabled;
  });
  const flush = useCallback(() => {
    if (composing.current || !enabledRef.current) return;
    void submitRef.current();
  }, []);
  useEffect(() => {
    if (!enabled || signature === accepted.current) return;
    const timer = window.setTimeout(() => {
      accepted.current = signature;
      flush();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [enabled, signature, flush]);
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
    };
  }, [flush]);
  return {
    flush,
    composition: (value: boolean) => {
      composing.current = value;
      if (!value) window.setTimeout(flush, 0);
    },
  };
}
