"use client";

import {
  useCallback,
  type ComponentProps,
  type FormEventHandler,
  type ReactNode,
  type Ref,
} from "react";

import { PlannerEditorPage } from "@/features/itinerary/components/planner-editor-screen";
import { PlannerEditorFormActions } from "@/features/itinerary/components/planner-editor-form-actions";
import { usePlannerEditorKeyboardScroll } from "@/features/itinerary/components/use-planner-editor-keyboard-scroll";

const enterCommitSelector =
  "button,a,textarea,select,[role='button'],[role='combobox'],[contenteditable='true']";

export type PlannerEditorSaveIntent = "save" | "save-and-create-another";

/** The one form, scrolling, keyboard, field, and action frame used by every planner editor. */
export function PlannerEditorForm({
  after,
  alternateSaveLabel,
  backDisabled = false,
  cancelLabel,
  cancelPending = false,
  cancelPendingLabel,
  children,
  compactActions = false,
  denseFields = false,
  fieldsRef,
  footer,
  formAction,
  formRef,
  header,
  hiddenFields,
  nextDisabled = false,
  onBack,
  onCancel,
  onClose,
  onFormChange,
  onNext,
  onSave,
  onScrollNode,
  onSubmitStart,
  pending,
  pendingLabel,
  saveDisabled = false,
  saveLabel,
}: {
  after?: ReactNode;
  alternateSaveLabel?: string;
  backDisabled?: boolean;
  cancelLabel?: string;
  cancelPending?: boolean;
  cancelPendingLabel?: string;
  children: ReactNode;
  compactActions?: boolean;
  denseFields?: boolean;
  fieldsRef?: Ref<HTMLDivElement>;
  footer?: ReactNode;
  formAction?: ComponentProps<"form">["action"];
  formRef?: Ref<HTMLFormElement>;
  header: ReactNode;
  hiddenFields?: ReactNode;
  nextDisabled?: boolean;
  onBack?: () => void;
  onCancel?: () => void;
  onClose: () => void;
  onFormChange?: FormEventHandler<HTMLFormElement>;
  onNext?: () => void;
  onSave?: (intent: PlannerEditorSaveIntent) => void | Promise<void>;
  onScrollNode?: (node: HTMLDivElement | null) => void;
  onSubmitStart?: () => void;
  pending: boolean;
  pendingLabel: string;
  saveDisabled?: boolean;
  saveLabel?: string;
}) {
  const editorScrollRef = usePlannerEditorKeyboardScroll();
  const setEditorScrollNode = useCallback(
    (node: HTMLDivElement | null) => {
      editorScrollRef.current = node;
      onScrollNode?.(node);
    },
    [editorScrollRef, onScrollNode],
  );

  return (
    <form
      action={formAction}
      className="planner-item-form flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-compact-actions={compactActions ? "" : undefined}
      onChange={onFormChange}
      onKeyDown={(event) => {
        if ((event.target as Element).closest("[data-attachment-overlay]")) return;
        if (event.defaultPrevented) return;
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return;
        }
        if (event.key === "Enter") {
          if (event.metaKey || event.ctrlKey) {
            event.preventDefault();
            if (!pending && !cancelPending && !saveDisabled) event.currentTarget.requestSubmit();
            return;
          }
          if ((event.target as Element).closest(enterCommitSelector)) return;
          event.preventDefault();
          return;
        }
        if (!event.altKey) return;
        if (event.key === "ArrowRight" && onNext) {
          event.preventDefault();
          onNext();
        }
        if (event.key === "ArrowLeft" && onBack) {
          event.preventDefault();
          onBack();
        }
      }}
      onSubmit={
        onSave
          ? (event) => {
              event.preventDefault();
              const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
              const intent =
                submitter?.dataset.plannerSaveIntent === "save-and-create-another"
                  ? "save-and-create-another"
                  : "save";
              if (!pending && !cancelPending && !saveDisabled) void onSave(intent);
            }
          : onSubmitStart
            ? () => onSubmitStart()
            : undefined
      }
      ref={formRef}
    >
      {hiddenFields}
      <PlannerEditorPage header={header} scrollRef={setEditorScrollNode}>
        <div className="planner-item-form-content px-5 py-8 sm:px-6 sm:py-10">
          <div className="planner-item-form-card">
            <fieldset
              aria-busy={pending || cancelPending}
              className="min-w-0 border-0 p-0 disabled:pointer-events-none"
              disabled={pending || cancelPending}
            >
              <div
                className={`planner-item-form-fields planner-item-step-fields min-w-0 ${denseFields ? "space-y-5 sm:space-y-6" : compactActions ? "space-y-6 sm:space-y-10" : "space-y-10"}`}
                ref={fieldsRef}
              >
                {children}
              </div>
            </fieldset>
            <PlannerEditorFormActions
              alternateSaveLabel={alternateSaveLabel}
              backDisabled={backDisabled}
              cancelLabel={cancelLabel}
              cancelPending={cancelPending}
              cancelPendingLabel={cancelPendingLabel}
              compactActions={compactActions}
              nextDisabled={nextDisabled}
              onBack={onBack}
              onCancel={onCancel}
              onNext={onNext}
              pending={pending}
              pendingLabel={pendingLabel}
              saveDisabled={saveDisabled}
              saveLabel={saveLabel}
            />
            {footer ? <div className="min-w-0 pt-8">{footer}</div> : null}
          </div>
        </div>
      </PlannerEditorPage>
      {after}
    </form>
  );
}
