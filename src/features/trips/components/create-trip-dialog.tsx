"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreateTripForm } from "@/features/trips/components/create-trip-form";

export function CreateTripDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="min-h-11">
          <Plus aria-hidden="true" className="size-4" /> New trip
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Create Trip</DialogTitle>
          <DialogDescription className="sr-only">
            Create a trip with dates, timezone, and currency.
          </DialogDescription>
        </DialogHeader>
        <CreateTripForm />
      </DialogContent>
    </Dialog>
  );
}
