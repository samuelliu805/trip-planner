"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { itineraryItemTypes } from "@/features/itinerary/schema";
import type { CarRentalDetails, ItineraryItem } from "@/features/itinerary/types";
import { useUpdateItineraryItem } from "@/features/itinerary/queries";
import type { Json } from "@/types/database";

const typeLabels = Object.fromEntries(itineraryItemTypes.map((type) => [type, type.replace("_", " ")])) as Record<ItineraryItem["type"], string>;

export function ItemDetailsEditor({ item, onSaved }: { item: ItineraryItem; onSaved: (item: ItineraryItem) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [type, setType] = useState(item.type);
  const [startTime, setStartTime] = useState(item.start_time?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(item.end_time?.slice(0, 5) ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const existingCar = item.type === "car_rental" ? item.details as Partial<CarRentalDetails> : {};
  const [carAction, setCarAction] = useState<CarRentalDetails["action"]>(existingCar.action ?? "pickup");
  const [carLocation, setCarLocation] = useState(existingCar.location ?? "");
  const [carProvider, setCarProvider] = useState(existingCar.provider ?? "");
  const [carConfirmed, setCarConfirmed] = useState(existingCar.confirmed ?? false);
  const mutation = useUpdateItineraryItem(item.trip_id);

  if (!open) return <Button className="h-7 px-2 text-xs" onClick={() => setOpen(true)} type="button" variant="ghost">Details</Button>;

  async function save() {
    const details = type === "car_rental"
      ? { action: carAction, confirmed: carConfirmed, location: carLocation, provider: carProvider || null, time: startTime || null }
      : item.details as Record<string, Json>;
    const saved = await mutation.mutateAsync({
      details: details as never, endTime, id: item.id, notes, startTime, title, tripId: item.trip_id, type,
    });
    onSaved(saved);
    setOpen(false);
  }

  return (
    <div className="grid gap-4 border-t bg-muted/20 p-4 md:grid-cols-2">
      <div className="space-y-1.5 md:col-span-2"><Label htmlFor={`title-${item.id}`}>Title</Label><Input id={`title-${item.id}`} onChange={(event) => setTitle(event.target.value)} value={title} /></div>
      <div className="space-y-1.5"><Label htmlFor={`type-${item.id}`}>Type</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" id={`type-${item.id}`} onChange={(event) => setType(event.target.value as ItineraryItem["type"])} value={type}>{itineraryItemTypes.map((value) => <option key={value} value={value}>{typeLabels[value]}</option>)}</select></div>
      <div className="space-y-1.5"><Label htmlFor={`start-${item.id}`}>Start time (optional)</Label><Input id={`start-${item.id}`} onChange={(event) => setStartTime(event.target.value)} type="time" value={startTime} /></div>
      <div className="space-y-1.5"><Label htmlFor={`end-${item.id}`}>End time (optional)</Label><Input id={`end-${item.id}`} onChange={(event) => setEndTime(event.target.value)} type="time" value={endTime} /></div>
      {type === "car_rental" ? <>
        <div className="space-y-1.5"><Label htmlFor={`action-${item.id}`}>Action</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" id={`action-${item.id}`} onChange={(event) => setCarAction(event.target.value as CarRentalDetails["action"])} value={carAction}><option value="pickup">Pickup</option><option value="return">Return</option></select></div>
        <div className="space-y-1.5"><Label htmlFor={`location-${item.id}`}>Location</Label><Input id={`location-${item.id}`} onChange={(event) => setCarLocation(event.target.value)} value={carLocation} /></div>
        <div className="space-y-1.5"><Label htmlFor={`provider-${item.id}`}>Provider (optional)</Label><Input id={`provider-${item.id}`} onChange={(event) => setCarProvider(event.target.value)} value={carProvider} /></div>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input checked={carConfirmed} onChange={(event) => setCarConfirmed(event.target.checked)} type="checkbox" />Confirmed</label>
      </> : null}
      <div className="space-y-1.5 md:col-span-2"><Label htmlFor={`notes-${item.id}`}>Notes</Label><Textarea id={`notes-${item.id}`} onChange={(event) => setNotes(event.target.value)} value={notes} /></div>
      {mutation.error ? <p className="text-sm text-destructive md:col-span-2" role="alert">{mutation.error.message}</p> : null}
      <div className="flex gap-2 md:col-span-2"><Button disabled={mutation.isPending} onClick={save} type="button">{mutation.isPending ? "Saving…" : "Save details"}</Button><Button onClick={() => setOpen(false)} type="button" variant="ghost">Cancel</Button></div>
    </div>
  );
}
