import { ChartNoAxesCombined, MapPinned, Users } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const capabilities = [
  {
    description: "Visualize locations and transit routes as your itinerary evolves.",
    icon: MapPinned,
    label: "Real-time mapping",
  },
  {
    description: "Coordinate plans with co-travelers in one structured workspace.",
    icon: Users,
    label: "Shared blueprints",
  },
  {
    description: "Connect bookings, reservations, and timings into a cohesive timeline.",
    icon: ChartNoAxesCombined,
    label: "Data-driven itinerary",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav className="border-b bg-background/95" aria-label="Primary navigation">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link className="text-xl font-bold text-primary sm:text-2xl" href="/">
            Trip Planner
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button asChild className="min-h-11 px-3" variant="ghost">
              <Link href="/signup">Sign up</Link>
            </Button>
            <Button asChild className="min-h-11 px-3 sm:px-4">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </nav>

      <section
        className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-12 overflow-hidden px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-20"
        id="overview"
      >
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />
        <div className="max-w-2xl">
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Your whole trip, beyond the spreadsheet.
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            A structured, reliable blueprint for complex itineraries. Architect your journey with
            precision and keep every plan in one calm workspace.
          </p>
          <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row">
            <Button asChild className="min-h-12 px-6 text-base">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild className="min-h-12 px-6 text-base" variant="outline">
              <Link href="/signup">Sign up</Link>
            </Button>
          </div>
        </div>

        <ul className="grid gap-4" id="features">
          {capabilities.map(({ description, icon: Icon, label }) => (
            <li className="flex gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5" key={label}>
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                <Icon aria-hidden="true" className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{label}</h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
