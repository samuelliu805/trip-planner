"use client";

import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { logout } from "@/features/auth/actions";
import { Localized, T } from "@/features/i18n/i18n-provider";

export function TripMenuAccountActions({
  accountEmail,
  mobile = false,
  onNavigate,
}: {
  accountEmail: string;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const [error, setError] = useState<string>();
  const [pending, startLogout] = useTransition();

  function signOut() {
    startLogout(async () => {
      setError(undefined);
      const formData = new FormData();
      formData.set("surface", "planner_app_bar");
      try {
        await logout(formData);
      } catch {
        setError("Sign-out could not be completed. Please try again.");
      }
    });
  }

  return (
    <>
      <p
        className={`truncate text-xs text-muted-foreground ${mobile ? "px-3 pb-1 pt-2" : "px-2 py-1.5"}`}
        title={accountEmail}
      >
        {accountEmail}
      </p>
      {mobile ? (
        <>
          <Button
            asChild
            className="min-h-11 w-full justify-start px-3 font-normal"
            variant="ghost"
          >
            <Link href="/account" onClick={onNavigate}>
              <UserRound aria-hidden="true" className="size-4" /> <T message="Account" />
            </Link>
          </Button>
          <Button
            className="min-h-11 w-full justify-start px-3 font-normal"
            disabled={pending}
            onClick={signOut}
            type="button"
            variant="ghost"
          >
            <LogOut aria-hidden="true" className="size-4" />
            <T message={pending ? "Logging out…" : "Log out"} />
          </Button>
        </>
      ) : (
        <>
          <DropdownMenuItem asChild>
            <Link href="/account">
              <UserRound aria-hidden="true" className="size-4" /> <T message="Account" />
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={pending}
            onSelect={(event) => {
              event.preventDefault();
              signOut();
            }}
          >
            <LogOut aria-hidden="true" className="size-4" />
            <T message={pending ? "Logging out…" : "Log out"} />
          </DropdownMenuItem>
        </>
      )}
      {error ? (
        <p className={`${mobile ? "px-3" : "px-2"} py-1 text-xs text-destructive`} role="alert">
          <Localized value={error} />
        </p>
      ) : null}
    </>
  );
}
