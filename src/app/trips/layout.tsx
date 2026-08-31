import { T } from "@/features/i18n/i18n-provider";
import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { logout } from "@/features/auth/actions";
import { LanguageSwitcher } from "@/features/i18n/language-switcher";
import { getRequestLocale } from "@/features/i18n/server";
import { AuthenticatedTelemetryIdentity } from "@/lib/telemetry/authenticated-identity";
import { getAuthProvider } from "@/platform/composition/server";

export default async function TripsLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthProvider().getCurrentUser();
  if (!user) redirect("/login");
  const locale = await getRequestLocale();

  return (
    <div className="trips-shell min-h-dvh bg-background">
      <AuthenticatedTelemetryIdentity appUserId={user.id} locale={locale} />
      <header className="trips-global-header sticky top-0 z-[80] border-b bg-card/95 backdrop-blur">
        <div className="flex h-14 w-full items-center justify-between px-4 sm:h-16 lg:px-5">
          <Link className="font-semibold tracking-tight" href="/trips">
            <T message={" Trip Planner "} />
          </Link>
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <LanguageSwitcher />
            <Button asChild className="min-h-11 min-w-0 px-2 sm:px-3" variant="ghost">
              <Link href="/account">
                <UserRound aria-hidden="true" className="size-4 shrink-0" />
                <span className="hidden max-w-64 truncate sm:inline">
                  {user.email ?? String(user.metadata.username ?? "Account")}
                </span>
                <span className="sm:hidden">
                  <T message={"Account"} />
                </span>
              </Link>
            </Button>
            <form action={logout}>
              <input name="surface" type="hidden" value="global_header" />
              <Button
                aria-label="Log out"
                data-i18n-aria-label={"Log out"}
                className="size-11 p-0 sm:w-auto sm:px-3"
                size="sm"
                type="submit"
                variant="ghost"
              >
                <LogOut aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">
                  <T message={"Log out"} />
                </span>
              </Button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
