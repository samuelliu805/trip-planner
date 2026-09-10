"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";

export function LandingRevealSection({
  children,
  className = "",
  ...props
}: ComponentPropsWithoutRef<"section">) {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (section.getBoundingClientRect().top <= window.innerHeight * 0.86) return;
    section.dataset.revealState = "pending";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        section.dataset.revealState = "visible";
        observer.disconnect();
      },
      { rootMargin: "0px 0px -10%", threshold: 0.12 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section {...props} className={`${className} landing-reveal-section`.trim()} ref={sectionRef}>
      {children}
    </section>
  );
}
