"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Button } from "@/components/ui/button";
import { T, useI18n } from "@/features/i18n/i18n-provider";

const EditorDockContext = createContext<{
  dock: HTMLElement | null;
  setDock: Dispatch<SetStateAction<HTMLDivElement | null>>;
  view: "map" | "editor";
  setView: Dispatch<SetStateAction<"map" | "editor">>;
} | null>(null);
export const usePlannerEditorDock = () => useContext(EditorDockContext);

/** Reuse the existing map column and its divider; no additional workspace column. */
export function PlannerEditorDock({ children }: { children: ReactNode }) {
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const [view, setView] = useState<"map" | "editor">("editor");
  const value = useMemo(() => ({ dock, setDock, view, setView }), [dock, view]);
  return <EditorDockContext.Provider value={value}>{children}</EditorDockContext.Provider>;
}

export function PlannerEditorDockTarget({ children }: { children: ReactNode }) {
  const context = useContext(EditorDockContext);
  const { t } = useI18n();
  if (!context) return children;
  return (
    <div
      className="planner-editor-region flex h-full min-h-0 min-w-0 flex-col"
      data-editor-view={context.view}
    >
      <div className="planner-editor-view-switch shrink-0 border-b bg-background p-1">
        {(["map", "editor"] as const).map((view) => (
          <Button
            key={view}
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t(view === "map" ? "Show map" : "Show editor")}
            aria-pressed={context.view === view}
            onClick={() => context.setView(view)}
          >
            <T message={view === "map" ? "Map" : "Edit"} />
          </Button>
        ))}
      </div>
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="planner-editor-map-surface h-full">{children}</div>
        <div
          className="planner-editor-dock h-full min-h-0 min-w-0"
          data-planner-editor-dock
          ref={(node) => context.setDock(node)}
        />
      </div>
    </div>
  );
}
