"use client";

import { format, parseISO } from "date-fns";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { AddItemButton, DayActions } from "@/features/itinerary/components/planner-grid-elements";
import { PlannerItemRow } from "@/features/itinerary/components/planner-item-row";
import {
  PlannerDivider,
  PlannerGridHeader,
  PlannerMapPane,
} from "@/features/itinerary/components/planner-layout-elements";
import {
  categories,
  type EditorState,
  type PlannerCategory,
} from "@/features/itinerary/components/planner-config";
import { selectionContains, type GridCoordinate } from "@/features/itinerary/grid-interactions";
import type { ItineraryItem, PlannerDay, PlannerWorkspace } from "@/features/itinerary/types";
import type { PlannerMapMode } from "@/features/itinerary/components/planner-map-shell";
import type {
  MarkerKind,
  PlannerMapLine,
  PlannerMapMarker,
} from "@/features/maps/planner-map-canvas";

export function PlannerMatrix({
  containerRef,
  dayMutationPending,
  deleteItem,
  fillDragging,
  fillSourceRight,
  focusCell,
  gridTemplate,
  handleCellKey,
  isFillDragging,
  mapEmptyState,
  mapLines,
  mapMode,
  mapMarkers,
  moveItem,
  onMapExpand,
  onMarkerClick,
  onMapModeChange,
  onToggleMarkerKind,
  openEditorFromDoubleClick,
  removeDay,
  insertDay,
  selectedCount,
  selectDay,
  selectedDayRow,
  selectedMapItem,
  selectionAnchor,
  selectionEnd,
  selectionEndRef,
  setEditor,
  setSelectedItemId,
  setSelectionAnchor,
  setSelectionEnd,
  setSplit,
  split,
  startFill,
  startRangeSelection,
  startResize,
  tripTitle,
  visibleMarkerKinds,
  visibleSelectionBounds,
  workspace,
}: {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  dayMutationPending: boolean;
  deleteItem: (item: ItineraryItem) => Promise<void>;
  fillDragging: MutableRefObject<boolean>;
  fillSourceRight: MutableRefObject<number>;
  focusCell: (coordinate: GridCoordinate, extend: boolean) => void;
  gridTemplate: string;
  handleCellKey: (
    event: React.KeyboardEvent,
    coordinate: GridCoordinate,
    dayId: string,
    category: PlannerCategory,
    items: ItineraryItem[],
  ) => void;
  insertDay: (position: number) => Promise<void>;
  isFillDragging: boolean;
  mapEmptyState?: { message: string; title: string };
  mapLines: PlannerMapLine[];
  mapMode: PlannerMapMode;
  mapMarkers: PlannerMapMarker[];
  moveItem: (
    day: PlannerDay,
    items: ItineraryItem[],
    index: number,
    direction: -1 | 1,
  ) => Promise<void>;
  onMapExpand: () => void;
  onMarkerClick: (id: string) => void;
  onMapModeChange: (mode: PlannerMapMode) => void;
  onToggleMarkerKind: (kind: MarkerKind) => void;
  openEditorFromDoubleClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  removeDay: (id: string) => Promise<void>;
  selectedCount: number;
  selectDay: (row: number) => void;
  selectedDayRow: number | null;
  selectedMapItem?: ItineraryItem;
  selectionAnchor: GridCoordinate;
  selectionEnd: GridCoordinate;
  selectionEndRef: MutableRefObject<GridCoordinate>;
  setEditor: Dispatch<SetStateAction<EditorState | null>>;
  setSelectedItemId: Dispatch<SetStateAction<string | undefined>>;
  setSelectionAnchor: Dispatch<SetStateAction<GridCoordinate>>;
  setSelectionEnd: (coordinate: GridCoordinate) => void;
  setSplit: Dispatch<SetStateAction<number>>;
  split: number;
  startFill: (event: React.PointerEvent) => void;
  startRangeSelection: (event: React.PointerEvent<HTMLDivElement>) => void;
  startResize: (event: React.PointerEvent<HTMLDivElement>) => void;
  tripTitle: string;
  visibleMarkerKinds: Set<MarkerKind>;
  visibleSelectionBounds: { top: number; bottom: number; left: number; right: number };
  workspace: PlannerWorkspace;
}) {
  return (
    <div
      className="planner-layout grid min-h-0 flex-1 overflow-hidden"
      ref={containerRef}
      style={{ "--planner-grid-template": gridTemplate } as React.CSSProperties}
    >
      <section
        aria-label="Editable trip planning matrix"
        className="planner-matrix min-w-0 overflow-auto bg-background"
      >
        <div
          className="min-w-max select-none"
          data-fill-dragging={isFillDragging || undefined}
          role="grid"
          aria-label={`${tripTitle} itinerary`}
          aria-multiselectable="true"
          aria-rowcount={workspace.days.length + 1}
          aria-colcount={9}
          onDoubleClick={openEditorFromDoubleClick}
          onPointerDown={startRangeSelection}
        >
          <PlannerGridHeader />
          {workspace.days.map((day, row) => (
            <div className="contents" key={day.id}>
              <div className="flex min-h-24 border-b" role="row" aria-rowindex={row + 2}>
                <div
                  aria-selected={selectedDayRow === row}
                  className={`sticky left-0 z-20 w-24 shrink-0 cursor-pointer border-r px-2 py-2 font-mono text-[11px] ${selectedDayRow === row ? "bg-primary/10 shadow-[inset_0_0_0_2px_var(--primary)]" : "bg-background"}`}
                  onClick={() => selectDay(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectDay(row);
                    }
                  }}
                  role="rowheader"
                  tabIndex={0}
                >
                  <span className="block font-sans text-xs font-semibold sm:hidden">
                    Day {day.day_number}
                  </span>
                  <span className="mt-1 block text-xs font-medium sm:mt-0">
                    {day.date ? format(parseISO(day.date), "MMM d") : "Date TBD"}
                  </span>
                  <span className="mt-0.5 block font-sans text-[10px] text-muted-foreground">
                    {day.date ? format(parseISO(day.date), "EEE") : "Add dates later"}
                  </span>
                  <DayActions
                    day={day}
                    isOnlyDay={workspace.days.length === 1}
                    location="cell"
                    onInsert={(position) => void insertDay(position)}
                    onRemove={(dayId) => void removeDay(dayId)}
                    pending={dayMutationPending}
                    visible={selectedDayRow === row}
                  />
                </div>
                <div
                  className="sticky left-24 z-20 w-16 shrink-0 border-r bg-background px-2 py-2 text-xs font-semibold"
                  role="rowheader"
                >
                  {day.day_number}
                </div>
                {categories.map((category, column) => {
                  const coordinate = { row, column };
                  const items = day.items
                    .filter((item) => category.types.includes(item.type))
                    .sort((a, b) => a.sort_order - b.sort_order);
                  const selected = selectionContains(selectionAnchor, selectionEnd, coordinate);
                  const active =
                    selectedCount === 1 &&
                    selectionEnd.row === row &&
                    selectionEnd.column === column;
                  const lastSelected =
                    row === visibleSelectionBounds.bottom &&
                    column === visibleSelectionBounds.right;
                  return (
                    <div
                      aria-selected={selected}
                      className={`${category.width} group relative flex shrink-0 flex-col border-r p-1 ${selected ? "bg-primary/5 shadow-[inset_0_0_0_2px_var(--primary)]" : "bg-background"}`}
                      data-cell={`${row}-${column}`}
                      key={category.id}
                      onClick={(event) => focusCell(coordinate, event.shiftKey)}
                      onKeyDown={(event) =>
                        handleCellKey(event, coordinate, day.id, category, items)
                      }
                      onPointerEnter={() => {
                        if (fillDragging.current) {
                          const sameColumn = {
                            column: fillSourceRight.current,
                            row: coordinate.row,
                          };
                          selectionEndRef.current = sameColumn;
                          setSelectionEnd(sameColumn);
                        }
                      }}
                      role="gridcell"
                      tabIndex={active ? 0 : -1}
                    >
                      <div className="space-y-0.5">
                        {items.map((item, itemIndex) => (
                          <PlannerItemRow
                            interactive={selected}
                            onDelete={(selectedItem) => void deleteItem(selectedItem)}
                            canMoveDown={itemIndex < items.length - 1}
                            canMoveUp={itemIndex > 0}
                            item={item}
                            key={item.id}
                            onEdit={(selectedItem) =>
                              setEditor({
                                dayId: day.id,
                                item: selectedItem,
                                type: selectedItem.type,
                              })
                            }
                            onMove={(direction) => void moveItem(day, items, itemIndex, direction)}
                            onSelect={() => {
                              const coordinate = { row, column };
                              setSelectionAnchor(coordinate);
                              setSelectionEnd(coordinate);
                              setSelectedItemId(item.id);
                            }}
                            selected={item.id === selectedMapItem?.id}
                          />
                        ))}
                      </div>
                      {active ? (
                        <AddItemButton
                          category={category}
                          day={day}
                          disabled={category.id === "hotel" && items.length > 0}
                          onAdd={() => setEditor({ dayId: day.id, type: category.defaultType })}
                        />
                      ) : null}
                      {lastSelected && selectionAnchor.row === selectionEnd.row ? (
                        <button
                          aria-label="Fill selected cells down"
                          className="absolute -bottom-1 -right-1 z-20 size-3 cursor-crosshair rounded-[2px] border border-background bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onPointerDown={startFill}
                          type="button"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
      <PlannerDivider onResize={startResize} onSplitChange={setSplit} split={split} />
      <PlannerMapPane
        emptyState={mapEmptyState}
        lines={mapLines}
        mapMode={mapMode}
        markers={mapMarkers}
        onExpand={() => onMapExpand()}
        onMarkerClick={onMarkerClick}
        onMapModeChange={onMapModeChange}
        onToggleKind={onToggleMarkerKind}
        selectedId={selectedMapItem?.id}
        visibleKinds={visibleMarkerKinds}
      />
    </div>
  );
}
