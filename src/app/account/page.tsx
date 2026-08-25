import { redirect } from "next/navigation";

import { AccountEditor } from "@/features/account/components/account-editor";
import { inferredHomeCity } from "@/features/account/profile-defaults";
import { PlannerMapProvider } from "@/features/maps/planner-map-provider";
import { defaultTripCurrency } from "@/features/trips/create-defaults";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("default_currency, home_city")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="min-h-dvh bg-muted">
      <PlannerMapProvider>
        <AccountEditor
          currency={profile?.default_currency ?? defaultTripCurrency}
          email={user.email ?? "Email unavailable"}
          homeCity={profile?.home_city ?? inferredHomeCity(user.user_metadata)}
        />
      </PlannerMapProvider>
    </main>
  );
}
