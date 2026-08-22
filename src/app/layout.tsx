import type { Metadata } from "next";
import { Mali, Nunito } from "next/font/google";

import { QueryProvider } from "@/components/query-provider";
import { ViewportDebug } from "@/components/viewport-debug";
import { VisualViewportVars } from "@/components/visual-viewport-vars";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getSiteUrl } from "@/features/sharing/site-url";

import "./globals.css";

const journalSans = Nunito({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-journal-sans",
});

const journalHand = Mali({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-journal-hand",
  weight: ["400", "600", "700"],
});

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
      <body className={`${journalSans.variable} ${journalHand.variable}`}>
        <VisualViewportVars />
        <ViewportDebug />
        <QueryProvider>
          <TooltipProvider delayDuration={350}>{children}</TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
