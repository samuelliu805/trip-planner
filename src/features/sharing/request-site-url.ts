import { headers } from "next/headers";

import { siteUrlFromHeaders } from "./site-url";

export async function getRequestSiteUrl() {
  return siteUrlFromHeaders(await headers());
}
