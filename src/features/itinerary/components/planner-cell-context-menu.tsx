"use client";

import { ClipboardPaste, Copy, Pencil, Plus, Trash2, ListOrdered } from "lucide-react";

import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { T } from "@/features/i18n/i18n-provider";
import type { ItineraryItem } from "@/features/itinerary/types";

export function PlannerCellContextMenu({
  dayMutationPending,
  hasItems,
  isOnlyDay,
  item,
  insertDayAfter,
  insertDayBefore,
  onCopyCell,
  onCopyItem,
  onDeleteCell,
  onDeleteDay,
  onDeleteItem,
  onEditItem,
  onPaste,
  onReorder,
  canReorder,
}: {
  dayMutationPending: boolean;
  hasItems: boolean;
  isOnlyDay: boolean;
  item?: ItineraryItem;
  insertDayAfter: () => void;
  insertDayBefore: () => void;
  onCopyCell: () => void;
  onCopyItem: () => void;
  onDeleteCell: () => void;
  onDeleteDay: () => void;
  onDeleteItem: () => void;
  onEditItem: () => void;
  onPaste: () => void;
  onReorder: () => void;
  canReorder: boolean;
}) {
  return (
    <ContextMenuContent>
      <ContextMenuItem disabled={!canReorder} onSelect={onReorder}>
        <ListOrdered className="size-4" /> <T message="Reorder" />
      </ContextMenuItem>
      <ContextMenuSeparator />
      {item ? (
        <>
          <ContextMenuItem onSelect={onEditItem}>
            <Pencil className="size-4" /> <T message="Edit item" />
          </ContextMenuItem>
          <ContextMenuItem onSelect={onCopyItem}>
            <Copy className="size-4" /> <T message="Copy item" />
          </ContextMenuItem>
          <ContextMenuSeparator className="-mx-1 my-1 h-px bg-border" />
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={onDeleteItem}
          >
            <Trash2 className="size-4" /> <T message="Delete item" />
          </ContextMenuItem>
        </>
      ) : (
        <>
          <ContextMenuItem disabled={!hasItems} onSelect={onDeleteCell}>
            <Trash2 className="size-4" /> <T message="Delete cell" />
          </ContextMenuItem>
          <ContextMenuItem onSelect={onCopyCell}>
            <Copy className="size-4" /> <T message="Copy cell" />
          </ContextMenuItem>
          <ContextMenuItem onSelect={onPaste}>
            <ClipboardPaste className="size-4" /> <T message="Paste" />
          </ContextMenuItem>
          <ContextMenuSeparator className="-mx-1 my-1 h-px bg-border" />
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            disabled={isOnlyDay || dayMutationPending}
            onSelect={onDeleteDay}
          >
            <Trash2 className="size-4" /> <T message="Delete day" />
          </ContextMenuItem>
          <ContextMenuItem disabled={dayMutationPending} onSelect={insertDayBefore}>
            <Plus className="size-4" /> <T message="Add day before" />
          </ContextMenuItem>
          <ContextMenuItem disabled={dayMutationPending} onSelect={insertDayAfter}>
            <Plus className="size-4" /> <T message="Add day after" />
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  );
}
