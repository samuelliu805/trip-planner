import { redirect } from "next/navigation";

import { login } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Log in" };

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/trips");

  return (
    <AuthForm
      action={login}
      alternateHref="/signup"
      alternateLead="Don’t have an account?"
      alternateLabel="Create account"
      description="Sign in to continue planning your trips."
      heading="Welcome back"
      mode="login"
      submitLabel="Log in"
    />
  );
}
