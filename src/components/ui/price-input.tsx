"use client";

import type { ComponentProps } from "react";
import { parsedPriceExpression } from "@/lib/price-expression";
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
        const parsed = parsedPriceExpression(value);
        if (parsed !== undefined) onValueChange(String(parsed));
        onBlur?.(event);
      }}
      onChange={(event) => onValueChange(event.target.value)}
      type="text"
      value={value}
    />
  );
}
