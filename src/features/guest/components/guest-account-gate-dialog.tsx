"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Localized, T } from "@/features/i18n/i18n-provider";

import type { GuestSaveState } from "../use-guest-draft";

export type GuestGateAction = "attachment" | "route" | "save" | "share";

export function GuestAccountGateDialog({
  action,
  authenticated,
  onContinue,
  onOpenChange,
  saveState,
}: {
  action?: GuestGateAction;
  authenticated: boolean;
  onContinue: () => void;
  onOpenChange: (open: boolean) => void;
  saveState: GuestSaveState;
}) {
  const cannotPersist = ["conflict", "error", "unavailable"].includes(saveState.code);
  const title =
    action === "share"
      ? "Save this trip before sharing"
      : action === "attachment"
        ? "Save this trip before adding files"
        : action === "route"
          ? "Save this trip before calculating routes"
          : "Save this trip to your account";
  return (
    <AlertDialog onOpenChange={onOpenChange} open={Boolean(action)}>
      <AlertDialogContent className="max-w-lg overflow-x-hidden">
        <AlertDialogHeader>
          <AlertDialogTitle>
            <T message={title} />
          </AlertDialogTitle>
          <AlertDialogDescription>
            <T
              message={
                authenticated
                  ? "Save this local trip to your account without changing your existing trips."
                  : cannotPersist
                    ? "This browser cannot save your local plan. If you leave now, the current plan may be lost. Sign in to create a cloud trip."
                    : "Your local itinerary will stay on this device while you sign in. After sign-in, you can save it to your account without starting over."
              }
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        {saveState.message ? (
          <p
            className="break-words rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            <Localized value={saveState.message} />
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>
            <T message={"Keep planning"} />
          </AlertDialogCancel>
          <AlertDialogAction onClick={onContinue}>
            <T
              message={
                authenticated
                  ? "Save to account"
                  : cannotPersist
                    ? "Sign in anyway"
                    : "Continue to sign in"
              }
            />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
