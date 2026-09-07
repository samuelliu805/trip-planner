import { NextResponse } from "next/server";

import { tripIdSchema } from "@/features/trips/schema";
import { getAuthProvider, getTripRepository } from "@/platform/composition/server";

export async function GET(_request: Request, context: { params: Promise<{ tripId: string }> }) {
  if (!(await getAuthProvider().getCurrentUser()))
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = tripIdSchema.safeParse((await context.params).tripId);
  if (!parsed.success) return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  try {
    return NextResponse.json({ members: await getTripRepository().listMembers(parsed.data) });
  } catch {
    return NextResponse.json({ error: "Trip members could not be loaded." }, { status: 403 });
  }
}
