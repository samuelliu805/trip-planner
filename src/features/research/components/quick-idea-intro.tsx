import { T } from "@/features/i18n/i18n-provider";

export function QuickIdeaIntro() {
  return (
    <div className="min-w-0 lg:pt-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary">
        <T message="Save first, decide later" />
      </p>
      <h2 className="mt-1 text-lg font-semibold">
        <T message="Put something you want to keep here" />
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        <T message="Paste a link or write one sentence. This saves it; it does not search the web." />
      </p>
    </div>
  );
}
