import assert from "node:assert/strict";
import test from "node:test";

import { fetchIdeaPageMetadata, parseIdeaPageMetadata } from "./idea-page-metadata.ts";

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
