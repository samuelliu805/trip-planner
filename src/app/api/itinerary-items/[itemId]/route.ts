import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthProvider, getRelationalDatabase } from "@/platform/composition/server";

export async function GET(_request: Request, context: { params: Promise<{ itemId: string }> }) {
  if (!(await getAuthProvider().getCurrentUser()))
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = z.uuid().safeParse((await context.params).itemId);
  if (!parsed.success) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  const database = await getRelationalDatabase();
  const { data: item, error } = await database
    .from("itinerary_items")
    .select("*")
    .eq("id", parsed.data)
    .maybeSingle();
  if (error || !item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  const { data: links } = await database
    .from("itinerary_item_links")
    .select("*")
    .eq("item_id", parsed.data)
    .order("sort_order");
  return NextResponse.json({ item: { ...item, links: links ?? [] } });
}
