import { redirect } from "next/navigation";

import { continueWithGoogle, signup } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";
import { EMAIL_SIGNUP_ENABLED } from "@/features/auth/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Sign up" };

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
      description="Continue with Google to start planning your first trip."
      heading="Create your account"
      mode="signup"
      oauthAction={continueWithGoogle}
      showEmailForm={EMAIL_SIGNUP_ENABLED}
      submitLabel="Create account"
    />
  );
}
