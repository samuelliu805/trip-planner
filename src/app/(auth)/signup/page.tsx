import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { continueWithGoogle, signup } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translateMessage(locale, "Sign up") };
}

export default async function SignupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
      oauthAction={continueWithGoogle}
      submitLabel="Create account"
    />
  );
}
