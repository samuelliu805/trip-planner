"use client";

import { format, parseISO } from "date-fns";
import { Map } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AddItemButton, DayActions } from "@/features/itinerary/components/planner-grid-elements";
import { PlannerItemRow } from "@/features/itinerary/components/planner-item-row";
import {
  PlannerDivider,
  PlannerGridHeader,
  PlannerMapPane,
} from "@/features/itinerary/components/planner-layout-elements";
import { categories } from "@/features/itinerary/components/planner-config";
import type { PlannerMatrixProps } from "@/features/itinerary/components/planner-matrix-types";
import { selectionContains } from "@/features/itinerary/grid-interactions";
import { deriveDayLocality, formatDayLocalitySummary } from "@/features/itinerary/locality";

export function PlannerMatrix({
  compactMapEmptyState,
  compactMapLines,
  compactMapMarkers,
  compactMapViewportKey,
  comparison,
  decisionSummary,
  decisionSummaryPanelOpen,
  containerRef,
  dayCityLayerAvailable,
  dayMapLayer,
  dayMutationPending,
  dayRoute,
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
  onArrangeActivities,
  onMapExpand,
  onComparisonSheetOpen,
  onDecisionSummaryOpen,
  onDecisionSummaryPanelClose,
  onDayMapLayerChange,
  onEditMapItem,
  onMarkerClick,
  onMapModeChange,
  onMapSelectionClear,
  openEditorFromDoubleClick,
  overviewRoute,
  removeDay,
  insertDay,
  selectedCount,
  selectDay,
  selectedDayRow,
  selectedItemId,
  selectedMapItem,
  selectionAnchor,
  selectionEnd,
  selectionEndRef,
  setEditor,
  selectItem,
  setSelectionEnd,
  setSplit,
  split,
  startFill,
  startRangeSelection,
  startResize,
  tripTitle,
  mapViewportKey,
  visibleSelectionBounds,
  workspace,
}: PlannerMatrixProps) {
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
              <div
                className="flex min-h-11 border-b min-[1200px]:min-h-[52px]"
                role="row"
                aria-rowindex={row + 2}
              >
                <div
                  aria-selected={selectedDayRow === row}
                  className={`sticky left-0 z-20 w-24 shrink-0 cursor-pointer border-r px-2 py-1 font-mono text-[13px] leading-[1.35] min-[1200px]:text-[11px] ${selectedDayRow === row ? "bg-primary/10 shadow-[inset_0_0_0_2px_var(--primary)]" : "bg-background"}`}
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
                  <span className="block font-sans text-[15px] font-semibold leading-[1.25] min-[1200px]:text-[13px] sm:hidden">
                    Day {day.day_number}
                  </span>
                  <span className="block text-[15px] font-medium leading-[1.25] min-[1200px]:text-[13px]">
                    {day.date ? format(parseISO(day.date), "MMM d") : "Date TBD"}
                  </span>
                  {day.date ? (
                    <span className="block font-sans text-[13px] leading-[1.35] text-muted-foreground min-[1200px]:text-[11px]">
                      {format(parseISO(day.date), "EEE")}
                    </span>
                  ) : (
                    <span className="hidden font-sans text-[13px] leading-[1.35] text-muted-foreground min-[1200px]:text-[11px] sm:block">
                      Add dates later
                    </span>
                  )}
                  <DayActions
                    day={day}
                    isOnlyDay={workspace.days.length === 1}
                    location="cell"
                    onArrange={onArrangeActivities}
                    onInsert={(position) => void insertDay(position)}
                    onRemove={(dayId) => void removeDay(dayId)}
                    pending={dayMutationPending}
                    visible={selectedDayRow === row}
                  />
                </div>
                <div
                  className="sticky left-24 z-20 w-16 shrink-0 border-r bg-background px-2 py-1 text-[15px] font-semibold leading-[1.25] min-[1200px]:text-[13px]"
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
                      className={`${category.width} group relative flex shrink-0 flex-col border-r p-0.5 ${selected ? "bg-primary/5 shadow-[inset_0_0_0_2px_var(--primary)]" : "bg-background"}`}
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
                      <div className="space-y-px min-[1200px]:space-y-1">
                        {category.id === "city" ? (
                          <div
                            className="matrix-city-summary flex min-h-11 min-w-0 flex-col justify-center rounded bg-muted/50 px-1.5 py-1 min-[1200px]:min-h-8"
                            data-city-summary=""
                          >
                            <p className="text-[15px] font-medium leading-[1.25] min-[1200px]:text-[13px]">
                              {formatDayLocalitySummary(deriveDayLocality(day))}
                            </p>
                          </div>
                        ) : null}
                        {items.map((item) => (
                          <PlannerItemRow
                            interactive={selected}
                            onDelete={(selectedItem) => void deleteItem(selectedItem)}
                            item={item}
                            key={item.id}
                            onEdit={(selectedItem) =>
                              setEditor({
                                dayId: day.id,
                                item: selectedItem,
                                type: selectedItem.type,
                              })
                            }
                            onSelect={() => {
                              selectItem(item, { row, column });
                            }}
                            selected={item.id === selectedItemId}
                          />
                        ))}
                      </div>
                      {active && category.id !== "city" ? (
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
        compactEmptyState={compactMapEmptyState}
        compactLines={compactMapLines}
        compactMarkers={compactMapMarkers}
        compactViewportKey={compactMapViewportKey}
        comparison={comparison}
        decisionSummary={decisionSummary}
        decisionSummaryPanelOpen={decisionSummaryPanelOpen}
        dayCityLayerAvailable={dayCityLayerAvailable}
        dayMapLayer={dayMapLayer}
        dayRoute={dayRoute}
        days={workspace.days}
        emptyState={mapEmptyState}
        lines={mapLines}
        mapMode={mapMode}
        markers={mapMarkers}
        onExpand={() => onMapExpand()}
        onComparisonSheetOpen={onComparisonSheetOpen}
        onDecisionSummaryOpen={onDecisionSummaryOpen}
        onDecisionSummaryPanelClose={onDecisionSummaryPanelClose}
        onDayMapLayerChange={onDayMapLayerChange}
        onEditMapItem={onEditMapItem}
        onMarkerClick={onMarkerClick}
        onMapModeChange={onMapModeChange}
        onMapSelectionClear={onMapSelectionClear}
        overviewRoute={overviewRoute}
        selectedId={selectedMapItem?.id}
        selectedItem={selectedMapItem}
        viewportKey={mapViewportKey}
      />
      <Button
        aria-label="Open map and route tools"
        className="planner-mobile-map-fab absolute bottom-4 right-4 z-30 hidden min-h-11 items-center gap-2 rounded-full px-4 shadow-lg"
        onClick={onMapExpand}
        type="button"
      >
        <Map aria-hidden="true" className="size-4" /> Map & routes
      </Button>
    </div>
  );
}
