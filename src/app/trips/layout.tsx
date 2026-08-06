import { LogOut } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { logout } from "@/features/auth/actions";
import { createClient } from "@/lib/supabase/server";

export default async function TripsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="trips-shell min-h-screen bg-background">
      <header className="trips-global-header sticky top-0 z-50 border-b bg-card">
        <div className="flex h-14 w-full items-center justify-between px-4 sm:h-16 lg:px-5">
          <Link className="font-semibold tracking-tight" href="/trips">
            Trip Planner
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-64 truncate text-sm text-muted-foreground sm:block">
              {user.email}
            </span>
            <form action={logout}>
              <Button size="sm" type="submit" variant="ghost">
                <LogOut aria-hidden="true" className="size-4" /> Log out
              </Button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
