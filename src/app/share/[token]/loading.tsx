import { T } from "@/features/i18n/i18n-provider";
export default function PublicShareLoading() {
  return (
    <main aria-busy="true" className="min-h-dvh bg-background" role="status">
      <div className="h-28 animate-pulse border-b bg-muted/50 motion-reduce:animate-none" />
      <div className="grid h-[calc(100dvh-7rem)] grid-cols-1 md:grid-cols-[minmax(0,56fr)_minmax(340px,44fr)]">
        <div className="space-y-3 p-4">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              className="h-20 animate-pulse border bg-muted/30 motion-reduce:animate-none"
              key={index}
            />
          ))}
        </div>
        <div className="hidden animate-pulse border-l bg-muted/50 motion-reduce:animate-none md:block" />
      </div>
      <span className="sr-only">
        <T message={"Loading public itinerary"} />
      </span>
    </main>
  );
}
