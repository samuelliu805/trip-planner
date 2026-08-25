"use client";

import { LogOut, UserRound } from "lucide-react";
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
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { updateAccount } from "@/features/account/actions";
import { logout } from "@/features/auth/actions";
import {
  PlannerEditorField,
  PlannerEditorTextField,
} from "@/features/itinerary/components/planner-editor-fields";
import { PlannerEditorForm } from "@/features/itinerary/components/planner-editor-form";
import { PlannerEditorScreen } from "@/features/itinerary/components/planner-editor-screen";
import { tripCurrencyCodes } from "@/features/trips/currencies";

function AccountCurrencyField({ initialCurrency }: { initialCurrency: string }) {
  const [currency, setCurrency] = useState(initialCurrency);

  return (
    <>
      <input name="currency" type="hidden" value={currency} />
      <PlannerEditorField
        description="New trips begin with this currency. Each trip can still use a different one."
        id="account-currency"
        label="Preferred currency"
      >
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
      footer={
        <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-semibold">Session</p>
            <p className="mt-1 text-sm text-muted-foreground">Log out on this device.</p>
          </div>
          <Button
            className="min-h-11 shrink-0"
            formAction={logout}
            formNoValidate
            type="submit"
            variant="outline"
          >
            <LogOut aria-hidden="true" className="size-4" /> Log out
          </Button>
        </div>
      }
      formAction={action}
      header={null}
      onCancel={exit}
      onClose={exit}
      pending={pending}
      pendingLabel="Saving…"
      saveLabel="Save preferences"
    >
      <div className="flex min-w-0 items-start gap-3 border-b pb-4 sm:gap-4 sm:pb-6">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-12 sm:rounded-2xl"
        >
          <UserRound className="size-4 sm:size-5" />
        </span>
        <div className="min-w-0 pt-0.5">
          <SheetTitle
            className="text-lg font-extrabold tracking-tight outline-none sm:text-xl"
            data-account-title=""
            tabIndex={-1}
          >
            Account
          </SheetTitle>
          <SheetDescription className="mt-0.5 max-w-prose text-sm leading-5 sm:mt-1">
            Manage the defaults tied to your sign-in.
          </SheetDescription>
          {state.error ? (
            <p className="mt-2 text-sm font-medium text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
        </div>
      </div>

      <PlannerEditorTextField
        autoComplete="email"
        description="Your email is managed by your sign-in and cannot be changed here."
        id="account-email"
        label="Email"
        name="email"
        readOnly
        value={email}
      />

      <AccountCurrencyField initialCurrency={initialCurrency} key={initialCurrency} />

      <PlannerEditorTextField
        autoComplete="address-level2"
        defaultValue={homeCity}
        description="Optional. Leave this blank if it does not apply."
        id="account-home-city"
        label="Home city"
        maxLength={120}
        name="home_city"
        placeholder="e.g. Seattle"
      />

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
