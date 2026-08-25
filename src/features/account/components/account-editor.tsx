"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

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
import { logout } from "@/features/auth/actions";
import type { Locale } from "@/features/i18n/config";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import { PlannerEditorField } from "@/features/itinerary/components/planner-editor-fields";
import { PlannerEditorForm } from "@/features/itinerary/components/planner-editor-form";
import { PlannerEditorScreen } from "@/features/itinerary/components/planner-editor-screen";
import { PlaceAutocomplete } from "@/features/places/place-autocomplete";
import { tripCurrencyCodes } from "@/features/trips/currencies";
import type { PlaceSnapshot } from "@/lib/providers/places/types";

function AccountCurrencyField({ initialCurrency }: { initialCurrency: string }) {
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
            {tripCurrencyCodes.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
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
  const { locale, setLocale } = useI18n();
  const selectedLocale = locale || initialLocale;

  return (
    <>
      <input name="locale" type="hidden" value={selectedLocale} />
      <PlannerEditorField id="account-language" label={<T message="Preferred language" />}>
        <Select onValueChange={(value) => setLocale(value as Locale, false)} value={selectedLocale}>
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
  homeCity,
  locale,
}: {
  currency: string;
  email: string;
  homeCity: string;
  locale: Locale;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [state, action, pending] = useActionState(updateAccount, {});
  const exit = () => router.replace("/trips");

  return (
    <PlannerEditorForm
      cancelLabel={t("Exit")}
      compactActions
      denseFields
      formAction={action}
      header={null}
      onCancel={exit}
      onClose={exit}
      pending={pending}
      pendingLabel={t("Saving…")}
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
        <Button
          className="min-h-11 shrink-0 px-2"
          formAction={logout}
          formNoValidate
          type="submit"
          variant="ghost"
        >
          <LogOut aria-hidden="true" className="size-4" /> <T message="Log out" />
        </Button>
      </div>

      {state.error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          <T message={state.error} />
        </p>
      ) : null}

      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium leading-none">
          <T message="Email" />
        </p>
        <p className="min-w-0 break-all py-1 text-sm leading-6 text-muted-foreground">{email}</p>
      </div>

      <AccountCurrencyField initialCurrency={initialCurrency} key={initialCurrency} />

      <AccountHomeCityField initialHomeCity={homeCity} key={homeCity} />

      <AccountLanguageField initialLocale={locale} key={locale} />

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
  locale,
}: {
  currency: string;
  email: string;
  homeCity: string;
  locale: Locale;
}) {
  const router = useRouter();
  return (
    <PlannerEditorScreen
      editorKind="trip-settings"
      initialFocusSelector="[data-account-title]"
      onOpenChange={(open) => {
        if (!open) router.replace("/trips");
      }}
      open
    >
      <AccountForm currency={currency} email={email} homeCity={homeCity} locale={locale} />
    </PlannerEditorScreen>
  );
}
