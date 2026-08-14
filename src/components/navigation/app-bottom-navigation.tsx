"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export type AppBottomNavigationItem = {
  ariaControls?: string;
  elementId?: string;
  href?: string;
  Icon: LucideIcon;
  id: string;
  label: string;
};

export function AppBottomNavigation({
  activeId,
  ariaLabel,
  className,
  itemClassName,
  items,
  onSelect,
}: {
  activeId: string;
  ariaLabel: string;
  className?: string;
  itemClassName?: string;
  items: AppBottomNavigationItem[];
  onSelect?: (id: string) => void;
}) {
  const tabs = Boolean(onSelect);

  function handleKey(event: React.KeyboardEvent<HTMLButtonElement>, currentId: string) {
    if (!tabs) return;
    const currentIndex = items.findIndex(({ id }) => id === currentId);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowRight"
            ? (currentIndex + 1) % items.length
            : event.key === "ArrowLeft"
              ? (currentIndex - 1 + items.length) % items.length
              : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = items[nextIndex];
    onSelect?.(next.id);
    requestAnimationFrame(() =>
      document.getElementById(next.elementId ?? `bottom-nav-${next.id}`)?.focus(),
    );
  }

  const links = items.map((item) => {
    const active = item.id === activeId;
    const content = (
      <>
        <item.Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={active ? 2.5 : 2} />
        <span className="truncate">{item.label}</span>
      </>
    );
    const itemClasses = cn(
      "app-bottom-navigation-item flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold outline-none transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      active
        ? "is-active bg-primary text-primary-foreground shadow-sm"
        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      itemClassName,
    );

    if (item.href)
      return (
        <Link
          aria-current={active ? "page" : undefined}
          className={itemClasses}
          href={item.href}
          key={item.id}
          prefetch
        >
          {content}
        </Link>
      );

    return (
      <button
        aria-controls={item.ariaControls}
        aria-selected={active}
        className={itemClasses}
        id={item.elementId ?? `bottom-nav-${item.id}`}
        key={item.id}
        onClick={() => onSelect?.(item.id)}
        onKeyDown={(event) => handleKey(event, item.id)}
        role="tab"
        tabIndex={active ? 0 : -1}
        type="button"
      >
        {content}
      </button>
    );
  });

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "app-bottom-navigation grid gap-1 rounded-2xl border bg-background/95 p-1 shadow-xl backdrop-blur-xl",
        className,
      )}
    >
      {tabs ? (
        <div aria-label={ariaLabel} className="contents" role="tablist">
          {links}
        </div>
      ) : (
        links
      )}
    </nav>
  );
}
