import assert from "node:assert/strict";
import test from "node:test";

import { fetchIdeaPageMetadata, parseIdeaPageMetadata } from "./idea-page-metadata.ts";
import { propertyTitleFromIdeaSourceUrl } from "./idea-provider-url.ts";
import { enrichFlightTimes } from "./idea-page-flight.ts";

test("uses declared Flight times only for the matching booked leg", () => {
  const html = `<script type="application/ld+json">{"@graph":[
    {"@type":"Flight","flightNumber":"388","airline":{"iataCode":"DL"},
      "departureAirport":{"iataCode":"PVG"},"arrivalAirport":{"iataCode":"DTW"},
      "departureTime":"2026-12-22T08:35:00+08:00",
      "arrivalTime":"2026-12-22T09:40:00-05:00"}
  ]}</script>`;
  const page = parseIdeaPageMetadata(html, "google.com");
  const selected = [
    {
      origin: "PVG",
      destination: "DTW",
      departureDate: "2026-12-22",
      carrier: "DL",
      serviceNumber: "388",
    },
    {
      origin: "DTW",
      destination: "EWR",
      departureDate: "2026-12-22",
      carrier: "DL",
      serviceNumber: "2573",
    },
  ];
  const enriched = enrichFlightTimes(selected, page.segments);
  assert.equal(enriched?.[0].departureTime, "08:35");
  assert.equal(enriched?.[0].arrivalTime, "09:40");
  assert.equal(enriched?.[1].departureTime, undefined);
});

test("derives Booking and Hilton property titles synchronously from their URLs", () => {
  assert.equal(
    propertyTitleFromIdeaSourceUrl(
      "https://www.booking.com/hotel/jp/kobe-bay-sheraton-hotel-and-towers.zh-cn.html?checkin=2026-12-24&checkout=2026-12-26",
    ),
    "Kobe Bay Sheraton Hotel and Towers",
  );
  assert.equal(
    propertyTitleFromIdeaSourceUrl(
      "https://www.hilton.com/en/hotels/lasflgv-hilton-grand-vacations-club-flamingo-las-vegas/",
    ),
    "Hilton Grand Vacations Club Flamingo Las Vegas",
  );
  assert.equal(propertyTitleFromIdeaSourceUrl("https://example.com/hotel/example"), null);
});

test("Trip.com hotel detail metadata identifies the selected property by hotel ID", () => {
  const url = new URL("https://hk.trip.com/hotels/detail/?cityEnName=Tokyo&hotelId=12255760");
  const html = `<script>self.__next_f.push([1,"{\\"keywords\\":\\"銀座名鐵穆瑟酒店\\",\\"links\\":[{\\"href\\":\\"https://www.trip.com/hotels/tokyo-hotel-detail-12255760/hotel-musse-ginza-meitetsu/\\"}]}" ])</script>`;
  assert.equal(parseIdeaPageMetadata(html, "trip.com", url).title, "Hotel Musse Ginza Meitetsu");
  assert.equal(
    parseIdeaPageMetadata(
      html,
      "trip.com",
      new URL("https://hk.trip.com/hotels/detail/?hotelId=999"),
    ).title,
    null,
  );
});

test("reads a public Airbnb listing title and locality from provider metadata", () => {
  const html = `<html><head>
    <meta property="og:title" content="Home in San Francisco · 1 bedroom">
    <meta property="og:description" content="Private SF Suite w/ Bath | Steps to Muni/BART">
    <title>Private SF Suite w/ Bath - Airbnb</title>
    <script type="application/ld+json">{"@type":"LodgingBusiness","name":"Private SF Suite w/ Bath | Steps to Muni/BART","address":{"addressLocality":"San Francisco"}}</script>
  </head></html>`;
  assert.deepEqual(parseIdeaPageMetadata(html, "airbnb.com"), {
    title: "Private SF Suite w/ Bath | Steps to Muni/BART",
    locationText: "San Francisco",
    priceAmount: null,
    priceCurrency: null,
    status: "readable",
  });
});

test("reads a public booking price when the page declares its currency", () => {
  assert.deepEqual(
    parseIdeaPageMetadata(
      '<meta property="og:title" content="Hotel Example &amp; Spa"><meta name="description" content="Rooms from $150">',
      "booking.com",
    ),
    {
      title: "Hotel Example & Spa",
      locationText: null,
      priceAmount: 150,
      priceCurrency: "USD",
      status: "readable",
    },
  );
});

test("reads JSON-LD and embedded provider prices without confusing separators", () => {
  assert.deepEqual(
    parseIdeaPageMetadata(
      `<script type="application/ld+json">{"@type":"Hotel","name":"Alpine House","offers":{"@type":"Offer","price":"1.234,50","priceCurrency":"EUR"}}</script>`,
      "booking.com",
    ),
    {
      title: "Alpine House",
      locationText: null,
      priceAmount: 1234.5,
      priceCurrency: "EUR",
      status: "readable",
    },
  );
  assert.deepEqual(
    parseIdeaPageMetadata(
      `<meta property="og:title" content="Room"><script>window.data={"totalPrice":"7000","priceCurrency":"CNY"}</script>`,
      "trip.com",
    ),
    {
      title: "Room",
      locationText: null,
      priceAmount: 7000,
      priceCurrency: "CNY",
      status: "readable",
    },
  );
});

test("fetches only approved HTTPS providers and blocks cross-provider redirects", async () => {
  const requests: string[] = [];
  const fetchPage: typeof fetch = async (input) => {
    requests.push(String(input));
    return new Response('<meta property="og:title" content="Public room">', {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };
  assert.deepEqual(
    await fetchIdeaPageMetadata("https://www.booking.com/hotel/us/example.html", fetchPage),
    {
      title: "Public room",
      locationText: null,
      priceAmount: null,
      priceCurrency: null,
      status: "readable",
    },
  );
  assert.equal(requests.length, 1);
  assert.equal(
    (await fetchIdeaPageMetadata("https://www.xiaohongshu.com/explore/sample", fetchPage)).status,
    "unsupported",
  );
  assert.equal(
    (await fetchIdeaPageMetadata("http://127.0.0.1/private", fetchPage)).status,
    "unsupported",
  );
  assert.equal(
    (await fetchIdeaPageMetadata("https://booking.com.evil.test/hotel", fetchPage)).status,
    "unsupported",
  );
  assert.equal(requests.length, 1);
  const redirect: typeof fetch = async () =>
    new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
  assert.equal(
    (await fetchIdeaPageMetadata("https://www.booking.com/hotel/us/example.html", redirect)).status,
    "unavailable",
  );
  const shortLink: typeof fetch = async (input) =>
    String(input).includes("abnb.me")
      ? new Response(null, {
          status: 302,
          headers: { location: "https://www.airbnb.com/rooms/38158914" },
        })
      : new Response('<meta property="og:description" content="Quiet apartment">', {
          headers: { "content-type": "text/html" },
        });
  assert.equal(
    (await fetchIdeaPageMetadata("https://abnb.me/example", shortLink)).title,
    "Quiet apartment",
  );
});

test("fetches approved rental and rail pages and allows Eurail's official redirect", async () => {
  const requests: string[] = [];
  const fetchPage: typeof fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("eurail.com"))
      return new Response(null, {
        status: 302,
        headers: { location: "https://www.interrail.com/en-int/book-reservations" },
      });
    return new Response('<meta property="og:title" content="Public booking details">', {
      headers: { "content-type": "text/html" },
    });
  };
  for (const url of [
    "https://www.avis.com/en/reservation",
    "https://www.hertz.com/us/en",
    "https://www.enterprise.com/en/car-rental/reservation/start.html",
    "https://www.omio.com/trains/paris/berlin",
    "https://www.eurail.com/en/book-reservations",
    "https://www.trip.com/trains/",
  ])
    assert.equal((await fetchIdeaPageMetadata(url, fetchPage)).status, "readable", url);
  assert.ok(requests.some((url) => url.includes("interrail.com")));
});

test("generic rail and rental home titles do not masquerade as booking details", async () => {
  const shell: typeof fetch = async () =>
    new Response("<title>Book seat reservations</title>", {
      headers: { "content-type": "text/html" },
    });
  assert.equal(
    (await fetchIdeaPageMetadata("https://www.eurail.com/en/book-reservations", shell)).status,
    "unavailable",
  );
  assert.equal(
    (
      await fetchIdeaPageMetadata(
        "https://www.eurail.com/en/book-reservations?origin=Paris&destination=Berlin&date=2026-11-21",
        shell,
      )
    ).title,
    "Paris → Berlin",
  );
});

test("stops reading after 256 KiB and ignores unavailable pages", async () => {
  const fetchPage: typeof fetch = async () =>
    new Response(`<meta property="og:title" content="Visible title">${"x".repeat(500_000)}`, {
      headers: { "content-type": "text/html" },
    });
  assert.equal(
    (await fetchIdeaPageMetadata("https://www.airbnb.com/rooms/38158914", fetchPage)).title,
    "Visible title",
  );
  const blocked: typeof fetch = async () => new Response("Access denied", { status: 403 });
  assert.equal(
    (await fetchIdeaPageMetadata("https://www.airbnb.com/rooms/38158914", blocked)).status,
    "unavailable",
  );
});

test("recovers Booking and Hilton property names from their canonical paths when blocked", async () => {
  const blocked: typeof fetch = async () => new Response("Access denied", { status: 403 });
  assert.deepEqual(
    await fetchIdeaPageMetadata(
      "https://www.booking.com/hotel/jp/kobe-bay-sheraton-hotel-and-towers.zh-cn.html?checkin=2026-12-24&checkout=2026-12-26",
      blocked,
    ),
    {
      title: "Kobe Bay Sheraton Hotel and Towers",
      locationText: null,
      priceAmount: null,
      priceCurrency: null,
      status: "readable",
    },
  );
  assert.deepEqual(
    await fetchIdeaPageMetadata(
      "https://www.hilton.com/en/hotels/lasflgv-hilton-grand-vacations-club-flamingo-las-vegas/",
      async () =>
        new Response("<title>Hilton Page Reference Code</title>", {
          headers: { "content-type": "text/html" },
        }),
    ),
    {
      title: "Hilton Grand Vacations Club Flamingo Las Vegas",
      locationText: null,
      priceAmount: null,
      priceCurrency: null,
      status: "readable",
    },
  );
});

test("provider shell titles cannot replace a property name recovered from the URL", async () => {
  const providerShell: typeof fetch = async (input) =>
    new Response(
      String(input).includes("booking.com")
        ? '<meta property="og:title" content="Booking.com: Hotels and more">'
        : '<meta property="og:title" content="Hilton Hotels official site">',
      { headers: { "content-type": "text/html" } },
    );

  assert.equal(
    (
      await fetchIdeaPageMetadata(
        "https://www.booking.com/hotel/jp/kobe-bay-sheraton-hotel-and-towers.zh-cn.html",
        providerShell,
      )
    ).title,
    "Kobe Bay Sheraton Hotel and Towers",
  );
  assert.equal(
    (
      await fetchIdeaPageMetadata(
        "https://www.hilton.com/en/hotels/lasflgv-hilton-grand-vacations-club-flamingo-las-vegas/",
        providerShell,
      )
    ).title,
    "Hilton Grand Vacations Club Flamingo Las Vegas",
  );
});
