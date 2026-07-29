import { redirect } from "next/navigation";

import { signup } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Sign up" };

export default async function SignupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/trips");

  return <AuthForm action={signup} alternateHref="/login" alternateLabel="Already have an account? Log in" submitLabel="Create account" />;
}
