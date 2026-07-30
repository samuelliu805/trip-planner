"use client";

import { useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateItineraryItem, useDeleteItineraryItem, useUpdateItineraryItem } from "@/features/itinerary/queries";
import type { CarRentalDetails, ItineraryItem, ItineraryItemType } from "@/features/itinerary/types";
import type { Json } from "@/types/database";

type PlannerItemFormProps = {
  dayId: string;
  item?: ItineraryItem;
  onCancel: () => void;
  onSaved: (item: ItineraryItem) => void;
  tripId: string;
  type: ItineraryItemType;
  variantId: string;
};

export function PlannerItemForm({ dayId, item, onCancel, onSaved, tripId, type, variantId }: PlannerItemFormProps) {
  const existingCar = item?.type === "car_rental" ? item.details as Partial<CarRentalDetails> : {};
  const [title, setTitle] = useState(item?.title ?? "");
  const [startTime, setStartTime] = useState(item?.start_time?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(item?.end_time?.slice(0, 5) ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [bookingUrl, setBookingUrl] = useState(item?.booking_url ?? "");
  const [carAction, setCarAction] = useState<CarRentalDetails["action"]>(existingCar.action ?? "pickup");
  const [carLocation, setCarLocation] = useState(existingCar.location ?? "");
  const [carProvider, setCarProvider] = useState(existingCar.provider ?? "");
  const [carConfirmed, setCarConfirmed] = useState(existingCar.confirmed ?? false);
  const createMutation = useCreateItineraryItem(tripId);
  const updateMutation = useUpdateItineraryItem(tripId);
  const deleteMutation = useDeleteItineraryItem(tripId);
  const pending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const error = createMutation.error ?? updateMutation.error ?? deleteMutation.error;

  async function save() {
    const details: Record<string, Json> = type === "car_rental"
      ? { action: carAction, confirmed: carConfirmed, location: carLocation, provider: carProvider || null, time: startTime || null }
      : (item?.details as Record<string, Json> | undefined) ?? {};
    try {
      const saved = item
        ? await updateMutation.mutateAsync({ bookingUrl, details: details as never, endTime, id: item.id, notes, startTime, title, tripId, type })
        : await createMutation.mutateAsync({ bookingUrl, dayId, details: details as never, endTime, notes, startTime, title, tripId, type, variantId });
      onSaved(saved);
    } catch {
      // TanStack Query exposes the mutation error in the form below.
    }
  }

  async function remove() {
    if (!item) return;
    try {
      await deleteMutation.mutateAsync({ id: item.id, tripId });
      onCancel();
    } catch {
      // TanStack Query exposes the mutation error in the form below.
    }
  }

  return <div className="space-y-4">
    <div className="space-y-1.5"><Label htmlFor={`item-title-${item?.id ?? dayId}-${type}`}>Title</Label><Input autoFocus id={`item-title-${item?.id ?? dayId}-${type}`} onChange={(event) => setTitle(event.target.value)} placeholder="Add a plan" value={title} /></div>
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5"><Label htmlFor={`item-start-${item?.id ?? dayId}-${type}`}>Start time <span className="font-normal text-muted-foreground">optional</span></Label><Input id={`item-start-${item?.id ?? dayId}-${type}`} onChange={(event) => setStartTime(event.target.value)} type="time" value={startTime} /></div>
      <div className="space-y-1.5"><Label htmlFor={`item-end-${item?.id ?? dayId}-${type}`}>End time <span className="font-normal text-muted-foreground">optional</span></Label><Input id={`item-end-${item?.id ?? dayId}-${type}`} onChange={(event) => setEndTime(event.target.value)} type="time" value={endTime} /></div>
    </div>
    {type === "car_rental" ? <div className="grid gap-3 rounded-md border bg-muted/25 p-3">
      <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor={`car-action-${item?.id ?? dayId}`}>Action</Label><Select onValueChange={(value) => setCarAction(value as CarRentalDetails["action"])} value={carAction}><SelectTrigger id={`car-action-${item?.id ?? dayId}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pickup">Pickup</SelectItem><SelectItem value="return">Return</SelectItem></SelectContent></Select></div><label className="flex min-h-11 items-end gap-2 pb-2 text-sm"><Checkbox checked={carConfirmed} onCheckedChange={(checked) => setCarConfirmed(checked === true)} />Confirmed</label></div>
      <div className="space-y-1.5"><Label htmlFor={`car-location-${item?.id ?? dayId}`}>Location</Label><Input id={`car-location-${item?.id ?? dayId}`} onChange={(event) => setCarLocation(event.target.value)} value={carLocation} /></div>
      <div className="space-y-1.5"><Label htmlFor={`car-provider-${item?.id ?? dayId}`}>Provider <span className="font-normal text-muted-foreground">optional</span></Label><Input id={`car-provider-${item?.id ?? dayId}`} onChange={(event) => setCarProvider(event.target.value)} value={carProvider} /></div>
    </div> : null}
    <div className="space-y-1.5"><Label htmlFor={`item-notes-${item?.id ?? dayId}-${type}`}>Notes</Label><Textarea id={`item-notes-${item?.id ?? dayId}-${type}`} onChange={(event) => setNotes(event.target.value)} value={notes} /></div>
    <div className="space-y-1.5"><Label htmlFor={`item-booking-${item?.id ?? dayId}-${type}`}>Booking URL</Label><Input id={`item-booking-${item?.id ?? dayId}-${type}`} onChange={(event) => setBookingUrl(event.target.value)} placeholder="https://" type="url" value={bookingUrl} /></div>
    {error ? <p className="text-sm text-destructive" role="alert">{error.message}</p> : null}
    <div className="flex items-center justify-between gap-2">
      <div>{item ? <AlertDialog><AlertDialogTrigger asChild><Button disabled={pending} size="sm" type="button" variant="ghost">Delete</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete “{item.title}”?</AlertDialogTitle><AlertDialogDescription>This removes the item from the trip. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={remove}>Delete item</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}</div>
      <div className="flex gap-2"><Button onClick={onCancel} size="sm" type="button" variant="ghost">Cancel</Button><Button disabled={pending || !title.trim() || (type === "car_rental" && !carLocation.trim())} onClick={save} size="sm" type="button">{pending ? "Saving…" : item ? "Save" : "Add item"}</Button></div>
    </div>
  </div>;
}
