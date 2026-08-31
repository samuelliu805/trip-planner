import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { continueWithGoogle, signup } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";
import { T } from "@/features/i18n/i18n-provider";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { getAuthProvider, getBackendCapabilities } from "@/platform/composition/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translateMessage(locale, "Sign up") };
}

export default async function SignupPage() {
  const user = await getAuthProvider().getCurrentUser();
  if (user) redirect("/trips");
  const capabilities = getBackendCapabilities();

  if (!capabilities.selfRegistration) {
    return (
      <Card className="border-0 bg-transparent shadow-none sm:border sm:bg-card sm:shadow-sm">
        <CardHeader className="space-y-2 px-0 pt-2 sm:px-8 sm:pt-7 sm:text-center">
          <Link className="mb-2 text-2xl font-bold text-primary" href="/">
            <T message={" Trip Planner "} />
          </Link>
          <CardTitle className="text-2xl sm:text-[28px]">
            <T message={"Create your account"} />
          </CardTitle>
          <CardDescription>
            <T message={"Accounts are created by your organization."} />
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-7 sm:px-8">
          <Button asChild className="min-h-11 w-full">
            <Link href="/login">
              <T message={"Log in"} />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <AuthForm
      action={signup}
      alternateHref="/login"
      alternateLead="Already have an account?"
      alternateLabel="Log in"
      description="Start with your first trip in a few minutes."
      heading="Create your account"
      identifier={capabilities.passwordSignInIdentifier}
      mode="signup"
      oauthAction={capabilities.googleOAuth ? continueWithGoogle : undefined}
      submitLabel="Create account"
    />
  );
}
