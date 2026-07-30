"use client";

import { useIsMutating } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ArrowLeft, CalendarDays, Check, ChevronDown, GripVertical, MapPinned, MoreHorizontal, Plus, Route, Settings2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PlannerItemForm } from "@/features/itinerary/components/planner-item-form";
import { usePlannerWorkspace } from "@/features/itinerary/queries";
import type { ItineraryItem, ItineraryItemType, PlannerDay, PlannerWorkspace as PlannerWorkspaceData } from "@/features/itinerary/types";
import type { Tables } from "@/types/database";

type Category = "city" | "activities" | "transport" | "hotel" | "car_rental" | "meals" | "notes";
type EditorState = { dayId: string; item?: ItineraryItem; type: ItineraryItemType };
type Selection = { column: number; row: number };

const categories: { id: Category; label: string; types: ItineraryItemType[]; defaultType: ItineraryItemType; width: string }[] = [
  { id: "city", label: "City", types: ["location"], defaultType: "location", width: "w-36" },
  { id: "activities", label: "Activities", types: ["activity"], defaultType: "activity", width: "w-52" },
  { id: "transport", label: "Transport", types: ["transport", "flight", "train"], defaultType: "transport", width: "w-44" },
  { id: "hotel", label: "Hotel", types: ["hotel"], defaultType: "hotel", width: "w-44" },
  { id: "car_rental", label: "Car rental", types: ["car_rental"], defaultType: "car_rental", width: "w-44" },
  { id: "meals", label: "Meals", types: ["meal"], defaultType: "meal", width: "w-44" },
  { id: "notes", label: "Notes", types: ["note"], defaultType: "note", width: "w-52" },
];

const complexTypes = new Set<ItineraryItemType>(["car_rental", "flight", "train", "transport", "hotel"]);

function timeLabel(time: string | null) {
  return time ? time.slice(0, 5) : null;
}

function isSelected(selectionAnchor: Selection | null, selectionEnd: Selection | null, row: number, column: number) {
  if (!selectionAnchor || !selectionEnd) return false;
  return row >= Math.min(selectionAnchor.row, selectionEnd.row) && row <= Math.max(selectionAnchor.row, selectionEnd.row)
    && column >= Math.min(selectionAnchor.column, selectionEnd.column) && column <= Math.max(selectionAnchor.column, selectionEnd.column);
}

function AddItemPopover({ category, day, onComplex, tripId, variantId }: { category: (typeof categories)[number]; day: PlannerDay; onComplex: () => void; tripId: string; variantId: string }) {
  const [open, setOpen] = useState(false);
  if (complexTypes.has(category.defaultType)) return <button aria-label={`Add ${category.label.toLowerCase()} on day ${day.day_number}`} className="flex h-7 w-full items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100" onClick={onComplex} type="button"><Plus className="size-3.5" /></button>;
  return <Popover onOpenChange={setOpen} open={open}>
    <PopoverTrigger asChild><button aria-label={`Add ${category.label.toLowerCase()} on day ${day.day_number}`} className="flex h-7 w-full items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"><Plus className="size-3.5" /></button></PopoverTrigger>
    <PopoverContent className="w-96"><p className="mb-3 text-sm font-semibold">Add {category.label.toLowerCase()}</p><PlannerItemForm dayId={day.id} onCancel={() => setOpen(false)} onSaved={() => setOpen(false)} tripId={tripId} type={category.defaultType} variantId={variantId} /></PopoverContent>
  </Popover>;
}

function SimpleItemPopover({ item, onComplex }: { item: ItineraryItem; onComplex: (item: ItineraryItem) => void }) {
  const [open, setOpen] = useState(false);
  const start = timeLabel(item.start_time);
  if (complexTypes.has(item.type)) return <button className="group/item flex w-full min-w-0 items-start gap-1.5 rounded px-1.5 py-1 text-left text-xs leading-4 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onComplex(item)} type="button"><GripVertical className="mt-0.5 size-3 shrink-0 text-muted-foreground/50" aria-hidden="true" /><span className="min-w-0"><span className="font-medium">{start ? <span className="mr-1 font-mono text-[10px] text-muted-foreground">{start}</span> : null}{item.title}</span></span></button>;
  return <Popover onOpenChange={setOpen} open={open}>
    <PopoverTrigger asChild><button className="group/item flex w-full min-w-0 items-start gap-1.5 rounded px-1.5 py-1 text-left text-xs leading-4 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="button"><GripVertical className="mt-0.5 size-3 shrink-0 text-muted-foreground/50" aria-hidden="true" /><span className="min-w-0"><span className="font-medium">{start ? <span className="mr-1 font-mono text-[10px] text-muted-foreground">{start}</span> : null}{item.title}</span></span></button></PopoverTrigger>
    <PopoverContent className="w-96"><p className="mb-3 text-sm font-semibold">Edit item</p><PlannerItemForm dayId={item.day_id} item={item} onCancel={() => setOpen(false)} onSaved={() => setOpen(false)} tripId={item.trip_id} type={item.type} variantId={item.variant_id} /></PopoverContent>
  </Popover>;
}

function MapShell() {
  return <section aria-label="Map preview" className="relative h-full min-w-0 overflow-hidden bg-muted/40">
    <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:42px_42px]" />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_30%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_36%),radial-gradient(circle_at_72%_65%,color-mix(in_oklab,var(--muted-foreground)_10%,transparent),transparent_34%)]" />
    <div className="absolute left-4 top-4 rounded-md border bg-background/90 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">Map preview</div>
    <div className="absolute inset-0 flex items-center justify-center p-8"><div className="max-w-sm rounded-xl border bg-background/95 p-6 text-center shadow-lg backdrop-blur"><span className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary"><MapPinned className="size-5" aria-hidden="true" /></span><h2 className="mt-4 font-semibold">Map and Places activate in Phase 3</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">The planner keeps this provider-ready region visible without loading Google scripts or making Maps or Places requests.</p></div></div>
  </section>;
}

export function PlannerWorkspace({ deleteError, initialWorkspace, settings, trip }: { deleteError: boolean; initialWorkspace: PlannerWorkspaceData; settings: React.ReactNode; trip: Tables<"trips"> }) {
  const { data: workspace = initialWorkspace } = usePlannerWorkspace(trip.id, initialWorkspace);
  const [split, setSplit] = useState(58);
  const [selectionAnchor, setSelectionAnchor] = useState<Selection | null>({ row: 0, column: 0 });
  const [selectionEnd, setSelectionEnd] = useState<Selection | null>({ row: 0, column: 0 });
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mutating = useIsMutating() > 0;
  const selectedCount = selectionAnchor && selectionEnd ? (Math.abs(selectionAnchor.row - selectionEnd.row) + 1) * (Math.abs(selectionAnchor.column - selectionEnd.column) + 1) : 0;
  const dateRange = `${format(parseISO(trip.start_date), "MMM d")} – ${format(parseISO(trip.end_date), "MMM d, yyyy")}`;
  const complexItem = editor?.item;

  const gridTemplate = useMemo(() => `minmax(520px, ${split}fr) 4px minmax(360px, ${100 - split}fr)`, [split]);

  function selectCell(event: React.MouseEvent, row: number, column: number) {
    const next = { row, column };
    if (event.shiftKey && selectionAnchor) setSelectionEnd(next);
    else { setSelectionAnchor(next); setSelectionEnd(next); }
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const bounds = containerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setSplit(Math.min(68, Math.max(45, ((moveEvent.clientX - bounds.left) / bounds.width) * 100)));
    };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function addFromToolbar() {
    const target = selectionEnd ?? { row: 0, column: 1 };
    const day = workspace.days[target.row] ?? workspace.days[0];
    const category = categories[target.column] ?? categories[1];
    if (day) setEditor({ dayId: day.id, type: category.defaultType });
  }

  return <div className="flex h-full min-h-0 flex-col bg-background">
    <header className="flex h-[72px] shrink-0 items-center justify-between gap-4 border-b px-4 lg:px-5">
      <div className="flex min-w-0 items-center gap-3"><Tooltip><TooltipTrigger asChild><Button asChild className="size-9 p-0" variant="ghost"><Link aria-label="Back to Trips" href="/trips"><ArrowLeft className="size-4" /></Link></Button></TooltipTrigger><TooltipContent>Back to Trips</TooltipContent></Tooltip><div className="min-w-0"><h1 className="truncate text-lg font-semibold tracking-tight">{trip.title}</h1><p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-3.5" aria-hidden="true" />{dateRange}</p></div></div>
      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5" aria-live="polite">{mutating ? <span className="size-2 animate-pulse rounded-full bg-amber-500" /> : <Check className="size-3.5 text-primary" />}{mutating ? "Saving…" : "Saved"}</span><DropdownMenu><DropdownMenuTrigger asChild><Button aria-label="More trip actions" className="size-9 p-0" variant="outline"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setSettingsOpen(true)}><Settings2 className="size-4" />Trip settings</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled><Route className="size-4" />Route variants <span className="ml-auto text-[10px] text-muted-foreground">P4</span></DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
    </header>
    <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b bg-muted/20 px-3">
      <div className="flex items-center gap-1.5 whitespace-nowrap"><Button className="h-7 px-2.5 text-xs" onClick={addFromToolbar} size="sm"><Plus className="size-3.5" />Add item</Button><Button className="h-7 px-2 text-xs" disabled size="sm" variant="ghost">Copy</Button><Button className="h-7 px-2 text-xs" disabled size="sm" variant="ghost">Fill</Button><Button aria-label="More editing actions" className="size-7 p-0" disabled size="sm" variant="ghost"><ChevronDown className="size-3.5" /></Button></div>
      <span className="shrink-0 text-[11px] text-muted-foreground">Selected: {selectedCount} {selectedCount === 1 ? "cell" : "cells"}</span>
    </div>
    {deleteError ? <p className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">The trip could not be deleted.</p> : null}
    <div className="grid min-h-0 flex-1 overflow-hidden" ref={containerRef} style={{ gridTemplateColumns: gridTemplate }}>
      <section aria-label="Editable trip planning matrix" className="min-w-0 overflow-auto bg-background">
        <div className="min-w-max" role="grid" aria-label={`${trip.title} itinerary`} aria-multiselectable="true" aria-rowcount={workspace.days.length + 1} aria-colcount={9}>
          <div className="sticky top-0 z-30 flex h-9 border-b bg-muted/95 text-[11px] font-semibold text-muted-foreground backdrop-blur" role="row">
            <div className="sticky left-0 z-40 flex w-24 shrink-0 items-center border-r bg-muted px-2" role="columnheader">Date</div><div className="sticky left-24 z-40 flex w-16 shrink-0 items-center border-r bg-muted px-2" role="columnheader">Day</div>{categories.map((category) => <div className={`${category.width} flex shrink-0 items-center border-r px-2`} key={category.id} role="columnheader">{category.label}</div>)}
          </div>
          {workspace.days.map((day, row) => <div className="flex min-h-24 border-b" key={day.id} role="row" aria-rowindex={row + 2}>
            <div className="sticky left-0 z-20 w-24 shrink-0 border-r bg-background px-2 py-2 font-mono text-[11px]" role="rowheader">{format(parseISO(day.date), "MMM d")}</div>
            <div className="sticky left-24 z-20 w-16 shrink-0 border-r bg-background px-2 py-2 text-xs" role="rowheader"><span className="font-semibold">{day.day_number}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{format(parseISO(day.date), "EEE")}</span></div>
            {categories.map((category, column) => {
              const items = day.items.filter((item) => category.types.includes(item.type));
              const selected = isSelected(selectionAnchor, selectionEnd, row, column);
              return <div aria-selected={selected} className={`${category.width} group relative shrink-0 border-r p-1 ${selected ? "bg-primary/5 shadow-[inset_0_0_0_2px_var(--primary)]" : "bg-background"}`} key={category.id} onClick={(event) => selectCell(event, row, column)} role="gridcell" tabIndex={selectionEnd?.row === row && selectionEnd.column === column ? 0 : -1}>
                <div className="space-y-0.5">{items.map((item) => <SimpleItemPopover item={item} key={item.id} onComplex={(selectedItem) => setEditor({ dayId: day.id, item: selectedItem, type: selectedItem.type })} />)}</div>
                <AddItemPopover category={category} day={day} onComplex={() => setEditor({ dayId: day.id, type: category.defaultType })} tripId={trip.id} variantId={workspace.variant.id} />
              </div>;
            })}
          </div>)}
        </div>
      </section>
      <div aria-label="Resize matrix and map" aria-orientation="vertical" aria-valuemax={68} aria-valuemin={45} aria-valuenow={Math.round(split)} className="relative z-40 cursor-col-resize bg-border hover:bg-primary focus-visible:bg-primary focus-visible:outline-none" onKeyDown={(event) => { if (event.key === "ArrowLeft") setSplit((value) => Math.max(45, value - 2)); if (event.key === "ArrowRight") setSplit((value) => Math.min(68, value + 2)); }} onPointerDown={startResize} role="separator" tabIndex={0}><span className="absolute left-1/2 top-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/25" /></div>
      <MapShell />
    </div>
    <Sheet onOpenChange={(open) => !open && setEditor(null)} open={Boolean(editor)}><SheetContent><SheetHeader><SheetTitle>{complexItem ? "Edit itinerary item" : "Add itinerary item"}</SheetTitle><SheetDescription>{complexTypes.has(editor?.type ?? "activity") ? "Complete the structured details for this item." : "Add a plan to the selected cell."}</SheetDescription></SheetHeader><div className="flex-1 overflow-y-auto p-5">{editor ? <PlannerItemForm dayId={editor.dayId} item={editor.item} onCancel={() => setEditor(null)} onSaved={() => setEditor(null)} tripId={trip.id} type={editor.type} variantId={workspace.variant.id} /> : null}</div></SheetContent></Sheet>
    <Sheet onOpenChange={setSettingsOpen} open={settingsOpen}><SheetContent><SheetHeader><SheetTitle>Trip settings</SheetTitle><SheetDescription>Update trip details without changing the generated date structure.</SheetDescription></SheetHeader><div className="flex-1 overflow-y-auto p-5">{settings}</div></SheetContent></Sheet>
  </div>;
}
