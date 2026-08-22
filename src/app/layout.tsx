import type { Metadata, Viewport } from "next";
import { Mali, Nunito } from "next/font/google";

import { QueryProvider } from "@/components/query-provider";
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

/**
 * Scale is pinned. Focusing a field on iPadOS is a zoom-to-fit, not a scroll to reveal, and the
 * page movement we could never undo is the scroll half of that operation — which is why it happened
 * even when the field was already visible. With the scale unable to change there is nothing to fit.
 *
 * `userScalable` is deliberately absent: switching it off would take pinch zoom away from everyone
 * (WCAG 1.4.4), and iOS has ignored it for a user's own pinch since iOS 10 anyway. `width` and
 * `initialScale` restate Next's defaults, which an explicit export replaces.
 */
export const viewport: Viewport = {
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  width: "device-width",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${journalSans.variable} ${journalHand.variable}`}>
        <VisualViewportVars />
        <QueryProvider>
          <TooltipProvider delayDuration={350}>{children}</TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
