import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthProvider } from "@/platform/composition/server";
import { getItineraryItem } from "@/features/itinerary/data";

export async function GET(_request: Request, context: { params: Promise<{ itemId: string }> }) {
  if (!(await getAuthProvider().getCurrentUser()))
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = z.uuid().safeParse((await context.params).itemId);
  if (!parsed.success) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  const { data: item } = await getItineraryItem(parsed.data);
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  return NextResponse.json({ item });
}
