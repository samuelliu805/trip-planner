"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const commonBookingCurrencies = ["USD", "EUR", "JPY", "GBP", "CAD", "AUD", "CNY", "KRW"];

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
  const currencies = commonBookingCurrencies.includes(defaultCurrency)
    ? commonBookingCurrencies
    : [defaultCurrency, ...commonBookingCurrencies];

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_7rem] gap-5">
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${idPrefix}-amount`}>Price</Label>
        <Input
          disabled={disabled}
          id={`${idPrefix}-amount`}
          inputMode="decimal"
          min="0"
          name={amountName}
          onChange={(event) => onAmountChange(event.target.value)}
          placeholder="0.00"
          step="0.01"
          type="number"
          value={amount}
        />
      </div>
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${idPrefix}-currency`}>Currency</Label>
        <select
          className="planner-native-currency-select box-border flex h-[3.75rem] min-h-[3.75rem] w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
          disabled={disabled}
          id={`${idPrefix}-currency`}
          name={currencyName}
          onChange={(event) => onCurrencyChange(event.target.value)}
          value={currency}
        >
          {currencies.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
