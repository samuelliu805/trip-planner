"use client";

import { useCallback, type ComponentProps, type ReactNode, type Ref } from "react";

import { PlannerEditorPage } from "@/features/itinerary/components/planner-editor-screen";
import { PlannerEditorFormActions } from "@/features/itinerary/components/planner-item-form-actions";
import { usePlannerEditorKeyboardScroll } from "@/features/itinerary/components/use-planner-editor-keyboard-scroll";

const enterCommitSelector =
  "button,a,textarea,select,[role='button'],[role='combobox'],[contenteditable='true']";

/** The one form, scrolling, keyboard, field, and action frame used by every planner editor. */
export function PlannerEditorForm({
  after,
  backDisabled = false,
  children,
  fieldsRef,
  footer,
  formAction,
  header,
  hiddenFields,
  nextDisabled = false,
  onBack,
  onClose,
  onNext,
  onSave,
  onScrollNode,
  pending,
  pendingLabel,
}: {
  after?: ReactNode;
  backDisabled?: boolean;
  children: ReactNode;
  fieldsRef?: Ref<HTMLDivElement>;
  footer?: ReactNode;
  formAction?: ComponentProps<"form">["action"];
  header: ReactNode;
  hiddenFields?: ReactNode;
  nextDisabled?: boolean;
  onBack?: () => void;
  onClose: () => void;
  onNext?: () => void;
  onSave?: () => void | Promise<void>;
  onScrollNode?: (node: HTMLDivElement | null) => void;
  pending: boolean;
  pendingLabel: string;
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
            if (!pending) event.currentTarget.requestSubmit();
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
              if (!pending) void onSave();
            }
          : undefined
      }
    >
      {hiddenFields}
      <PlannerEditorPage header={header} scrollRef={setEditorScrollNode}>
        <div className="planner-item-form-content px-5 py-8 sm:px-6 sm:py-10">
          <div className="planner-item-form-card">
            <div
              className="planner-item-form-fields planner-item-step-fields min-w-0 space-y-10"
              ref={fieldsRef}
            >
              {children}
            </div>
            <PlannerEditorFormActions
              backDisabled={backDisabled}
              nextDisabled={nextDisabled}
              onBack={onBack}
              onNext={onNext}
              pending={pending}
              pendingLabel={pendingLabel}
            />
            {footer ? <div className="min-w-0 pt-8">{footer}</div> : null}
          </div>
        </div>
      </PlannerEditorPage>
      {after}
    </form>
  );
}
