import { redirect } from "next/navigation";

import { login } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Log in" };

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/trips");

  return <AuthForm action={login} alternateHref="/signup" alternateLabel="Need an account? Sign up" submitLabel="Log in" />;
}
