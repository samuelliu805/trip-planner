"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { changeAccountPassword } from "@/features/account/actions";
import { Localized, T } from "@/features/i18n/i18n-provider";
import { PlannerEditorForm } from "@/features/itinerary/components/planner-editor-form";
import { PlannerEditorHeader } from "@/features/itinerary/components/planner-editor-header";
import { PlannerEditorScreen } from "@/features/itinerary/components/planner-editor-screen";
import { PlannerEditorTextField } from "@/features/itinerary/components/planner-editor-fields";
import { useRouter } from "next/navigation";

export function AccountPasswordEditor({ passwordRecovery }: { passwordRecovery: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(changeAccountPassword, {});
  const [exiting, startExit] = useTransition();
  const exit = useCallback(() => {
    if (!exiting) startExit(() => router.replace("/account"));
  }, [exiting, router]);
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <PlannerEditorScreen editorKind="trip-settings" onOpenChange={(open) => !open && exit()} open>
      <PlannerEditorForm
        compactActions
        formAction={action}
        formRef={formRef}
        header={
          <PlannerEditorHeader
            closeDisabled={pending || exiting}
            description="Use your current password to protect this account change."
            error={state.error}
            onClose={exit}
            title="Change password"
          />
        }
        onCancel={exit}
        onClose={exit}
        pending={pending}
        pendingLabel="Changing…"
        saveLabel="Change password"
      >
        <PlannerEditorTextField
          autoComplete="current-password"
          id="current-password"
          label="Current password"
          name="current_password"
          required
          type="password"
        />
        <PlannerEditorTextField
          autoComplete="new-password"
          description="8–32 characters with letters and numbers"
          id="new-password"
          label="New password"
          maxLength={32}
          minLength={8}
          name="new_password"
          required
          type="password"
        />
        <PlannerEditorTextField
          autoComplete="new-password"
          id="password-confirmation"
          label="Confirm new password"
          maxLength={32}
          minLength={8}
          name="password_confirmation"
          required
          type="password"
        />
        {state.success ? (
          <p className="text-sm font-medium text-primary" role="status">
            <Localized value={state.success} />
          </p>
        ) : null}
        {passwordRecovery ? (
          <Button asChild className="w-fit px-0 underline" variant="ghost">
            <Link href="/forgot-password">
              <T message="Forgot password?" />
            </Link>
          </Button>
        ) : null}
      </PlannerEditorForm>
    </PlannerEditorScreen>
  );
}
