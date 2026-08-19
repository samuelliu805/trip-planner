import type { Metadata, Viewport } from "next";
import { Mali, Nunito } from "next/font/google";

import { QueryProvider } from "@/components/query-provider";
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

// `resizes-content` shrinks the layout viewport with the software keyboard, so the fixed
// workspace shell never gets pushed up behind it on tablets and phones.
export const viewport: Viewport = {
  initialScale: 1,
  interactiveWidget: "resizes-content",
  width: "device-width",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${journalSans.variable} ${journalHand.variable}`}>
        <QueryProvider>
          <TooltipProvider delayDuration={350}>{children}</TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
