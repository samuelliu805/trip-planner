import { proxyAmapSecurityRequest } from "@/lib/providers/amap/security/proxy-core";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyAmapSecurityRequest(request, path, {
    securityCode: process.env.AMAP_JS_SECURITY_CODE ?? "",
  });
}
