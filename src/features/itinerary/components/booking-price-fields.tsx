"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { PriceInput } from "@/components/ui/price-input";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import {
  tripCurrencyCodes,
  tripCurrencyCodesForLocale,
  tripCurrencyLabel,
} from "@/features/trips/currencies";

export const commonBookingCurrencies: readonly string[] = tripCurrencyCodes;

export function BookingPriceFields({
  amount,
  amountName,
  currency,
  currencyName,
  defaultCurrency,
  disabled,
  idPrefix,
  onAmountChange,
  onCurrencyChange,
}: {
  amount: string;
  amountName?: string;
  currency: string;
  currencyName?: string;
  defaultCurrency: string;
  disabled?: boolean;
  idPrefix: string;
  onAmountChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
}) {
  const { locale, t } = useI18n();
  const localizedCurrencies = tripCurrencyCodesForLocale(locale);
  const currencies = commonBookingCurrencies.includes(defaultCurrency)
    ? localizedCurrencies
    : [defaultCurrency, ...localizedCurrencies];

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${idPrefix}-amount`}>
          <T message={"Price"} />
        </Label>
        <PriceInput
          className="h-[3.75rem] rounded-xl"
          disabled={disabled}
          id={`${idPrefix}-amount`}
          name={amountName}
          onValueChange={onAmountChange}
          placeholder={t("0.00 or 120 + 30")}
          value={amount}
        />
      </div>
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${idPrefix}-currency`}>
          <T message={"Currency"} />
        </Label>
        <NativeSelect
          className="planner-native-currency-select box-border flex h-[3.75rem] min-h-[3.75rem] w-full min-w-0 max-w-full rounded-xl border border-input bg-background px-3 py-2 text-base shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
          disabled={disabled}
          id={`${idPrefix}-currency`}
          name={currencyName}
          onChange={(event) => onCurrencyChange(event.target.value)}
          value={currency}
        >
          {currencies.map((value) => (
            <option key={value} value={value}>
              {tripCurrencyLabel(value, locale)}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
