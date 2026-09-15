export const dynamic = "force-dynamic";

export function GET() {
  const release = process.env.VERCEL_GIT_COMMIT_SHA;
  const headers: HeadersInit = { "Cache-Control": "no-store" };
  if (release && /^[0-9a-f]{40}$/i.test(release)) {
    headers["X-Trip-Planner-Release"] = release;
  }

  return Response.json(
    { status: "ok" },
    {
      headers,
      status: 200,
    },
  );
}
