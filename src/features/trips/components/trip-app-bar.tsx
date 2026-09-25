"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { ArrowLeft, CloudUpload, Lightbulb, LoaderCircle, Plus, Table2 } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { useState, type ReactNode } from "react";

import { AppBottomNavigation } from "@/components/navigation/app-bottom-navigation";
import { Button } from "@/components/ui/button";
import { OPEN_SHARE_SETTINGS_EVENT } from "@/features/sharing/events";
import type { ResearchCategory } from "@/features/research/types";
import { countActiveSharePages } from "@/features/trips/actions";
import { researchCategoryHref, tripSectionHref, type TripSection } from "@/features/research/urls";

import { TripBarMenu, type TripMobileQuickAction } from "./trip-app-bar-menu";
import { TripAppBarOverlays } from "./trip-app-bar-overlays";
import type { TripRole } from "@/platform/contracts/trips";

const sections: Array<{ id: TripSection; label: string }> = [
  { id: "plan", label: "Plan" },
  { id: "compare", label: "Ideas" },
];

function TripSectionLinkContent({ Icon, label }: { Icon: typeof Table2; label: string }) {
  const { pending } = useLinkStatus();
  const { t } = useI18n();

  return (
    <>
      {pending ? (
        <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
      ) : (
        <Icon aria-hidden="true" className="size-3.5" />
      )}
      <Localized value={label} />
      {pending ? (
        <span className="sr-only" role="status">
          {t("Opening {label}", { label: t(label) })}
        </span>
      ) : null}
    </>
  );
}

export function TripMobileTabBar({
  active,
  tripId,
  variantId,
  researchCategory,
}: {
  active: TripSection;
  tripId: string;
  variantId: string;
  researchCategory?: ResearchCategory;
}) {
  const items = sections.map((section) => ({
    ...section,
    href:
      section.id === "compare" && active === "plan"
        ? researchCategoryHref(tripId, researchCategory ?? "flight", { variantId, newIdea: true })
        : tripSectionHref(tripId, section.id, variantId, researchCategory),
    Icon: section.id === "plan" ? Table2 : active === "plan" ? Plus : Lightbulb,
    label: section.id === "compare" && active === "plan" ? "Add idea" : section.label,
  }));
  return (
    <AppBottomNavigation
      activeId={active}
      ariaLabel="Trip sections"
      className="trip-mobile-tab-bar z-[70] grid-cols-2 shrink-0 rounded-none border-x-0 border-b-0 pb-[max(0.35rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-1 shadow-none sm:hidden"
      itemClassName="min-h-14 flex-col gap-0.5 px-2 text-sm leading-none"
      items={items}
      documentNavigation
    />
  );
}

export type TripAppBarProps = {
  accountEmail: string;
  canDelete?: boolean;
  actions?: ReactNode;
  active: TripSection;
  guestExperience?: {
    onOpenIdeas: () => void;
    onOpenPlan?: () => void;
    onSaveToAccount: () => void;
    onShare: () => void;
    saveStatus: ReactNode;
  };
  menuItems?: ReactNode;
  mobileMenuItems?: (runAction: (action: () => void) => void) => ReactNode;
  mobileQuickActions?: TripMobileQuickAction[];
  mutating?: boolean;
  onTripSettings?: () => void;
  researchCategory?: ResearchCategory;
  shareControls?: ReactNode;
  title: string;
  tripId: string;
  tripContentVersion?: number;
  tripRole?: TripRole;
  tripVersion?: number;
  variantControls: ReactNode;
  variantId: string;
};

/**
 * One row, three zones: back, the trip identity (title plus active Plan), and the working
 * controls. Everything infrequent is folded into the single trip menu, so no second bar is needed.
 */
export function TripAppBar({
  accountEmail,
  canDelete = true,
  actions,
  active,
  guestExperience,
  menuItems,
  mobileMenuItems,
  mobileQuickActions,
  mutating = false,
  onTripSettings,
  researchCategory,
  shareControls,
  title,
  tripId,
  tripContentVersion = 1,
  tripRole = "owner",
  tripVersion = 1,
  variantControls,
  variantId,
}: TripAppBarProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [sharePageCount, setSharePageCount] = useState<number | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string>();

  function requestTripDelete() {
    setSharePageCount(null);
    setDeleteOpen(true);
    void countActiveSharePages(tripId).then(setSharePageCount, () => setSharePageCount(0));
  }

  return (
    <>
      <header
        aria-busy={deletePending}
        className="trip-app-bar z-[70] shrink-0 border-b bg-background/95 backdrop-blur"
      >
        <div
          className={`trip-app-bar-inner flex h-14 min-w-0 items-center gap-1.5 sm:grid sm:gap-2 ${
            guestExperience
              ? "sm:grid-cols-[minmax(0,1fr)_auto]"
              : "sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
            {guestExperience ? (
              <Button
                aria-label="Back to home"
                className="-ml-1 size-11 shrink-0 p-0"
                data-i18n-aria-label="Back to home"
                onClick={() => window.location.assign("/")}
                variant="ghost"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
              </Button>
            ) : (
              <Button
                aria-label="Back to Trips"
                className="-ml-1 size-11 shrink-0 p-0"
                data-i18n-aria-label="Back to Trips"
                onClick={() => window.location.assign("/trips")}
                variant="ghost"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
              </Button>
            )}
            <div className="min-w-0 flex-1" title={title}>
              <h1 className="sr-only">{title}</h1>
              {variantControls}
            </div>
          </div>

          {guestExperience ? null : (
            <nav
              aria-label="Trip sections"
              data-i18n-aria-label={"Trip sections"}
              className="hidden items-center rounded-lg bg-muted p-1 sm:flex"
            >
              {sections.map((section) => {
                const Icon = section.id === "plan" ? Table2 : Lightbulb;
                return (
                  <Button
                    asChild
                    className="h-9 min-h-9 gap-1.5 px-3 text-sm"
                    key={section.id}
                    size="sm"
                    variant={section.id === active ? "default" : "ghost"}
                  >
                    <Link
                      aria-current={section.id === active ? "page" : undefined}
                      href={tripSectionHref(tripId, section.id, variantId, researchCategory)}
                      onClick={(event) => {
                        if (
                          event.button ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          event.altKey
                        )
                          return;
                        event.preventDefault();
                        window.location.assign(event.currentTarget.href);
                      }}
                      prefetch={false}
                    >
                      <TripSectionLinkContent Icon={Icon} label={section.label} />
                    </Link>
                  </Button>
                );
              })}
            </nav>
          )}

          <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-1 sm:ml-0 sm:gap-1.5">
            {guestExperience ? (
              <>
                <Button
                  aria-label={active === "plan" ? "Ideas & Options" : "Plan"}
                  className="h-11 min-w-11 gap-1.5 px-2 sm:px-3"
                  onClick={
                    active === "plan" ? guestExperience.onOpenIdeas : guestExperience.onOpenPlan
                  }
                  size="sm"
                  variant="outline"
                >
                  {active === "plan" ? (
                    <Lightbulb aria-hidden="true" className="size-4" />
                  ) : (
                    <Table2 aria-hidden="true" className="size-4" />
                  )}
                  <span className="hidden md:inline">
                    <T message={active === "plan" ? "Ideas & Options" : "Plan"} />
                  </span>
                </Button>
                <div className="hidden lg:block">{guestExperience.saveStatus}</div>
                <Button
                  aria-label="Save to account"
                  className="h-11 gap-1.5 px-2.5 sm:px-3"
                  data-i18n-aria-label={"Save to account"}
                  onClick={guestExperience.onSaveToAccount}
                  size="sm"
                >
                  <CloudUpload aria-hidden="true" className="size-4" />
                  <span className="hidden min-[430px]:inline">
                    <T message={"Save to account"} />
                  </span>
                </Button>
              </>
            ) : null}
            {mutating ? (
              <span
                aria-live="polite"
                className="hidden items-center gap-1 text-xs text-muted-foreground lg:flex"
                role="status"
              >
                <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />{" "}
                <T message={" Saving "} />
              </span>
            ) : null}
            {actions}
            <TripBarMenu
              accountEmail={accountEmail}
              deletePending={deletePending}
              extraItems={menuItems}
              mobileMenuItems={mobileMenuItems}
              mobileQuickActions={mobileQuickActions}
              guest={Boolean(guestExperience)}
              historyHref={guestExperience ? undefined : `/trips/${tripId}/history`}
              onDeleteTrip={guestExperience || !canDelete ? undefined : requestTripDelete}
              onInviteTrip={guestExperience ? undefined : () => setPeopleOpen(true)}
              onShareTrip={
                guestExperience
                  ? guestExperience.onShare
                  : shareControls
                    ? () => window.dispatchEvent(new Event(OPEN_SHARE_SETTINGS_EVENT))
                    : undefined
              }
              onTripSettings={onTripSettings}
            />
          </div>
          <div className="contents">{shareControls}</div>
        </div>
      </header>
      <TripAppBarOverlays
        canDelete={canDelete}
        deleteNotice={deleteNotice}
        deleteOpen={deleteOpen}
        deletePending={deletePending}
        guest={Boolean(guestExperience)}
        onDeleteNoticeChange={setDeleteNotice}
        onDeleteOpenChange={setDeleteOpen}
        onDeletePendingChange={setDeletePending}
        onPeopleOpenChange={setPeopleOpen}
        peopleOpen={peopleOpen}
        sharePageCount={sharePageCount}
        title={title}
        tripContentVersion={tripContentVersion}
        tripId={tripId}
        tripRole={tripRole}
        tripVersion={tripVersion}
      />
    </>
  );
}
