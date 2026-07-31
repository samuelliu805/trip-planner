"use client";

import { Bike, BusFront, CableCar, CarFront, CarTaxiFront, Footprints, Plane, Ship, TrainFront, TramFront, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateItineraryItem, useDeleteItineraryItem, useUpdateItineraryItem } from "@/features/itinerary/queries";
import { normalizeTransportMode, transportModeLabels, transportModes, type CarRentalDetails, type ItineraryItem, type ItineraryItemType, type TransportMode } from "@/features/itinerary/types";
import type { Json } from "@/types/database";

type PlannerItemFormProps = {
  dayId: string;
  item?: ItineraryItem;
  onCancel: () => void;
  onError: (message: string) => void;
  onSaved: (item: ItineraryItem) => void;
  tripId: string;
  type: ItineraryItemType;
  unavailableTransportModes?: TransportMode[];
  variantId: string;
};

const itemCopy: Record<ItineraryItemType, { label: string; placeholder: string }> = {
  activity: { label: "Activity", placeholder: "e.g. Louvre Museum" },
  car_rental: { label: "Car rental", placeholder: "" },
  flight: { label: "Flight", placeholder: "e.g. UA 238 to Tokyo" },
  hotel: { label: "Hotel", placeholder: "e.g. Park Hotel Tokyo" },
  location: { label: "City", placeholder: "e.g. Paris" },
  meal: { label: "Meal", placeholder: "e.g. Dinner at Septime" },
  note: { label: "Note", placeholder: "Add a reminder or detail" },
  train: { label: "Train", placeholder: "e.g. Eurostar to Paris" },
  transport: { label: "Transport", placeholder: "e.g. Airport to city center" },
};

const transportModeIcons: Partial<Record<TransportMode, LucideIcon>> = { bike: Bike, bus: BusFront, cable_car: CableCar, ferry: Ship, flight: Plane, motorcycle: Bike, rideshare: CarFront, self_driving: CarFront, shuttle: BusFront, subway: TrainFront, taxi: CarTaxiFront, train: TrainFront, tram: TramFront, walk: Footprints };

export function PlannerItemForm({ dayId, item, onCancel, onError, onSaved, tripId, type, unavailableTransportModes = [], variantId }: PlannerItemFormProps) {
  const existingCar = item?.type === "car_rental" ? item.details as Partial<CarRentalDetails> : {};
  const existingDetails = (item?.details as Record<string, string> | undefined) ?? {};
  const [title, setTitle] = useState(item?.title ?? "");
  const [startTime, setStartTime] = useState(item?.start_time?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(item?.end_time?.slice(0, 5) ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [bookingUrl, setBookingUrl] = useState(item?.booking_url ?? "");
  const [carAction, setCarAction] = useState<CarRentalDetails["action"]>(existingCar.action ?? "pickup");
  const [address, setAddress] = useState(existingCar.address ?? existingDetails.address ?? "");
  const [location, setLocation] = useState(existingDetails.location ?? "");
  const [carProvider, setCarProvider] = useState(existingCar.provider ?? "");
  const existingTransportMode = normalizeTransportMode(existingDetails.mode);
  const availableTransportModes = transportModes.filter((mode) => (item?.type === "transport" && mode === existingTransportMode) || !unavailableTransportModes.includes(mode));
  const [transportMode, setTransportMode] = useState<TransportMode>(item?.type === "transport" ? existingTransportMode : availableTransportModes[0] ?? "train");
  const createMutation = useCreateItineraryItem(tripId);
  const updateMutation = useUpdateItineraryItem(tripId);
  const deleteMutation = useDeleteItineraryItem(tripId);
  const titleRef = useRef<HTMLInputElement>(null);
  const pending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const error = createMutation.error ?? updateMutation.error ?? deleteMutation.error;

  useEffect(() => {
    const frame = requestAnimationFrame(() => titleRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  function save() {
    const savedTitle = type === "car_rental" ? (carAction === "pickup" ? "Pickup" : "Return") : type === "transport" ? transportModeLabels[transportMode] : title.trim();
    if (pending || !savedTitle) return;
    const details: Record<string, Json> = type === "car_rental" ? { action: carAction, address: address || null, provider: carProvider || null }
      : type === "hotel" ? { address: address || null }
      : type === "meal" ? { location: location || null }
      : type === "transport" ? { location: location || null, mode: transportMode }
      : type === "activity" ? { location: location || null }
      : {};
    const supportsRange = ["location", "activity"].includes(type);
    const supportsOneTime = ["car_rental", "meal"].includes(type);
    const supportsLink = !["location", "note"].includes(type);
    const callbacks = { onError: (mutationError: Error) => onError(mutationError.message), onSuccess: onSaved };
    const values = { bookingUrl: supportsLink ? bookingUrl : "", details: details as never, endTime: supportsRange ? endTime : "", notes: type === "note" ? "" : notes, startTime: supportsRange || supportsOneTime ? startTime : "", title: savedTitle, tripId, type };
    if (item) updateMutation.mutate({ ...values, id: item.id }, callbacks);
    else createMutation.mutate({ ...values, dayId, variantId }, callbacks);
    onCancel();
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

  const copy = itemCopy[type];
  const locationLabel = type === "hotel" || type === "car_rental" ? "Address" : type === "transport" ? "Route / location" : "Location";
  const showsLocation = ["activity", "transport", "hotel", "car_rental", "meal"].includes(type);
  const locationValue = type === "hotel" || type === "car_rental" ? address : location;
  const setLocationValue = type === "hotel" || type === "car_rental" ? setAddress : setLocation;
  const linkLabel = type === "hotel" ? "Hotel link" : type === "meal" ? "Restaurant link" : type === "car_rental" ? "Rental link" : type === "activity" ? "Activity link" : type === "transport" ? "Transport link" : "Link";

  return <form className="space-y-4" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }} onSubmit={(event) => { event.preventDefault(); save(); }}>
    {type === "car_rental" ? <div className="space-y-1.5"><Label htmlFor={`car-action-${item?.id ?? dayId}`}>Pickup or return</Label><Select onValueChange={(value) => setCarAction(value as CarRentalDetails["action"])} value={carAction}><SelectTrigger id={`car-action-${item?.id ?? dayId}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pickup">Pickup</SelectItem><SelectItem value="return">Return</SelectItem></SelectContent></Select></div> : type === "transport" ? <div className="space-y-1.5"><Label htmlFor={`transport-mode-${item?.id ?? dayId}`}>Transport</Label><Select onValueChange={(value) => setTransportMode(value as TransportMode)} value={transportMode}><SelectTrigger autoFocus id={`transport-mode-${item?.id ?? dayId}`}><SelectValue /></SelectTrigger><SelectContent>{availableTransportModes.map((mode) => { const ModeIcon = transportModeIcons[mode] ?? CarFront; return <SelectItem key={mode} value={mode}><span className="flex items-center gap-2"><ModeIcon className="size-4 text-muted-foreground" />{transportModeLabels[mode]}</span></SelectItem>; })}</SelectContent></Select></div> : <div className="space-y-1.5"><Label htmlFor={`item-title-${item?.id ?? dayId}-${type}`}>{copy.label}</Label><Input autoFocus id={`item-title-${item?.id ?? dayId}-${type}`} onChange={(event) => setTitle(event.target.value)} placeholder={copy.placeholder} ref={titleRef} value={title} /></div>}
    {showsLocation ? <div className="space-y-1.5"><Label htmlFor={`item-location-${item?.id ?? dayId}-${type}`}>{locationLabel} <span className="font-normal text-muted-foreground">optional</span></Label><Input id={`item-location-${item?.id ?? dayId}-${type}`} onChange={(event) => setLocationValue(event.target.value)} placeholder={type === "transport" ? "e.g. SFO → Downtown" : type === "meal" ? "Restaurant or neighborhood" : type === "activity" ? "Venue or address" : "Street address"} value={locationValue} /></div> : null}
    {type === "car_rental" ? <div className="space-y-1.5"><Label htmlFor={`car-provider-${item?.id ?? dayId}`}>Rental company <span className="font-normal text-muted-foreground">optional</span></Label><Input id={`car-provider-${item?.id ?? dayId}`} onChange={(event) => setCarProvider(event.target.value)} placeholder="e.g. Sixt" value={carProvider} /></div> : null}
    {["location", "activity"].includes(type) ? <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor={`item-start-${item?.id ?? dayId}-${type}`}>{type === "location" ? "Arrive" : "Start time"} <span className="font-normal text-muted-foreground">optional</span></Label><div className="relative"><Input className="pr-9" id={`item-start-${item?.id ?? dayId}-${type}`} onChange={(event) => setStartTime(event.target.value)} type="time" value={startTime} />{startTime ? <button aria-label="Clear start time" className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setStartTime("")} tabIndex={-1} type="button"><X className="size-3.5" /></button> : null}</div></div><div className="space-y-1.5"><Label htmlFor={`item-end-${item?.id ?? dayId}-${type}`}>{type === "location" ? "Leave" : "End time"} <span className="font-normal text-muted-foreground">optional</span></Label><div className="relative"><Input className="pr-9" id={`item-end-${item?.id ?? dayId}-${type}`} onChange={(event) => setEndTime(event.target.value)} type="time" value={endTime} />{endTime ? <button aria-label="Clear end time" className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setEndTime("")} tabIndex={-1} type="button"><X className="size-3.5" /></button> : null}</div></div></div> : null}
    {["car_rental", "meal"].includes(type) ? <div className="space-y-1.5"><Label htmlFor={`item-time-${item?.id ?? dayId}-${type}`}>{type === "meal" ? "Meal time" : `${carAction === "pickup" ? "Pickup" : "Return"} time`} <span className="font-normal text-muted-foreground">optional</span></Label><Input id={`item-time-${item?.id ?? dayId}-${type}`} onChange={(event) => setStartTime(event.target.value)} type="time" value={startTime} /></div> : null}
    {!["location", "note"].includes(type) ? <div className="space-y-1.5"><Label htmlFor={`item-booking-${item?.id ?? dayId}-${type}`}>{linkLabel} <span className="font-normal text-muted-foreground">optional</span></Label><Input id={`item-booking-${item?.id ?? dayId}-${type}`} onChange={(event) => setBookingUrl(event.target.value)} placeholder="https://" type="url" value={bookingUrl} /></div> : null}
    {type !== "note" ? <div className="space-y-1.5"><Label htmlFor={`item-notes-${item?.id ?? dayId}-${type}`}>{copy.label} notes <span className="font-normal text-muted-foreground">optional</span></Label><Textarea id={`item-notes-${item?.id ?? dayId}-${type}`} onChange={(event) => setNotes(event.target.value)} placeholder={`Add ${copy.label.toLowerCase()} details`} value={notes} /></div> : null}
    {error ? <p className="text-sm text-destructive" role="alert">{error.message}</p> : null}
    <div className="flex items-center justify-between gap-2">
      <div>{item ? <AlertDialog><AlertDialogTrigger asChild><Button disabled={pending} size="sm" type="button" variant="ghost">Delete</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete “{item.title}”?</AlertDialogTitle><AlertDialogDescription>This removes the item from the trip. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={remove}>Delete item</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}</div>
      <div className="flex gap-2"><Button onClick={onCancel} size="sm" type="button" variant="ghost">Cancel</Button><Button disabled={pending || (!["car_rental", "transport"].includes(type) && !title.trim())} size="sm" type="submit">{pending ? "Saving…" : item ? "Save" : "Add item"}</Button></div>
    </div>
  </form>;
}
