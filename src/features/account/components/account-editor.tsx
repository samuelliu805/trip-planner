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
import {
  PlannerEditorField,
  PlannerEditorTextField,
} from "@/features/itinerary/components/planner-editor-fields";
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
      <PlannerEditorField id="account-currency" label="Preferred currency">
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
  const [homeCity, setHomeCity] = useState(initialHomeCity);
  const [place, setPlace] = useState<PlaceSnapshot | null>(null);

  return (
    <>
      <input name="home_city" type="hidden" value={homeCity} />
      <PlannerEditorField id="account-home-city" label="Home city">
        <PlaceAutocomplete
          ariaLabel="Home city"
          customValueLabel="home city"
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
          placeholder="Search a city"
          showAvailabilityMessage={false}
          value={place}
        />
      </PlannerEditorField>
    </>
  );
}

function AccountForm({
  currency: initialCurrency,
  email,
  homeCity,
}: {
  currency: string;
  email: string;
  homeCity: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateAccount, {});
  const exit = () => router.replace("/trips");

  return (
    <PlannerEditorForm
      cancelLabel="Exit"
      compactActions
      denseFields
      formAction={action}
      header={null}
      onCancel={exit}
      onClose={exit}
      pending={pending}
      pendingLabel="Saving…"
      saveLabel="Save preferences"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <SheetTitle
          className="text-lg font-extrabold tracking-tight outline-none sm:text-xl"
          data-account-title=""
          tabIndex={-1}
        >
          Account
        </SheetTitle>
        <Button
          className="min-h-11 shrink-0 px-2"
          formAction={logout}
          formNoValidate
          type="submit"
          variant="ghost"
        >
          <LogOut aria-hidden="true" className="size-4" /> Log out
        </Button>
      </div>

      {state.error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <PlannerEditorTextField
        autoComplete="email"
        id="account-email"
        label="Email"
        name="email"
        readOnly
        value={email}
      />

      <AccountCurrencyField initialCurrency={initialCurrency} key={initialCurrency} />

      <AccountHomeCityField initialHomeCity={homeCity} key={homeCity} />

      {state.success ? (
        <p className="text-sm font-medium text-primary" role="status">
          {state.success}
        </p>
      ) : null}
    </PlannerEditorForm>
  );
}

export function AccountEditor({
  currency,
  email,
  homeCity,
}: {
  currency: string;
  email: string;
  homeCity: string;
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
      <AccountForm currency={currency} email={email} homeCity={homeCity} />
    </PlannerEditorScreen>
  );
}
