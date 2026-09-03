import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { T } from "@/features/i18n/i18n-provider";

export function AuthUnavailable({ mode }: { mode: "login" | "signup" }) {
  return (
    <Card className="border-0 bg-transparent shadow-none sm:border sm:bg-card sm:shadow-sm">
      <CardHeader className="space-y-2 px-0 pt-2 sm:px-8 sm:pt-7 sm:text-center">
        <Link className="mb-2 text-2xl font-bold text-primary" href="/">
          <T message={" Trip Planner "} />
        </Link>
        <CardTitle className="text-2xl sm:text-[28px]">
          <T message={mode === "login" ? "Sign-in unavailable" : "Create your account"} />
        </CardTitle>
        <CardDescription>
          <T message={"Authentication is not configured for this deployment."} />
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-7 sm:px-8">
        <Button asChild className="min-h-11 w-full" variant="outline">
          <Link href="/">
            <T message={"Return home"} />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
