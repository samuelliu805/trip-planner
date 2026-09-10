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
    const revealTarget = section.firstElementChild ?? section;
    if (revealTarget.getBoundingClientRect().top <= window.innerHeight) return;
    section.dataset.revealState = "pending";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        section.dataset.revealState = "visible";
        observer.disconnect();
      },
      { threshold: 0.01 },
    );
    observer.observe(revealTarget);
    return () => observer.disconnect();
  }, []);

  return (
    <section {...props} className={`${className} landing-reveal-section`.trim()} ref={sectionRef}>
      {children}
    </section>
  );
}
