"use client";

import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ArrowLeft, CalendarDays, Check, ChevronDown, ClipboardPaste, Copy, MapPinned, Maximize2, MoreHorizontal, Plus, Route, Settings2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PlannerItemForm } from "@/features/itinerary/components/planner-item-form";
import { encodePlannerClipboard, fillTargetRows, moveGridFocus, parsePlannerClipboard, selectionBounds, selectionContains, type GridCoordinate, type PlannerClipboard } from "@/features/itinerary/grid-interactions";
import { plannerQueryKey, useCopyItineraryItems, useDeleteItineraryItem, usePlannerWorkspace, useReorderItineraryItems } from "@/features/itinerary/queries";
import type { ItineraryItem, ItineraryItemType, PlannerDay, PlannerWorkspace as PlannerWorkspaceData } from "@/features/itinerary/types";
import type { Tables } from "@/types/database";

type Category = "city" | "activities" | "transport" | "hotel" | "car_rental" | "meals" | "notes";
type EditorState = { dayId: string; item?: ItineraryItem; type: ItineraryItemType };

const categories: { id: Category; label: string; types: ItineraryItemType[]; defaultType: ItineraryItemType; width: string }[] = [
  { id: "city", label: "City", types: ["location"], defaultType: "location", width: "w-36" },
  { id: "activities", label: "Activities", types: ["activity"], defaultType: "activity", width: "w-52" },
  { id: "transport", label: "Transport", types: ["transport", "flight", "train"], defaultType: "transport", width: "w-44" },
  { id: "hotel", label: "Hotel", types: ["hotel"], defaultType: "hotel", width: "w-44" },
  { id: "car_rental", label: "Car rental", types: ["car_rental"], defaultType: "car_rental", width: "w-44" },
  { id: "meals", label: "Meals", types: ["meal"], defaultType: "meal", width: "w-44" },
  { id: "notes", label: "Notes", types: ["note"], defaultType: "note", width: "w-52" },
];
function timeLabel(time: string | null) { return time ? time.slice(0, 5) : null; }

function AddItemPopover({ category, day, onComplex }: { category: (typeof categories)[number]; day: PlannerDay; onComplex: () => void; tripId: string; variantId: string }) {
  return <button aria-label={`Add ${category.label.toLowerCase()} on day ${day.day_number}`} className="mt-1 hidden h-11 w-full items-center justify-center gap-1.5 rounded border border-dashed bg-background text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-add-item onClick={(event) => { event.stopPropagation(); onComplex(); }} type="button"><Plus className="size-3.5" />Add {category.label.toLowerCase()}</button>;
}

function ItemRow({ canMoveDown, canMoveUp, item, onEdit, onMove }: { canMoveDown: boolean; canMoveUp: boolean; item: ItineraryItem; onEdit: (item: ItineraryItem) => void; onMove: (direction: -1 | 1) => void }) {
  const start = timeLabel(item.start_time);
  return <div className="group/item flex min-w-0 items-center rounded hover:bg-muted/70"><button className="min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-edit-item={item.id} onClick={(event) => { if (event.detail >= 2) { event.stopPropagation(); onEdit(item); } }} onDoubleClick={(event) => { event.stopPropagation(); onEdit(item); }} onKeyDown={(event) => { if (event.altKey && event.key === "ArrowUp" && canMoveUp) { event.preventDefault(); event.stopPropagation(); onMove(-1); } if (event.altKey && event.key === "ArrowDown" && canMoveDown) { event.preventDefault(); event.stopPropagation(); onMove(1); } }} type="button">{start ? <span className="mr-1 font-mono text-[10px] text-muted-foreground">{start}</span> : null}<span className="font-medium">{item.title}</span></button><DropdownMenu><DropdownMenuTrigger asChild><button aria-label={`Actions for ${item.title}`} className="flex size-7 shrink-0 items-center justify-center rounded opacity-0 hover:bg-background focus:opacity-100 group-hover/item:opacity-100" onClick={(event) => event.stopPropagation()} type="button"><MoreHorizontal className="size-3.5" /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onEdit(item)}>Edit item</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMove(-1)}>Move up <span className="ml-auto text-xs text-muted-foreground">Alt+↑</span></DropdownMenuItem><DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMove(1)}>Move down <span className="ml-auto text-xs text-muted-foreground">Alt+↓</span></DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>;
}

function MapShell({ compact = false, onExpand }: { compact?: boolean; onExpand?: () => void }) {
  return <section aria-label="Map preview" className="relative h-full min-w-0 overflow-hidden bg-muted/40"><div className="absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:42px_42px]" /><div className="absolute left-4 top-3 rounded-md border bg-background/90 px-2.5 py-1 text-[10px] font-medium shadow-sm">Map preview · P3</div>{onExpand ? <button aria-label="Expand map preview" className="absolute right-2 top-2 z-20 flex size-11 items-center justify-center rounded-md border bg-background/90 shadow-sm" onClick={onExpand} type="button"><Maximize2 className="size-4" /></button> : null}<div className={`absolute inset-0 flex items-center justify-center ${compact ? "px-16" : "p-8"}`}><div className={`${compact ? "border-0 bg-transparent p-0 shadow-none" : "max-w-sm rounded-xl border bg-background/95 p-6 text-center shadow-lg"}`}><span className={`${compact ? "hidden" : "mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary"}`}><MapPinned className="size-5" /></span><h2 className={`${compact ? "truncate text-center text-xs" : "mt-4 font-semibold"}`}>Map and Places activate in Phase 3</h2>{compact ? null : <p className="mt-2 text-sm leading-6 text-muted-foreground">No Google scripts or provider requests are loaded during Phase 2.</p>}</div></div></section>;
}

export function PlannerWorkspace({ deleteError, initialWorkspace, settings, trip }: { deleteError: boolean; initialWorkspace: PlannerWorkspaceData; settings: React.ReactNode; trip: Tables<"trips"> }) {
  const queryClient = useQueryClient();
  const { data: workspace = initialWorkspace } = usePlannerWorkspace(trip.id, initialWorkspace);
  const copyMutation = useCopyItineraryItems(trip.id);
  const deleteMutation = useDeleteItineraryItem(trip.id);
  const reorderMutation = useReorderItineraryItems(trip.id);
  const [split, setSplit] = useState(58);
  const [selectionAnchor, setSelectionAnchor] = useState<GridCoordinate>({ row: 0, column: 0 });
  const [selectionEnd, commitSelectionEnd] = useState<GridCoordinate>({ row: 0, column: 0 });
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copyDaysOpen, setCopyDaysOpen] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [targetDays, setTargetDays] = useState<Set<string>>(new Set());
  const [interactionError, setInteractionError] = useState<string>();
  const [internalClipboard, setInternalClipboard] = useState<PlannerClipboard | null>(null);
  const [isFillDragging, setIsFillDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionEndRef = useRef(selectionEnd);
  const fillDragging = useRef(false);
  const fillFrame = useRef<number | null>(null);
  const rangeJustSelected = useRef(false);
  useEffect(() => { selectionEndRef.current = selectionEnd; }, [selectionEnd]);
  const mutating = useIsMutating() > 0;
  const selectedCount = selectionEnd.row < 0 ? 0 : (Math.abs(selectionAnchor.row - selectionEnd.row) + 1) * (Math.abs(selectionAnchor.column - selectionEnd.column) + 1);
  const dateRange = `${format(parseISO(trip.start_date), "MMM d")} – ${format(parseISO(trip.end_date), "MMM d, yyyy")}`;
  const gridTemplate = useMemo(() => `minmax(520px, ${split}fr) 4px minmax(360px, ${100 - split}fr)`, [split]);

  function setSelectionEnd(coordinate: GridCoordinate) {
    selectionEndRef.current = coordinate;
    if (!fillDragging.current) { commitSelectionEnd(coordinate); return; }
    if (fillFrame.current !== null) return;
    fillFrame.current = requestAnimationFrame(() => {
      fillFrame.current = null;
      commitSelectionEnd(selectionEndRef.current);
    });
  }

  function clipboardPayload(): PlannerClipboard | null {
    const bounds = selectionBounds(selectionAnchor, selectionEnd);
    const cells = [];
    for (let row = bounds.top; row <= bounds.bottom; row += 1) for (let column = bounds.left; column <= bounds.right; column += 1) {
      const day = workspace.days[row];
      const category = categories[column];
      if (!day || !category) continue;
      const items = day.items.filter((item) => category.types.includes(item.type)).map(({ id }) => id);
      cells.push({ columnOffset: column - bounds.left, items, rowOffset: row - bounds.top });
    }
    return cells.length ? { cells, kind: "trip-planner/items", version: 1 } : null;
  }

  async function copySelectionToClipboard() {
    const payload = clipboardPayload();
    if (!payload) { setInteractionError("The selected cells do not contain items to copy."); return; }
    setInternalClipboard(payload); setInteractionError(undefined);
    try { await navigator.clipboard.writeText(encodePlannerClipboard(payload)); } catch { /* The internal clipboard remains available. */ }
  }

  async function replaceCategoryItems(operations: { sourceItemIds: string[]; targetDay: PlannerDay; types: ItineraryItemType[] }[]) {
    const previous = queryClient.getQueryData<PlannerWorkspaceData>(plannerQueryKey(trip.id));
    const replacements = operations.map((operation) => ({
      ...operation,
      replacedItems: operation.targetDay.items.filter((item) => operation.types.includes(item.type)),
    }));
    try {
      const copyPromises = replacements.filter(({ sourceItemIds }) => sourceItemIds.length > 0).map(({ sourceItemIds, targetDay }) => copyMutation.mutateAsync({ sourceItemIds, targetDayId: targetDay.id, tripId: trip.id }));
      const replacedIds = new Set(replacements.flatMap(({ replacedItems }) => replacedItems.map(({ id }) => id)));
      queryClient.setQueryData<PlannerWorkspaceData>(plannerQueryKey(trip.id), (current) => current ? { ...current, days: current.days.map((day) => ({ ...day, items: day.items.filter(({ id }) => !replacedIds.has(id)) })) } : current);
      await Promise.all(copyPromises);
      await Promise.all(replacements.flatMap(({ replacedItems }) => replacedItems.map((item) => deleteMutation.mutateAsync({ id: item.id, tripId: trip.id }))));
      setInteractionError(undefined);
    } catch (error) {
      queryClient.setQueryData(plannerQueryKey(trip.id), previous);
      void queryClient.invalidateQueries({ queryKey: plannerQueryKey(trip.id) });
      setInteractionError(error instanceof Error ? `${error.message} Refreshing the planner to confirm saved values.` : "The destination cells could not be replaced.");
    }
  }

  async function pastePayload(payload: PlannerClipboard, target = selectionEnd) {
    try {
      const operations = payload.cells.map((cell) => {
        const category = categories[target.column + cell.columnOffset];
        if (!category) throw new Error("Clipboard data does not fit the selected range.");
        const day = workspace.days[target.row + cell.rowOffset];
        if (!day) throw new Error("Clipboard data does not fit the available trip days.");
        return { sourceItemIds: cell.items, targetDay: day, types: category.types };
      });
      await replaceCategoryItems(operations);
    } catch (error) {
      setInteractionError(error instanceof Error ? error.message : "The copied items could not be pasted.");
    }
  }

  async function pasteAvailableClipboard() {
    let payload = internalClipboard;
    if (!payload) try { payload = parsePlannerClipboard(await navigator.clipboard.readText()); } catch { /* System clipboard access is optional. */ }
    if (payload) await pastePayload(payload);
    else setInteractionError("Copy planner cells before pasting.");
  }

  async function fillDown(anchor = selectionAnchor, end = selectionEndRef.current) {
    const bounds = selectionBounds(anchor, end);
    const sourceDay = workspace.days[bounds.top];
    if (!sourceDay || bounds.bottom === bounds.top) { setInteractionError("Select at least two day rows to fill down."); return; }
    const selectedCategories = categories.slice(bounds.left, bounds.right + 1);
    await replaceCategoryItems(fillTargetRows(anchor, end).flatMap((row) => selectedCategories.map((category) => ({
      sourceItemIds: sourceDay.items.filter((item) => category.types.includes(item.type)).map(({ id }) => id),
      targetDay: workspace.days[row],
      types: category.types,
    }))));
  }

  async function copyPreviousDay() {
    const bounds = selectionBounds(selectionAnchor, selectionEnd);
    if (bounds.top < 1) { setInteractionError("The first day has no previous day to copy."); return; }
    const source = workspace.days[bounds.top - 1];
    const target = workspace.days[bounds.top];
    await replaceCategoryItems(categories.slice(bounds.left, bounds.right + 1).map((category) => ({
      sourceItemIds: source.items.filter((item) => category.types.includes(item.type)).map(({ id }) => id),
      targetDay: target,
      types: category.types,
    })));
  }

  async function copyToSelectedDays() {
    if (!targetDays.size) { setInteractionError("Choose at least one destination day."); return; }
    const bounds = selectionBounds(selectionAnchor, selectionEnd);
    const sourceDay = workspace.days[bounds.top];
    if (!sourceDay) return;
    const selectedCategories = categories.slice(bounds.left, bounds.right + 1);
    await replaceCategoryItems([...targetDays].flatMap((dayId) => {
      const targetDay = workspace.days.find((day) => day.id === dayId);
      return targetDay ? selectedCategories.map((category) => ({
        sourceItemIds: sourceDay.items.filter((item) => category.types.includes(item.type)).map(({ id }) => id),
        targetDay,
        types: category.types,
      })) : [];
    }));
    setTargetDays(new Set()); setCopyDaysOpen(false);
  }

  async function moveItem(day: PlannerDay, categoryItems: ItineraryItem[], itemIndex: number, direction: -1 | 1) {
    const targetIndex = itemIndex + direction;
    if (targetIndex < 0 || targetIndex >= categoryItems.length) return;
    const reorderedCategory = [...categoryItems];
    [reorderedCategory[itemIndex], reorderedCategory[targetIndex]] = [reorderedCategory[targetIndex], reorderedCategory[itemIndex]];
    let categoryIndex = 0;
    const ordered = [...day.items].sort((a, b) => a.sort_order - b.sort_order).map((item) => categoryItems.some(({ id }) => id === item.id) ? reorderedCategory[categoryIndex++] : item);
    try { await reorderMutation.mutateAsync({ dayId: day.id, items: ordered.map((item, sortOrder) => ({ id: item.id, sortOrder })), tripId: trip.id }); setInteractionError(undefined); }
    catch { setInteractionError("The item order could not be saved. The previous order was restored."); }
  }

  function focusCell(coordinate: GridCoordinate, extend: boolean) {
    if (rangeJustSelected.current) { rangeJustSelected.current = false; return; }
    if (extend) setSelectionEnd(coordinate); else { setSelectionAnchor(coordinate); setSelectionEnd(coordinate); }
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-cell="${coordinate.row}-${coordinate.column}"]`)?.focus());
  }

  function startRangeSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (window.innerWidth < 1200) return;
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, input, textarea, [role='menuitem'], [role='option']")) return;
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!cell?.dataset.cell) return;
    const [row, column] = cell.dataset.cell.split("-").map(Number);
    const anchor = { column, row };
    let moved = false;
    setSelectionAnchor(anchor); setSelectionEnd(anchor);
    const move = (moveEvent: PointerEvent) => {
      const targetCell = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest<HTMLElement>("[data-cell]");
      if (!targetCell?.dataset.cell) return;
      const [nextRow, nextColumn] = targetCell.dataset.cell.split("-").map(Number);
      if (nextRow === row && nextColumn === column) return;
      moved = true;
      setSelectionEnd({ column: nextColumn, row: nextRow });
    };
    const stop = () => {
      rangeJustSelected.current = moved;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function handleCellKey(event: React.KeyboardEvent, coordinate: GridCoordinate, day: PlannerDay, category: (typeof categories)[number], items: ItineraryItem[]) {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(event.key)) { event.preventDefault(); focusCell(moveGridFocus(coordinate, event.key, workspace.days.length, categories.length, event.shiftKey), event.shiftKey && event.key !== "Tab"); return; }
    if (event.key === "Enter") { event.preventDefault(); const item = items[0]; setEditor(item ? { dayId: day.id, item, type: item.type } : { dayId: day.id, type: category.defaultType }); }
    if (event.key === "Escape") { setEditor(null); focusCell(coordinate, false); }
  }

  function startFill(event: React.PointerEvent, coordinate: GridCoordinate) {
    if (window.innerWidth < 1200) return;
    event.preventDefault(); event.stopPropagation(); fillDragging.current = true; setIsFillDragging(true); setSelectionAnchor(coordinate); setSelectionEnd(coordinate);
    const finish = () => {
      const fillEnd = selectionEndRef.current;
      fillDragging.current = false; setIsFillDragging(false);
      if (fillFrame.current !== null) cancelAnimationFrame(fillFrame.current);
      fillFrame.current = null;
      window.removeEventListener("pointerup", finish);
      setSelectionAnchor({ column: -1, row: -1 }); setSelectionEnd({ column: -1, row: -1 });
      void fillDown(coordinate, fillEnd);
    };
    window.addEventListener("pointerup", finish);
  }

  function openEditorFromDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button") && !target.closest("[data-edit-item]")) return;
    const cell = target.closest<HTMLElement>("[data-cell]");
    if (!cell?.dataset.cell) return;
    const [row, column] = cell.dataset.cell.split("-").map(Number);
    const day = workspace.days[row];
    const category = categories[column];
    if (!day || !category) return;
    const requestedId = target.closest<HTMLElement>("[data-edit-item]")?.dataset.editItem;
    const item = requestedId ? day.items.find(({ id }) => id === requestedId) : day.items.find((candidate) => category.types.includes(candidate.type));
    setEditor(item ? { dayId: day.id, item, type: item.type } : { dayId: day.id, type: category.defaultType });
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => { const bounds = containerRef.current?.getBoundingClientRect(); if (bounds) setSplit(Math.min(68, Math.max(45, ((moveEvent.clientX - bounds.left) / bounds.width) * 100))); };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  }

  return <div className="planner-workspace flex h-full min-h-0 flex-col overflow-hidden bg-background" onCopy={(event) => { const payload = clipboardPayload(); if (payload) { event.preventDefault(); event.clipboardData.setData("text/plain", encodePlannerClipboard(payload)); setInternalClipboard(payload); setInteractionError(undefined); } }} onPaste={(event) => { const payload = parsePlannerClipboard(event.clipboardData.getData("text/plain")) ?? internalClipboard; if (!payload) { setInteractionError("Unsupported clipboard data. Copy cells from this planner before pasting."); return; } event.preventDefault(); void pastePayload(payload); }}>
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-2 sm:px-4 xl:h-[72px] xl:gap-4 xl:px-5"><div className="flex min-w-0 items-center gap-1 sm:gap-2 xl:gap-3"><Tooltip><TooltipTrigger asChild><Button asChild className="size-11 p-0 xl:size-9" variant="ghost"><Link aria-label="Back to Trips" href="/trips"><ArrowLeft className="size-4" /></Link></Button></TooltipTrigger><TooltipContent>Back to Trips</TooltipContent></Tooltip><div className="min-w-0"><h1 className="max-w-[180px] truncate text-base font-semibold sm:max-w-[260px] xl:max-w-none xl:text-lg">{trip.title}</h1><p className="mt-0.5 hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex"><CalendarDays className="size-3.5" />{dateRange}</p></div></div><div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground sm:gap-2"><span className="flex items-center gap-1.5 whitespace-nowrap" aria-live="polite">{mutating ? <span className="size-2 animate-pulse rounded-full bg-amber-500" /> : <Check className="size-3.5 text-primary" />}<span className="hidden sm:inline">{mutating ? "Saving…" : "Saved"}</span></span><Button className="hidden h-11 gap-1.5 px-3 text-xs sm:flex xl:h-9" disabled variant="outline"><Route className="size-3.5" />Route A <span className="text-[9px] text-muted-foreground">P4</span></Button><DropdownMenu><DropdownMenuTrigger asChild><Button aria-label="More trip actions" className="size-11 p-0 xl:size-9" variant="outline"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className="xl:hidden" onSelect={copySelectionToClipboard}><Copy className="size-4" />Copy selected cells</DropdownMenuItem><DropdownMenuItem className="xl:hidden" onSelect={pasteAvailableClipboard}><ClipboardPaste className="size-4" />Paste</DropdownMenuItem><DropdownMenuItem className="xl:hidden" onSelect={() => setCopyDaysOpen(true)}>Copy to days…</DropdownMenuItem><DropdownMenuItem className="xl:hidden" onSelect={copyPreviousDay}>Copy previous day</DropdownMenuItem><DropdownMenuSeparator className="xl:hidden" /><DropdownMenuItem onSelect={() => setSettingsOpen(true)}><Settings2 className="size-4" />Trip settings</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled><Route className="size-4" />Route variants <span className="ml-auto text-[10px]">P4</span></DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></header>
    <div className="hidden h-10 shrink-0 items-center justify-between gap-3 border-b bg-muted/20 px-3 xl:flex">
      <div className="flex items-center gap-1 whitespace-nowrap"><Button className="h-7 px-2.5 text-xs" onClick={() => { const day = workspace.days[selectionEnd.row]; const category = categories[selectionEnd.column]; if (day) setEditor({ dayId: day.id, type: category.defaultType }); }} size="sm"><Plus className="size-3.5" />Add item</Button><Button className="h-7 px-2 text-xs" onClick={copySelectionToClipboard} size="sm" variant="ghost"><Copy className="size-3.5" />Copy</Button><DropdownMenu><DropdownMenuTrigger asChild><Button aria-label="More editing actions" className="size-7 p-0" size="sm" variant="ghost"><ChevronDown className="size-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onSelect={() => setCopyDaysOpen(true)}>Copy to days…</DropdownMenuItem><DropdownMenuItem onSelect={copyPreviousDay}>Copy previous day</DropdownMenuItem><DropdownMenuItem onSelect={pasteAvailableClipboard}><ClipboardPaste className="size-4" />Paste</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
      <span className="shrink-0 text-[11px] text-muted-foreground">Selected: {selectedCount} {selectedCount === 1 ? "cell" : "cells"}</span>
    </div>
    {interactionError ? <div className="flex items-center justify-between border-b bg-destructive/10 px-4 py-1.5 text-xs text-destructive" role="alert"><span>{interactionError}</span><button className="underline" onClick={() => setInteractionError(undefined)} type="button">Dismiss</button></div> : null}{deleteError ? <p className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">The trip could not be deleted.</p> : null}
    {isFillDragging ? <div className="pointer-events-none fixed left-1/2 top-28 z-50 -translate-x-1/2 rounded-full border bg-background/95 px-4 py-2 text-xs font-medium shadow-lg backdrop-blur" role="status">Release to fill {selectedCount} {selectedCount === 1 ? "cell" : "cells"}</div> : null}
    <div className="planner-layout grid min-h-0 flex-1 overflow-hidden" ref={containerRef} style={{ "--planner-grid-template": gridTemplate } as React.CSSProperties}><section aria-label="Editable trip planning matrix" className="planner-matrix min-w-0 overflow-auto bg-background"><div className="min-w-max" data-fill-dragging={isFillDragging || undefined} role="grid" aria-label={`${trip.title} itinerary`} aria-multiselectable="true" aria-rowcount={workspace.days.length + 1} aria-colcount={9} onDoubleClick={openEditorFromDoubleClick} onPointerDown={startRangeSelection}><div className="sticky top-0 z-30 flex h-9 border-b bg-muted/95 text-[11px] font-semibold text-muted-foreground" role="row"><div className="sticky left-0 z-40 flex w-24 shrink-0 items-center border-r bg-muted px-2" role="columnheader">Date</div><div className="sticky left-24 z-40 flex w-16 shrink-0 items-center border-r bg-muted px-2" role="columnheader">Day</div>{categories.map((category) => <div className={`${category.width} flex shrink-0 items-center border-r px-2`} key={category.id} role="columnheader">{category.label}</div>)}</div>
      {workspace.days.map((day, row) => <div className="flex min-h-24 border-b" key={day.id} role="row" aria-rowindex={row + 2}><div className="sticky left-0 z-20 w-24 shrink-0 border-r bg-background px-2 py-2 font-mono text-[11px]" role="rowheader"><span>{format(parseISO(day.date), "MMM d")}</span><span className="mt-0.5 block font-sans text-[10px] text-muted-foreground">{format(parseISO(day.date), "EEE")}</span></div><div className="sticky left-24 z-20 w-16 shrink-0 border-r bg-background px-2 py-2 text-xs font-semibold" role="rowheader">{day.day_number}</div>{categories.map((category, column) => { const coordinate = { row, column }; const items = day.items.filter((item) => category.types.includes(item.type)).sort((a, b) => a.sort_order - b.sort_order); const selected = selectionContains(selectionAnchor, selectionEnd, coordinate); const active = selectionEnd.row === row && selectionEnd.column === column; return <div aria-selected={selected} className={`${category.width} group relative shrink-0 border-r p-1 ${selected ? "bg-primary/5 shadow-[inset_0_0_0_2px_var(--primary)]" : "bg-background"}`} data-cell={`${row}-${column}`} key={category.id} onClick={(event) => focusCell(coordinate, event.shiftKey)} onKeyDown={(event) => handleCellKey(event, coordinate, day, category, items)} onPointerEnter={() => { if (fillDragging.current) { selectionEndRef.current = coordinate; setSelectionEnd(coordinate); } }} role="gridcell" tabIndex={active ? 0 : -1}><div className="space-y-0.5">{items.map((item, itemIndex) => <ItemRow canMoveDown={itemIndex < items.length - 1} canMoveUp={itemIndex > 0} item={item} key={item.id} onEdit={(selectedItem) => setEditor({ dayId: day.id, item: selectedItem, type: selectedItem.type })} onMove={(direction) => void moveItem(day, items, itemIndex, direction)} />)}</div><AddItemPopover category={category} day={day} onComplex={() => setEditor({ dayId: day.id, type: category.defaultType })} tripId={trip.id} variantId={workspace.variant.id} />{active ? <button aria-label="Fill selected cells down" className="absolute -bottom-1 -right-1 z-20 size-3 cursor-crosshair rounded-[2px] border border-background bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onPointerDown={(event) => startFill(event, coordinate)} type="button" /> : null}</div>; })}</div>)}</div></section>
      <div aria-label="Resize matrix and map" aria-orientation="vertical" aria-valuemax={68} aria-valuemin={45} aria-valuenow={Math.round(split)} className="planner-divider relative z-40 cursor-col-resize bg-border hover:bg-primary focus-visible:bg-primary focus-visible:outline-none" onKeyDown={(event) => { if (event.key === "ArrowLeft") setSplit((value) => Math.max(45, value - 2)); if (event.key === "ArrowRight") setSplit((value) => Math.min(68, value + 2)); }} onPointerDown={startResize} role="separator" tabIndex={0} /><div className="planner-map-pane min-w-0"><div className="planner-map-landscape h-full"><MapShell /></div><div className="planner-map-peek h-full"><MapShell compact onExpand={() => setMapExpanded(true)} /></div></div></div>
    <Sheet onOpenChange={(open) => !open && setEditor(null)} open={Boolean(editor)}>
      <SheetContent className="planner-editor-sheet">
        <SheetHeader><SheetTitle>{editor?.item ? "Edit itinerary item" : "Add itinerary item"}</SheetTitle><SheetDescription>Press Enter to save, Tab to move between fields, or Escape to cancel.</SheetDescription></SheetHeader>
        <div className="flex-1 overflow-y-auto p-5">{editor ? <PlannerItemForm dayId={editor.dayId} item={editor.item} onCancel={() => setEditor(null)} onError={setInteractionError} onSaved={() => setEditor(null)} tripId={trip.id} type={editor.type} variantId={workspace.variant.id} /> : null}</div>
      </SheetContent>
    </Sheet>
    <Sheet onOpenChange={setMapExpanded} open={mapExpanded}><SheetContent className="h-[86dvh] max-h-none p-0" side="bottom"><SheetHeader className="py-4"><SheetTitle>Map preview</SheetTitle><SheetDescription>Map and Places activate in Phase 3.</SheetDescription></SheetHeader><div className="min-h-0 flex-1"><MapShell /></div></SheetContent></Sheet>
    <Sheet onOpenChange={setSettingsOpen} open={settingsOpen}><SheetContent><SheetHeader><SheetTitle>Trip settings</SheetTitle><SheetDescription>Update trip details without changing the generated date structure.</SheetDescription></SheetHeader><div className="flex-1 overflow-y-auto p-5">{settings}</div></SheetContent></Sheet>
    <Sheet onOpenChange={setCopyDaysOpen} open={copyDaysOpen}><SheetContent><SheetHeader><SheetTitle>Copy to days</SheetTitle><SheetDescription>Create independent copies on each selected destination day.</SheetDescription></SheetHeader><div className="flex-1 space-y-2 overflow-y-auto p-5">{workspace.days.map((day) => <label className="flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm" key={day.id}><Checkbox checked={targetDays.has(day.id)} onCheckedChange={(checked) => setTargetDays((current) => { const next = new Set(current); if (checked) next.add(day.id); else next.delete(day.id); return next; })} />Day {day.day_number} · {format(parseISO(day.date), "MMM d")}</label>)}</div><div className="flex justify-end gap-2 border-t p-4"><Button onClick={() => setCopyDaysOpen(false)} variant="ghost">Cancel</Button><Button disabled={!targetDays.size || copyMutation.isPending} onClick={copyToSelectedDays}>Copy items</Button></div></SheetContent></Sheet>
  </div>;
}
