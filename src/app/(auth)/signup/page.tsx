import { redirect } from "next/navigation";

import { signup } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Sign up" };

export default async function SignupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/trips");

  return (
    <AuthForm
      action={signup}
      alternateHref="/login"
      alternateLead="Already have an account?"
      alternateLabel="Log in"
      description="Start with your first trip in a few minutes."
      heading="Create your account"
      mode="signup"
      submitLabel="Create account"
    />
  );
}
