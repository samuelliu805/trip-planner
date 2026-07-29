import { MapPinned, Route, Share2 } from "lucide-react";

const capabilities = [
  { icon: MapPinned, label: "Plan every day in one workspace" },
  { icon: Route, label: "Compare alternative routes" },
  { icon: Share2, label: "Share a clear, read-only itinerary" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-20 lg:px-8">
        <div className="max-w-3xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
            Trip Planner
          </p>
          <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-7xl">
            Your whole trip, beyond the spreadsheet.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
            Organize daily plans, locations, and route alternatives in one calm,
            shareable travel workspace.
          </p>
        </div>

        <ul className="mt-14 grid gap-4 md:grid-cols-3">
          {capabilities.map(({ icon: Icon, label }) => (
            <li
              className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm"
              key={label}
            >
              <Icon aria-hidden="true" className="mb-6 size-5 text-primary" />
              <p className="font-medium leading-6">{label}</p>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-sm text-muted-foreground">
          Project foundation is ready. Account and trip creation arrive in Phase 1.
        </p>
      </section>
    </main>
  );
}
