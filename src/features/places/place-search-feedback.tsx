import { LoaderCircle } from "lucide-react";
import { T, useI18n } from "../i18n/i18n-provider";

export function PlaceSearchFeedback({
  resolving,
  availability,
  error,
}: {
  resolving: boolean;
  availability?: string;
  error?: string;
}) {
  const { t } = useI18n();
  return (
    <>
      {resolving ? (
        <p
          aria-live="polite"
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
          role="status"
        >
          <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
          <T message={" Loading place details… "} />
        </p>
      ) : null}
      {availability ? <p className="mt-1 text-sm text-muted-foreground">{availability}</p> : null}
      {error ? (
        <p className="mt-1 text-sm text-destructive" role="alert">
          {t(error)}
        </p>
      ) : null}
    </>
  );
}
