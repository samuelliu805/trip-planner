"use client";

import { LogOut, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/features/auth/actions";

function accountInitials(email: string) {
  const name =
    email
      .split("@")[0]
      ?.replace(/[^a-z0-9]+/gi, " ")
      .trim() ?? "";
  const parts = name.split(/\s+/).filter(Boolean);
  return (
    (parts.length > 1 ? parts.map((part) => part[0]).join("") : name.slice(0, 2))
      .slice(0, 2)
      .toUpperCase() || "ME"
  );
}

export function TripAccountMenu({ email = "Account" }: { email?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Account menu"
          className="size-11 shrink-0 rounded-full p-0 text-xs font-semibold"
          variant="outline"
        >
          {accountInitials(email)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="min-w-0 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">Signed in as</p>
          <p className="truncate text-sm" title={email}>
            {email}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <UserRound aria-hidden="true" className="size-4" /> Account settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={logout}>
          <DropdownMenuItem asChild>
            <button className="w-full" type="submit">
              <LogOut aria-hidden="true" className="size-4" /> Log out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
