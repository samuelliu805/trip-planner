"use client";

import {
  createContext,
  useContext,
  useState,
  type ComponentProps,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlannerEditorTextField } from "@/features/itinerary/components/planner-editor-fields";

type FieldDraft = {
  key?: string;
  values: { fields: Record<string, unknown> };
  set: (field: "fields", update: SetStateAction<Record<string, unknown>>) => void;
};
const EditorFields = createContext<FieldDraft | null>(null);

export function usePersistentEditorKey(field: string) {
  const draft = useContext(EditorFields);
  return draft?.key ? `${draft.key}:${field}` : undefined;
}

export function PersistentEditorFields({
  draft,
  children,
}: {
  draft: FieldDraft;
  children: ReactNode;
}) {
  return <EditorFields.Provider value={draft}>{children}</EditorFields.Provider>;
}

export function usePersistentEditorState<T>(
  name: string,
  initial: T | (() => T),
): [T, (update: SetStateAction<T>) => void] {
  const draft = useContext(EditorFields);
  const [fallback, setFallback] = useState(initial);
  const recovered = draft?.values.fields[name];
  const compatible =
    recovered !== undefined &&
    (fallback === null ||
      (Array.isArray(fallback) ? Array.isArray(recovered) : typeof recovered === typeof fallback));
  const value = compatible ? (recovered as T) : fallback;
  return [
    value,
    (update) => {
      if (!draft) return setFallback(update);
      draft.set("fields", (fields) => ({
        ...fields,
        [name]:
          typeof update === "function"
            ? (update as (previous: T) => T)(
                Object.hasOwn(fields, name) ? (fields[name] as T) : fallback,
              )
            : update,
      }));
    },
  ];
}

export function PersistentTextField(props: ComponentProps<typeof PlannerEditorTextField>) {
  const [value, set] = usePersistentEditorState(
    props.name ?? props.id,
    String(props.defaultValue ?? ""),
  );
  return (
    <PlannerEditorTextField
      {...props}
      defaultValue={undefined}
      value={props.value ?? value}
      onChange={(event) => {
        if (props.value === undefined) set(event.target.value);
        props.onChange?.(event);
      }}
    />
  );
}

export function PersistentInput(props: ComponentProps<typeof Input>) {
  const [value, set] = usePersistentEditorState(
    props.name ?? props.id ?? "input",
    String(props.defaultValue ?? ""),
  );
  return (
    <Input
      {...props}
      defaultValue={undefined}
      value={props.value ?? value}
      onChange={(event) => {
        if (props.value === undefined) set(event.target.value);
        props.onChange?.(event);
      }}
    />
  );
}

export function PersistentTextarea(props: ComponentProps<typeof Textarea>) {
  const [value, set] = usePersistentEditorState(
    props.name ?? props.id ?? "note",
    String(props.defaultValue ?? ""),
  );
  return (
    <Textarea
      {...props}
      defaultValue={undefined}
      value={props.value ?? value}
      onChange={(event) => {
        if (props.value === undefined) set(event.target.value);
        props.onChange?.(event);
      }}
    />
  );
}
