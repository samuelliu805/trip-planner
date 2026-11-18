import { Check } from "lucide-react";
import { Localized, T } from "@/features/i18n/i18n-provider";

const scopeLabels: Record<string, string> = {
  "trips:read": "Read trips",
  "trips:write": "Create and edit trips",
  "ideas:read": "Read personal ideas",
  "ideas:write": "Save and edit personal ideas",
  "places:read": "Search places",
};

export type ConnectionGrant = {
  scopes: string[];
  trip_ids: string[];
  all_trips: boolean;
};

export function ConnectionPermissions({ grant }: { grant: ConnectionGrant }) {
  return (
    <div className="min-w-0 space-y-4 text-sm">
      <ul className="grid gap-2">
        {grant.scopes.map((scope) => (
          <li className="flex min-w-0 items-start gap-2" key={scope}>
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="min-w-0 break-words">
              <Localized value={scopeLabels[scope] ?? scope} />
            </span>
          </li>
        ))}
      </ul>
      <div className="space-y-2 border-t pt-3">
        <p className="text-xs font-medium text-muted-foreground">
          <T message="Trip access" />
        </p>
        {grant.all_trips ? (
          <p>
            <T message="All current and future trips I can access" />
          </p>
        ) : (
          <div className="space-y-2">
            <p>
              <T message="Selected trips" /> · {grant.trip_ids.length}
            </p>
            {grant.trip_ids.length > 0 && (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {grant.trip_ids.map((id) => (
                  <li className="break-all font-mono" key={id}>
                    {id}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
