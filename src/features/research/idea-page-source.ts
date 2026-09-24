import { isIP } from "node:net";

const providerDomains = [
  "airbnb.com",
  "booking.com",
  "trip.com",
  "ctrip.com",
  "fliggy.com",
  "kayak.com",
  "skyscanner.com",
  "agoda.com",
  "hilton.com",
  "hilton.com.cn",
  "marriott.com",
  "marriott.com.cn",
  "ihg.com",
  "ihg.com.cn",
  "hyatt.com",
  "tujia.com",
  "hertz.com",
  "enterprise.com",
  "avis.com",
  "budget.com",
  "sixt.com",
  "europcar.com",
  "zuzuche.com",
  "zuche.com",
  "meituan.com",
  "dianping.com",
  "amtrak.com",
  "eurail.com",
  "interrail.com",
  "sncf-connect.com",
  "sbb.ch",
  "omio.com",
  "12306.cn",
];

function providerDomain(host: string): string | null {
  if (
    [
      "google.com",
      "www.google.com",
      "maps.google.com",
      "flights.google.com",
      "maps.app.goo.gl",
    ].includes(host)
  )
    return "google.com";
  if (host === "abnb.me") return "airbnb.com";
  return providerDomains.find((domain) => host === domain || host.endsWith(`.${domain}`)) ?? null;
}

function sameProvider(first: string, second: string) {
  return (
    first === second ||
    [first, second].every((provider) => ["eurail.com", "interrail.com"].includes(provider))
  );
}

export function approvedIdeaPageUrl(
  value: string,
  provider?: string,
): { url: URL; provider: string } | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const domain = providerDomain(host);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      isIP(host) ||
      !domain ||
      (provider && !sameProvider(provider, domain)) ||
      value.length > 2048
    )
      return null;
    return { url, provider: domain };
  } catch {
    return null;
  }
}
