"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
function TooltipContent({ className, sideOffset = 5, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return <TooltipPrimitive.Portal><TooltipPrimitive.Content className={cn("z-[70] rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md", className)} sideOffset={sideOffset} {...props} /></TooltipPrimitive.Portal>;
}
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
