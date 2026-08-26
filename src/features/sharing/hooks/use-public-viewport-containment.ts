"use client";

import { useEffect } from "react";

/** Keeps the public shell pinned while mobile browser chrome changes the visual viewport. */
export function usePublicViewportContainment() {
  useEffect(() => {
    const visualViewport = window.visualViewport;

    function resetDocumentScroll() {
      if (window.scrollX || window.scrollY) window.scrollTo({ left: 0, top: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }

    resetDocumentScroll();
    window.addEventListener("resize", resetDocumentScroll);
    window.addEventListener("orientationchange", resetDocumentScroll);
    window.addEventListener("scroll", resetDocumentScroll, { passive: true });
    visualViewport?.addEventListener("resize", resetDocumentScroll);
    visualViewport?.addEventListener("scroll", resetDocumentScroll);

    return () => {
      window.removeEventListener("resize", resetDocumentScroll);
      window.removeEventListener("orientationchange", resetDocumentScroll);
      window.removeEventListener("scroll", resetDocumentScroll);
      visualViewport?.removeEventListener("resize", resetDocumentScroll);
      visualViewport?.removeEventListener("scroll", resetDocumentScroll);
    };
  }, []);
}
