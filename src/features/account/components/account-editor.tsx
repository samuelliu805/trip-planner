"use client";

import { KeyRound, LoaderCircle, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SheetTitle } from "@/components/ui/sheet";
import { updateAccount } from "@/features/account/actions";
import { logoutSession } from "@/features/auth/actions";
import type { Locale } from "@/features/i18n/config";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import { LanguageSwitcher } from "@/features/i18n/language-switcher";
import { PlannerEditorField } from "@/features/itinerary/components/planner-editor-fields";
import { PlannerEditorForm } from "@/features/itinerary/components/planner-editor-form";
import { PlannerEditorScreen } from "@/features/itinerary/components/planner-editor-screen";
import { PlaceAutocomplete } from "@/features/places/place-autocomplete";
import { tripCurrencyCodesForLocale, tripCurrencyLabel } from "@/features/trips/currencies";
import type { PlaceSnapshot } from "@/lib/providers/places/types";

function AccountCurrencyField({ initialCurrency }: { initialCurrency: string }) {
  const { locale } = useI18n();
  const [currency, setCurrency] = useState(initialCurrency);

  return (
    <>
      <input name="currency" type="hidden" value={currency} />
      <PlannerEditorField id="account-currency" label={<T message="Preferred currency" />}>
        <Select onValueChange={setCurrency} value={currency}>
          <SelectTrigger className="min-w-0" id="account-currency">
            <SelectValue aria-label={currency}>{currency}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {tripCurrencyCodesForLocale(locale).map((code) => (
              <SelectItem key={code} value={code}>
                {tripCurrencyLabel(code, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PlannerEditorField>
    </>
  );
}

function AccountHomeCityField({ initialHomeCity }: { initialHomeCity: string }) {
  const { t } = useI18n();
  const [homeCity, setHomeCity] = useState(initialHomeCity);
  const [place, setPlace] = useState<PlaceSnapshot | null>(null);

  return (
    <>
      <input name="home_city" type="hidden" value={homeCity} />
      <PlannerEditorField id="account-home-city" label={<T message="Home city" />}>
        <PlaceAutocomplete
          ariaLabel={t("Home city")}
          customValueLabel={t("home city")}
          id="account-home-city"
          includedPrimaryTypes={["locality"]}
          initialOptionsDismissed={Boolean(initialHomeCity)}
          initialQuery={initialHomeCity}
          onChange={(nextPlace) => {
            setPlace(nextPlace);
            setHomeCity(nextPlace?.localityName ?? nextPlace?.displayName ?? "");
          }}
          onCustomValue={(value) => {
            setPlace(null);
            setHomeCity(value);
          }}
          onQueryChange={(value) => {
            setPlace(null);
            setHomeCity(value);
          }}
          placeholder={t("Search a city")}
          showAvailabilityMessage={false}
          value={place}
        />
      </PlannerEditorField>
    </>
  );
}

function AccountLanguageField({ initialLocale }: { initialLocale: Locale }) {
  const [selectedLocale, setSelectedLocale] = useState(initialLocale);

  return (
    <>
      <input name="locale" type="hidden" value={selectedLocale} />
      <PlannerEditorField id="account-language" label={<T message="Preferred language" />}>
        <Select
          onValueChange={(value) => setSelectedLocale(value as Locale)}
          value={selectedLocale}
        >
          <SelectTrigger className="min-w-0" id="account-language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">
              <T message={"English"} />
            </SelectItem>
            <SelectItem value="zh-CN">简体中文</SelectItem>
          </SelectContent>
        </Select>
      </PlannerEditorField>
    </>
  );
}

function AccountForm({
  currency: initialCurrency,
  email,
  exiting,
  homeCity,
  identityLabel,
  locale,
  onExit,
  passwordManagement,
}: {
  currency: string;
  email: string;
  exiting: boolean;
  homeCity: string;
  identityLabel: string;
  locale: Locale;
  onExit: () => void;
  passwordManagement: boolean;
}) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(updateAccount, {});
  const [logoutPending, startLogout] = useTransition();
  const [logoutError, setLogoutError] = useState<string>();

  return (
    <PlannerEditorForm
      cancelLabel={t("Exit")}
      cancelPending={exiting}
      cancelPendingLabel={t("Exiting…")}
      compactActions
      denseFields
      formAction={action}
      header={null}
      onCancel={onExit}
      onClose={onExit}
      pending={pending || logoutPending}
      pendingLabel={logoutPending ? t("Logging out…") : t("Saving…")}
      saveLabel={t("Save preferences")}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <SheetTitle
          className="text-lg font-extrabold tracking-tight outline-none sm:text-xl"
          data-account-title=""
          tabIndex={-1}
        >
          <T message="Account" />
        </SheetTitle>
        <div className="flex shrink-0 items-center gap-1">
          <LanguageSwitcher className="px-2" />
          <Button
            aria-busy={logoutPending}
            className="min-h-11 shrink-0 px-2"
            disabled={pending || logoutPending || exiting}
            onClick={() =>
              startLogout(async () => {
                setLogoutError(undefined);
                const formData = new FormData();
                formData.set("surface", "account");
                const result = await logoutSession(formData);
                if (result.error) {
                  setLogoutError(result.error);
                  return;
                }
                window.location.assign("/login");
              })
            }
            type="button"
            variant="ghost"
          >
            {logoutPending ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <LogOut aria-hidden="true" className="size-4" />
            )}{" "}
            <T message={logoutPending ? "Logging out…" : "Log out"} />
          </Button>
        </div>
      </div>

      {state.error || logoutError ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          <T message={logoutError ?? state.error ?? ""} />
        </p>
      ) : null}

      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium leading-none">
          <T message={identityLabel} />
        </p>
        <p className="min-w-0 break-all py-1 text-sm leading-6 text-muted-foreground">{email}</p>
      </div>

      <AccountCurrencyField initialCurrency={initialCurrency} key={initialCurrency} />

      <AccountHomeCityField initialHomeCity={homeCity} key={homeCity} />

      <AccountLanguageField initialLocale={locale} key={locale} />

      {passwordManagement ? (
        <div className="border-t pt-4">
          <Button asChild className="min-h-11 justify-start" variant="outline">
            <Link href="/account/password">
              <KeyRound aria-hidden="true" className="size-4" />
              <T message="Change password" />
            </Link>
          </Button>
        </div>
      ) : null}

      {state.success ? (
        <p className="text-sm font-medium text-primary" role="status">
          <T message={state.success} />
        </p>
      ) : null}
    </PlannerEditorForm>
  );
}

export function AccountEditor({
  currency,
  email,
  homeCity,
  identityLabel,
  locale,
  passwordManagement,
}: {
  currency: string;
  email: string;
  homeCity: string;
  identityLabel: string;
  locale: Locale;
  passwordManagement: boolean;
}) {
  const router = useRouter();
  const [exiting, startExit] = useTransition();
  useEffect(() => router.prefetch("/trips"), [router]);
  const exit = useCallback(() => {
    if (exiting) return;
    startExit(() => router.replace("/trips"));
  }, [exiting, router]);

  return (
    <PlannerEditorScreen
      editorKind="trip-settings"
      initialFocusSelector="[data-account-title]"
      onOpenChange={(open) => {
        if (!open) exit();
      }}
      open
    >
      <AccountForm
        currency={currency}
        email={email}
        exiting={exiting}
        homeCity={homeCity}
        identityLabel={identityLabel}
        locale={locale}
        onExit={exit}
        passwordManagement={passwordManagement}
      />
    </PlannerEditorScreen>
  );
}
