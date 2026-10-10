"use client";

import { useI18n } from "@/features/i18n/i18n-provider";
import { useState } from "react";

import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";

import { AddItemButton } from "@/features/itinerary/components/planner-add-item-button";
import { PlannerDayHeaderCell } from "@/features/itinerary/components/planner-day-header-cell";
import { PlannerItemRow } from "@/features/itinerary/components/planner-item-row";
import { PlannerCellContextMenu } from "@/features/itinerary/components/planner-cell-context-menu";
import { MatrixCityList } from "@/features/itinerary/components/matrix-city-list";
import {
  PlannerDivider,
  PlannerGridHeader,
  PlannerMapPane,
} from "@/features/itinerary/components/planner-layout-elements";
import { categories } from "@/features/itinerary/components/planner-config";
import type { PlannerMatrixProps } from "@/features/itinerary/components/planner-matrix-types";
import { selectionContains } from "@/features/itinerary/grid-interactions";
import { useInitialMatrixScrollPosition } from "@/features/itinerary/hooks/use-initial-matrix-scroll-position";
import { useMobileMatrixTopContainment } from "@/features/itinerary/hooks/use-mobile-matrix-top-containment";
import { deriveDayLocality } from "@/features/itinerary/locality";
import { isMatrixVisibleItem } from "@/features/itinerary/flight-endpoints";
import { orderedMatrixItems, orderedDayActivities } from "../activity-order";

export function PlannerMatrix({
  compactMapEmptyState,
  compactMapLines,
  compactMapMarkers,
  compactMapViewportKey,
  comparison,
  decisionSummary,
  decisionSummaryPanelOpen,
  containerRef,
  copyCell,
  copyItem,
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
  onMapExpand,
  onReorder,
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
  insertDay,
  pasteClipboard,
  requestClearCell,
  requestRemoveDay,
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
  selectContextCell,
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
  const matrixRef = useInitialMatrixScrollPosition<HTMLElement>();
  const { t } = useI18n();
  const [contextItemId, setContextItemId] = useState<string | null>(null);
  useMobileMatrixTopContainment(matrixRef);

  return (
    <div
      className="planner-layout grid min-h-0 flex-1 overflow-hidden"
      ref={containerRef}
      style={{ "--planner-grid-template": gridTemplate } as React.CSSProperties}
    >
      <section
        aria-label="Editable trip planning matrix"
        data-i18n-aria-label={"Editable trip planning matrix"}
        className="planner-matrix min-w-0 overflow-auto bg-background"
        ref={matrixRef}
      >
        <div
          className="min-w-max select-none"
          data-date-column-expanded={selectedDayRow !== null ? "true" : undefined}
          data-fill-dragging={isFillDragging || undefined}
          role="grid"
          aria-label={t("{title} itinerary", { title: tripTitle })}
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
                <PlannerDayHeaderCell
                  day={day}
                  isLastDay={row === workspace.days.length - 1}
                  onInsert={(position) => void insertDay(position)}
                  onSelect={() => selectDay(row)}
                  onReorder={() => onReorder(day)}
                  canReorder={orderedDayActivities(day.items).length > 1}
                  pending={dayMutationPending}
                  selected={selectedDayRow === row}
                />
                <div
                  className="sticky left-28 z-20 w-16 shrink-0 border-r bg-background p-0.5 text-[15px] font-medium leading-[1.25] min-[1200px]:text-[13px]"
                  role="rowheader"
                >
                  <span className="matrix-frozen-content block px-1.5 py-1">{day.day_number}</span>
                </div>
                {categories.map((category, column) => {
                  const coordinate = { row, column };
                  const items = orderedMatrixItems(day.items).filter(
                    (item) => category.types.includes(item.type) && isMatrixVisibleItem(item),
                  );
                  const selected = selectionContains(selectionAnchor, selectionEnd, coordinate);
                  const active =
                    selectedCount === 1 &&
                    selectionEnd.row === row &&
                    selectionEnd.column === column;
                  const lastSelected =
                    row === visibleSelectionBounds.bottom &&
                    column === visibleSelectionBounds.right;
                  const dayStarter =
                    category.id === "activities" &&
                    !day.items.some(({ type }) =>
                      ["activity", "meal", "transport", "flight", "train", "car_rental"].includes(
                        type,
                      ),
                    );
                  return (
                    <ContextMenu key={category.id}>
                      <ContextMenuTrigger asChild>
                        <div
                          aria-selected={selected}
                          className={`${category.width} group relative flex shrink-0 flex-col border-r p-0.5 ${selected ? "bg-primary/5 shadow-[inset_0_0_0_2px_var(--primary)]" : "bg-background"}`}
                          data-cell={`${row}-${column}`}
                          onContextMenu={(event) => {
                            const itemId = (event.target as HTMLElement).closest<HTMLElement>(
                              "[data-item-row]",
                            )?.dataset.itemRow;
                            const item = day.items.find(({ id }) => id === itemId);
                            setContextItemId(item?.id ?? null);
                            if (item) {
                              if (selectedItemId !== item.id) selectItem(item, coordinate);
                            } else selectContextCell(coordinate);
                          }}
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
                              <MatrixCityList
                                labels={deriveDayLocality(day).localities.map(({ label }) => label)}
                              />
                            ) : null}
                            {items.map((item) => (
                              <PlannerItemRow
                                interactive={selected}
                                onCopy={(selectedItem) => void copyItem(selectedItem)}
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
                          {(active || dayStarter) && category.id !== "city" ? (
                            <AddItemButton
                              category={category}
                              dayStarter={dayStarter}
                              day={day}
                              disabled={category.id === "hotel" && items.length > 0}
                              onAdd={() => setEditor({ dayId: day.id, type: category.defaultType })}
                            />
                          ) : null}
                          {lastSelected && selectionAnchor.row === selectionEnd.row ? (
                            <button
                              aria-label="Fill selected cells down"
                              data-i18n-aria-label={"Fill selected cells down"}
                              className="absolute -bottom-1 -right-1 z-20 size-3 cursor-crosshair rounded-[2px] border border-background bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onPointerDown={startFill}
                              type="button"
                            />
                          ) : null}
                        </div>
                      </ContextMenuTrigger>
                      <PlannerCellContextMenu
                        canReorder={orderedDayActivities(day.items).length > 1}
                        onReorder={() => onReorder(day)}
                        dayMutationPending={dayMutationPending}
                        hasItems={items.length > 0}
                        isOnlyDay={workspace.days.length === 1}
                        item={day.items.find(({ id }) => id === contextItemId)}
                        insertDayAfter={() => void insertDay(day.day_number + 1)}
                        insertDayBefore={() => void insertDay(day.day_number)}
                        onCopyCell={() => void copyCell(coordinate)}
                        onCopyItem={() => {
                          const item = day.items.find(({ id }) => id === contextItemId);
                          if (item) void copyItem(item);
                        }}
                        onDeleteCell={() => requestClearCell(coordinate)}
                        onDeleteDay={() => requestRemoveDay(day)}
                        onDeleteItem={() => {
                          const item = day.items.find(({ id }) => id === contextItemId);
                          if (item) void deleteItem(item);
                        }}
                        onEditItem={() => {
                          const item = day.items.find(({ id }) => id === contextItemId);
                          if (item) setEditor({ dayId: day.id, item, type: item.type });
                        }}
                        onPaste={() => void pasteClipboard()}
                      />
                    </ContextMenu>
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
    </div>
  );
}
