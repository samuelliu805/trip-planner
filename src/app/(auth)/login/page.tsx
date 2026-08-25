import { redirect } from "next/navigation";

import { continueWithGoogle, login } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Log in" };

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createClient();
  const [
    { error },
    {
      data: { user },
    },
  ] = await Promise.all([searchParams, supabase.auth.getUser()]);
  if (user) redirect("/trips");

  const errorMessage =
    error === "google"
      ? "Google sign-in could not be completed. Please try again."
      : error === "confirmation"
        ? "The confirmation link is invalid or expired. Please try again."
        : undefined;

  return (
    <AuthForm
      action={login}
      alternateHref="/signup"
      alternateLead="Don’t have an account?"
      alternateLabel="Create account"
      description="Sign in to continue planning your trips."
      errorMessage={errorMessage}
      heading="Welcome back"
      mode="login"
      oauthAction={continueWithGoogle}
      submitLabel="Log in"
    />
  );
}
