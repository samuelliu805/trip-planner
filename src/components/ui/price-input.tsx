"use client";

import type { ComponentProps } from "react";
import { priceFromExpression } from "@/lib/price-expression";
import { Input } from "./input";

export function PriceInput({
  onBlur,
  onValueChange,
  value,
  ...props
}: Omit<ComponentProps<"input">, "onChange" | "type" | "value"> & {
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <Input
      autoComplete="off"
      inputMode="text"
      maxLength={512}
      spellCheck={false}
      {...props}
      onBlur={(event) => {
        if (value.trim()) onValueChange(String(priceFromExpression(value)));
        onBlur?.(event);
      }}
      onChange={(event) => onValueChange(event.target.value)}
      type="text"
      value={value}
    />
  );
}
