"use client";

import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <span className="relative block min-w-0 max-w-full" data-native-select="">
      <select {...props} className={cn(className, "appearance-none pr-12")} />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
        data-native-select-caret=""
      />
    </span>
  );
}
