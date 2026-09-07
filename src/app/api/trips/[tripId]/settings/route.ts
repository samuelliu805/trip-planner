import { NextResponse } from "next/server";

import { tripIdSchema } from "@/features/trips/schema";
import { getAuthProvider, getTripRepository } from "@/platform/composition/server";

export async function GET(_request: Request, context: { params: Promise<{ tripId: string }> }) {
  const user = await getAuthProvider().getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = tripIdSchema.safeParse((await context.params).tripId);
  if (!parsed.success) return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  const trip = await getTripRepository().getById(parsed.data);
  if (!trip) return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  return NextResponse.json({ trip });
}
