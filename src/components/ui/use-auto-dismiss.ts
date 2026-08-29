"use client";

import { useEffect, useRef } from "react";

export function useAutoDismiss(value: unknown, onDismiss: () => void, delayMilliseconds = 5_000) {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    if (!value) return;
    const timer = window.setTimeout(() => dismissRef.current(), delayMilliseconds);
    return () => window.clearTimeout(timer);
  }, [delayMilliseconds, value]);
}
