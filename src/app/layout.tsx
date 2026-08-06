import type { Metadata } from "next";

import { QueryProvider } from "@/components/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getSiteUrl } from "@/features/sharing/site-url";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Trip Planner",
    template: "%s | Trip Planner",
  },
  description: "A modern workspace for planning complex trips.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <TooltipProvider delayDuration={350}>{children}</TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
