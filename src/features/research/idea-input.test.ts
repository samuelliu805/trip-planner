import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalIdeaUrl,
  classifyIdeaInput,
  findDuplicateIdea,
  overrideIdeaClassification,
  parseReliableIdeaFields,
} from "./idea-input.ts";
import { ideaPlaceQuery } from "./idea-place-query.ts";
import { inferredRentalCompany } from "./idea-rental-company.ts";
import { researchItemInputFromForm } from "./research-item-form-values.ts";
import { createResearchItemSchema } from "./schema.ts";
import { ideaJourneyPreview } from "./idea-journey-preview.ts";
import { ideaJourneyDates } from "./idea-plan-dates.ts";
import type { ResearchItem } from "./types.ts";

test("classifies known booking URLs without inventing itinerary fields", () => {
  const cases = [
    ["https://www.google.com/travel/flights?hl=en", "flight"],
    ["https://www.booking.com/hotel/us/example.html", "stay"],
    ["https://www.enterprise.com/en/car-rental.html", "car"],
    ["分享：西湖骑行 https://www.xiaohongshu.com/explore/abc123", "activity"],
    ["https://www.google.com/maps/search/?api=1&query=West+Lake", "activity"],
    ["https://www.dianping.com/shop/123456", "activity"],
    ["https://i.meituan.com/awp/h5/deal/123456", "activity"],
    ["https://i.meituan.com/awp/h5/hotel-fe-oshotel/home/index.html", "stay"],
    ["https://www.booking.com/searchresults.html?ss=Paris", "stay"],
    ["https://www.airbnb.com/s/Paris--France/homes", "stay"],
    ["https://abnb.me/example", "stay"],
    ["https://www.agoda.com/search?textToSearch=Paris", "stay"],
    ["https://www.marriott.com/search/findHotels.mi", "stay"],
    ["https://www.ihg.com/hotels/us/en/find-hotels/hotel-search", "stay"],
    ["https://www.hyatt.com/shop/hotels", "stay"],
    ["https://www.tujia.com/hotel?location=杭州", "stay"],
    ["https://www.kayak.com/flights/SFO-JFK/2026-10-23", "flight"],
    ["https://sjipiao.fliggy.com/flight_search_result.htm", "flight"],
    ["https://www.skyscanner.com/transport/flights/sfo/jfk/261023", "flight"],
    ["https://www.hertz.com/rentacar/reservation/", "car"],
    ["https://www.avis.com/en/reservation", "car"],
    ["https://www.sixt.com/rent", "car"],
    [
      "https://www.united.com/en/us/flights?origin=SFO&destination=JFK&departureDate=2026-10-23",
      "flight",
    ],
    [
      "https://hotel.example/hotels/search?destination=Paris&checkin=2026-10-23&checkout=2026-10-25",
      "stay",
    ],
    [
      "https://rental.example/car-rental/search?pickupLocation=SFO&pickupDate=2026-10-23&returnDate=2026-10-25",
      "car",
    ],
  ] as const;
  for (const [input, kind] of cases) {
    const result = classifyIdeaInput(input);
    assert.equal(result.kind, kind);
    assert.equal(result.method, "url_rule");
    assert.equal(result.confidence, "high");
    assert.ok(result.sourceUrl?.startsWith("https://"));
    assert.deepEqual(
      Object.keys(result).sort(),
      ["confidence", "kind", "method", "provider", "sourceUrl"].sort(),
    );
  }
});

test("every rental and rail search provider can enter the correct Ideas flow", () => {
  const cases = [
    ["https://www.avis.com/en/home", "car"],
    ["https://www.hertz.com/us/en", "car"],
    ["https://www.hertz.cn/cn/zh/book/checkout", "car"],
    ["https://www.enterprise.com/en/home.html", "car"],
    ["https://www.europcar.com/en-us", "car"],
    ["https://www.budget.com/en/home", "car"],
    ["https://www.sixt.com/car-rental/", "car"],
    ["https://www.amtrak.com/home.html", "train"],
    ["https://www.eurail.com/en/book-reservations", "train"],
    ["https://www.sncf-connect.com/home/search", "train"],
    ["https://www.sbb.ch/en", "train"],
    ["https://www.omio.com/trains/paris/berlin", "train"],
    ["https://www.omio.com/app/search-frontend/journey/train/123/session/456", "train"],
    ["https://www.trip.com/trains/", "train"],
    ["https://m.ctrip.com/webapp/train/", "train"],
    ["https://www.12306.cn/index/", "train"],
  ] as const;
  for (const [url, expected] of cases) assert.equal(classifyIdeaInput(url).kind, expected, url);
});

test("actual provider booking formats recover route and dates without quote prices", () => {
  const avis = parseReliableIdeaFields(
    "https://www.avis.com/en/reservation/review-and-book?pickup_day=23&pickup_month=10&pickup_year=2026&return_day=31&return_month=10&return_year=2026&pickup_location_code=FCO&return_location_code=FCO&vehicle_code=SB",
  );
  assert.deepEqual(
    [avis.originText, avis.destinationText, avis.startDate, avis.endDate, avis.priceAmount],
    ["FCO", "FCO", "2026-10-23", "2026-10-31", undefined],
  );
  const hertz = parseReliableIdeaFields(
    "https://www.hertz.com/us/en/book/checkout?pdate=2026-10-30T12%3A00%3A00&ddate=2026-10-31T12%3A00%3A00&pid=MXPT51&did=MXPT51&sippCode=PFAR",
  );
  assert.deepEqual(
    [hertz.originText, hertz.destinationText, hertz.startDate, hertz.endDate],
    ["MXPT51", "MXPT51", "2026-10-30", "2026-10-31"],
  );
  const sixt = parseReliableIdeaFields(
    "https://www.sixt.com/betafunnel/#/offercheckout?zen_pu_title=Milan%20Airport%20Malpensa%20T1&zen_do_title=Milan%20Airport%20Malpensa%20T1&zen_pu_time=2026-09-26T10%3A00&zen_do_time=2026-09-30T10%3A00&zen_offer_id=GLAE-43294-43294",
  );
  assert.deepEqual(
    [
      sixt.originText,
      sixt.destinationText,
      sixt.startDate,
      sixt.endDate,
      sixt.startTime,
      sixt.endTime,
    ],
    [
      "Milan Airport Malpensa T1",
      "Milan Airport Malpensa T1",
      "2026-09-26",
      "2026-09-30",
      "10:00",
      "10:00",
    ],
  );
  const hertzCn = parseReliableIdeaFields(
    "https://www.hertz.cn/cn/zh/book/checkout?ddate=2026-10-24T20%3A00%3A00&did=LGWT51&pCountryCode=CN&pdate=2026-10-23T20%3A00%3A00&pid=LGWT51&selectedRateTotalRate=203.78&sippCode=FFAR",
  );
  assert.deepEqual(
    [
      hertzCn.originText,
      hertzCn.destinationText,
      hertzCn.startDate,
      hertzCn.endDate,
      hertzCn.startTime,
      hertzCn.endTime,
    ],
    ["LGWT51", "LGWT51", "2026-10-23", "2026-10-24", "20:00", "20:00"],
  );
  assert.equal(classifyIdeaInput("https://www.hertz.cn/cn/zh/book/checkout").provider, "Hertz");
  const tripHotel = parseReliableIdeaFields(
    "https://hk.trip.com/hotels/detail/?cityEnName=Tokyo&cityId=228&hotelId=12255760&checkIn=2026-10-17&checkOut=2026-10-19",
  );
  assert.deepEqual(
    [tripHotel.locationText, tripHotel.startDate, tripHotel.endDate],
    ["Tokyo", "2026-10-17", "2026-10-19"],
  );
  const tripFlight = parseReliableIdeaFields(
    "https://hk.trip.com/flights/passenger?triptype=RT&dcity=bjs&acity=lon&dairport=pek&aairport=lhr&ddate=2026-11-17&rdate=2026-11-20",
  );
  assert.deepEqual(
    [
      tripFlight.originText,
      tripFlight.destinationText,
      tripFlight.startDate,
      tripFlight.endDate,
      tripFlight.journeyType,
    ],
    ["pek", "lhr", "2026-11-17", "2026-11-20", "round_trip"],
  );
  const first = canonicalIdeaUrl(
    "https://www.sixt.com/betafunnel/#/offercheckout?zen_pu_time=2026-09-26T10%3A00&zen_offer_id=first&zen_session_id=one",
  );
  const second = canonicalIdeaUrl(
    "https://www.sixt.com/betafunnel/#/offercheckout?zen_pu_time=2026-09-26T10%3A00&zen_offer_id=second&zen_session_id=two",
  );
  assert.notEqual(first, second);
});

test("map searches use a place name and area without losing either", () => {
  assert.equal(
    ideaPlaceQuery("Hotel Musse Ginza Meitetsu", "Tokyo"),
    "Hotel Musse Ginza Meitetsu Tokyo",
  );
  assert.equal(ideaPlaceQuery("Hilton Tokyo", "Tokyo"), "Hilton Tokyo");
  assert.equal(ideaPlaceQuery(null, "Milan Airport Malpensa T1"), "Milan Airport Malpensa T1");
});

test("older rental Ideas show their provider in place of an auto-generated route title", () => {
  const oldSixt = {
    category: "rental",
    destination_text: "Milan Airport Malpensa T1",
    origin_text: "Milan Airport Malpensa T1",
    source_url: "https://www.sixt.com/betafunnel/#/offercheckout?zen_offer_id=HTAR-43294-43294",
    title: "Car · Milan Airport Malpensa T1",
  } as const;
  assert.equal(inferredRentalCompany(oldSixt), "SIXT");
  assert.equal(
    inferredRentalCompany({ ...oldSixt, title: "租车 · Milan Airport Malpensa T1" }),
    "SIXT",
  );
  assert.equal(inferredRentalCompany({ ...oldSixt, title: "My Milan rental" }), null);
  assert.equal(
    inferredRentalCompany({
      ...oldSixt,
      destination_text: "LGWT51",
      origin_text: "LGWT51",
      source_url: "https://www.hertz.cn/cn/zh/book/checkout?pid=LGWT51&did=LGWT51",
      title: "Car · LGWT51",
    }),
    "Hertz",
  );
});

test("rental and rail links preserve only explicit route and date details", () => {
  const cases = [
    [
      "https://www.avis.com/en/reservation?pickupLocation=LAX&returnLocation=SFO&pickupDate=2026-11-21&returnDate=2026-11-28",
      ["LAX", "SFO", "2026-11-21", "2026-11-28"],
    ],
    [
      "https://www.hertz.com/us/en?pickupLocation=LAX&returnLocation=SFO&pickupDate=11/21/2026&returnDate=11/28/2026",
      ["LAX", "SFO", "2026-11-21", "2026-11-28"],
    ],
    [
      "https://www.enterprise.com/en/car-rental/reservation/start.html?pickUpLocation.searchCriteria=LAX&dropOffLocation.searchCriteria=SFO&pickUpDate=20261121&dropOffDate=20261128",
      ["LAX", "SFO", "2026-11-21", "2026-11-28"],
    ],
    [
      "https://www.omio.com/trains/paris/berlin?date=2026-11-21",
      ["paris", "berlin", "2026-11-21", null],
    ],
    [
      "https://www.sbb.ch/en?stops%5B0%5D%5Bvalue%5D=Zurich&stops%5B1%5D%5Bvalue%5D=Bern&date=2026-11-21",
      ["Zurich", "Bern", "2026-11-21", null],
    ],
    [
      "https://www.trip.com/trains/?departStation=Paris&arriveStation=Lyon&departDate=2026-11-21",
      ["Paris", "Lyon", "2026-11-21", null],
    ],
  ] as const;
  for (const [url, expected] of cases) {
    const fields = parseReliableIdeaFields(url);
    assert.deepEqual(
      [fields.originText, fields.destinationText, fields.startDate, fields.endDate],
      expected,
      url,
    );
  }
});

test("natural language, unknown links, invalid links, and overrides", () => {
  assert.equal(classifyIdeaInput("想去西湖骑行").kind, "activity");
  assert.equal(classifyIdeaInput("北京到上海的机票").kind, "flight");
  assert.equal(classifyIdeaInput("https://example.com/something").kind, "unknown");
  assert.equal(
    classifyIdeaInput("https://airline.example/flights?origin=SFO&destination=JFK").kind,
    "unknown",
  );
  assert.equal(
    classifyIdeaInput(
      "https://airline.example/flights?origin=123&destination=456&departureDate=2026-10-23",
    ).kind,
    "unknown",
  );
  assert.equal(classifyIdeaInput("https://").error, "invalid_url");
  assert.equal(classifyIdeaInput("ftp://example.com/file").error, "invalid_url");
  const overridden = overrideIdeaClassification(
    classifyIdeaInput("https://example.com/something"),
    "stay",
  );
  assert.equal(overridden.kind, "stay");
  assert.equal(overridden.method, "user");
});

test("canonical URLs remove tracking data while preserving booking parameters", () => {
  assert.equal(
    canonicalIdeaUrl("HTTPS://WWW.EXAMPLE.COM/path/?utm_source=app&date=2026-09-20#part"),
    "https://www.example.com/path?date=2026-09-20",
  );
  assert.equal(canonicalIdeaUrl("javascript:alert(1)"), null);
  assert.deepEqual(
    findDuplicateIdea("https://example.com/a?utm_source=x&date=2026-09-20", [
      { id: "existing", source_url: "https://example.com/a?date=2026-09-20" },
    ]),
    { id: "existing", source_url: "https://example.com/a?date=2026-09-20" },
  );
});

test("URL parsing keeps only explicit reliable route and date parameters", () => {
  assert.deepEqual(
    parseReliableIdeaFields(
      "https://www.trip.com/flights/showfarefirst?dcity=Beijing&acity=Shanghai&ddate=20260920",
    ),
    {
      originText: "Beijing",
      destinationText: "Shanghai",
      locationText: null,
      startDate: "2026-09-20",
      endDate: null,
    },
  );
  assert.deepEqual(
    parseReliableIdeaFields(
      "https://www.booking.com/hotel/us/example.html?checkin=2026-02-30&checkout=2026-03-03",
    ),
    {
      originText: null,
      destinationText: null,
      locationText: null,
      startDate: null,
      endDate: "2026-03-03",
    },
  );
  assert.deepEqual(parseReliableIdeaFields("https://www.xiaohongshu.com/explore/abc"), {
    originText: null,
    destinationText: null,
    locationText: null,
    startDate: null,
    endDate: null,
  });
  assert.deepEqual(parseReliableIdeaFields("https://example.com/?price=100&hotel=Example"), {
    originText: null,
    destinationText: null,
    locationText: null,
    startDate: null,
    endDate: null,
  });
});

test("Google Flights links expose only encoded search route and dates", () => {
  const officialRoundTrip =
    "https://www.google.com/travel/flights?tfs=CBwQARoeEgoyMDI2LTEwLTIzagcIARIDT1JEcgcIARIDTEFYGh4SCjIwMjYtMTAtMzBqBwgBEgNMQVhyBwgBEgNPUkRAAUgBcAGCAQsI____________AZgBAQ&tfu=KgIIAw";
  assert.deepEqual(parseReliableIdeaFields(officialRoundTrip), {
    originText: "ORD",
    destinationText: "LAX",
    locationText: null,
    startDate: "2026-10-23",
    endDate: "2026-10-30",
  });
  assert.deepEqual(
    parseReliableIdeaFields(
      "https://www.google.com/travel/flights?q=Flights%20from%20SFO%20to%20JFK%20on%202026-11-03%20returning%202026-11-10",
    ),
    {
      originText: "SFO",
      destinationText: "JFK",
      locationText: null,
      startDate: "2026-11-03",
      endDate: "2026-11-10",
    },
  );
  assert.deepEqual(parseReliableIdeaFields("https://www.google.com/travel/flights?hl=en"), {
    originText: null,
    destinationText: null,
    locationText: null,
    startDate: null,
    endDate: null,
  });
  assert.deepEqual(parseReliableIdeaFields("https://www.google.com/travel/flights?tfs=invalid"), {
    originText: null,
    destinationText: null,
    locationText: null,
    startDate: null,
    endDate: null,
  });
});

test("Google Flights booking links expose selected flights from nested tfs fields", () => {
  const booking =
    "https://www.google.com/travel/flights/booking?tfs=CBwQAhpJEgoyMDI2LTExLTIwIh8KA1BWRxIKMjAyNi0xMS0yMBoDSE5EKgJOSDIDOTcyagwIAhIIL20vMDZ3amZyDAgCEggvbS8wN2RmaxpJEgoyMDI2LTExLTI1Ih8KA0hORBIKMjAyNi0xMS0yNRoDUFZHKgJOSDIDOTY3agwIAhIIL20vMDdkZmtyDAgCEggvbS8wNndqZkABSAFwAYIBCwj___________8BmAEB&tfu=CmxDalJJUzJoMU1GazFaVGRZVVhkQlExaGFaMEZDUnkwdExTMHRMUzB0TFhCbVlteDFNMEZCUVVGQlIzRjVWSEpWUVd0WVVsVkJFZ1ZPU0RrMk54b0xDSW5PQWhBQ0dnTlZVMFE0SEhDSnpnST0SAggAIgMKATE";
  assert.deepEqual(parseReliableIdeaFields(booking), {
    originText: "PVG",
    destinationText: "HND",
    locationText: null,
    startDate: "2026-11-20",
    endDate: "2026-11-25",
    journeyType: "round_trip",
    priceAmount: 427.61,
    priceCurrency: "USD",
    segments: [
      {
        origin: "PVG",
        destination: "HND",
        departureDate: "2026-11-20",
        carrier: "NH",
        journeyIndex: 0,
        serviceNumber: "972",
      },
      {
        origin: "HND",
        destination: "PVG",
        departureDate: "2026-11-25",
        carrier: "NH",
        journeyIndex: 1,
        serviceNumber: "967",
      },
    ],
  });
});

test("SHA to SYD booking retains both connected directions without inventing clock times", () => {
  const url =
    "https://www.google.com/travel/flights/booking?tfs=CBwQAhqbARIKMjAyNi0xMi0yNSIgCgNTSEESCjIwMjYtMTItMjUaA0hBSyoCSFUyBDczMjAiHwoDSEFLEgoyMDI2LTEyLTI2GgNTWUQqAkhVMgM3NzUoAWoMCAMSCC9tLzBoc3FmagwIAhIIL20vMDZ3amZqDAgCEggvbS8wMTkxNGoHCAESA0NBTmoHCAESA0hLR3IMCAISCC9tLzA2eTU3GpsBEgoyMDI3LTAxLTAyIh8KA1NZRBIKMjAyNy0wMS0wMhoDSEFLKgJIVTIDNzc2IiAKA0hBSxIKMjAyNy0wMS0wMxoDU0hBKgJIVTIENzMxOSgBagwIAhIIL20vMDZ5NTdyDAgDEggvbS8waHNxZnIMCAISCC9tLzA2d2pmcgwIAhIIL20vMDE5MTRyBwgBEgNDQU5yBwgBEgNIS0dAAUgDYNCMAXABggELCP___________wGYAQGyAQkSBy9tLzBuMno&curr=CNY";
  const parsed = parseReliableIdeaFields(url);
  assert.deepEqual(
    [
      parsed.originText,
      parsed.destinationText,
      parsed.startDate,
      parsed.endDate,
      parsed.journeyType,
    ],
    ["SHA", "SYD", "2026-12-25", "2027-01-02", "round_trip"],
  );
  assert.deepEqual(
    parsed.segments?.map(({ origin, destination, departureDate, journeyIndex }) => [
      origin,
      destination,
      departureDate,
      journeyIndex,
    ]),
    [
      ["SHA", "HAK", "2026-12-25", 0],
      ["HAK", "SYD", "2026-12-26", 0],
      ["SYD", "HAK", "2027-01-02", 1],
      ["HAK", "SHA", "2027-01-03", 1],
    ],
  );
  assert.ok(
    parsed.segments?.every(
      (segment) =>
        !Object.hasOwn(segment, "departureTime") && !Object.hasOwn(segment, "arrivalTime"),
    ),
  );
});

test("saved and edited connecting round trips retain the turn and return departure", () => {
  const segments = [
    { origin: "SHA", destination: "HAK", departureDate: "2026-12-25", journeyIndex: 0 },
    { origin: "HAK", destination: "SYD", departureDate: "2026-12-26", journeyIndex: 0 },
    { origin: "SYD", destination: "HAK", departureDate: "2027-01-02", journeyIndex: 1 },
    { origin: "HAK", destination: "SHA", departureDate: "2027-01-03", journeyIndex: 1 },
  ];
  const tripId = "00000000-0000-4000-8000-000000000001";
  const saved = createResearchItemSchema.parse({
    category: "flight",
    destinationText: "SYD",
    endDate: "2027-01-02",
    journeyType: "round_trip",
    operationId: tripId,
    originText: "SHA",
    segments,
    startDate: "2026-12-25",
    title: "SHA → SYD",
    tripId,
  });
  assert.deepEqual(
    saved.segments.map((segment) => segment.journeyIndex),
    [0, 0, 1, 1],
  );
  const form = new FormData();
  form.set(
    "segments",
    JSON.stringify(
      segments.map((leg) => ({
        origin: leg.origin,
        destination: leg.destination,
        departureDate: leg.departureDate,
      })),
    ),
  );
  form.set("journeyType", "round_trip");
  const edited = researchItemInputFromForm({
    category: "flight",
    form,
    item: { destination_text: "HAK", end_date: "2027-01-03" } as ResearchItem,
    tripId,
  });
  assert.equal(edited.destinationText, "SYD");
  assert.equal(edited.endDate, "2027-01-02");
});

test("apply previews repair an old stopover destination and include the final arrival", () => {
  const item = {
    category: "flight",
    origin_text: "SHA",
    destination_text: "HAK",
    journey_type: "round_trip",
    title: "SHA return",
    start_date: "2026-12-25",
    end_date: "2027-01-03",
    segments: [
      { origin: "SHA", destination: "HAK", departureDate: "2026-12-25" },
      { origin: "HAK", destination: "SYD", departureDate: "2026-12-26" },
      { origin: "SYD", destination: "HAK", departureDate: "2027-01-02" },
      { origin: "HAK", destination: "SHA", departureDate: "2027-01-03", arrivalDate: "2027-01-03" },
    ],
  } as unknown as ResearchItem;
  assert.deepEqual(
    ideaJourneyPreview(item).map(({ origin, destination, departureDate }) => [
      origin,
      destination,
      departureDate,
    ]),
    [
      ["SHA", "SYD", "2026-12-25"],
      ["SYD", "SHA", "2027-01-02"],
    ],
  );
  assert.equal(ideaJourneyDates(item).at(-1), "2027-01-03");
});

test("explicit provider URL price and currency parameters are preserved", () => {
  const parsed = parseReliableIdeaFields(
    "https://www.booking.com/hotel/fr/example.html?checkin=2026-11-20&checkout=2026-11-25&price=1,234.50&currency=EUR",
  );
  assert.equal(parsed.priceAmount, 1234.5);
  assert.equal(parsed.priceCurrency, "EUR");
});

test("provider links recover only explicit place, route, and date fields", () => {
  const blank = {
    originText: null,
    destinationText: null,
    locationText: null,
    startDate: null,
    endDate: null,
  };
  const cases = [
    [
      "https://m.ctrip.com/webapp/flight/?dcity=北京&acity=上海&date=2026-10-23&rdate=2026-10-30",
      {
        originText: "北京",
        destinationText: "上海",
        startDate: "2026-10-23",
        endDate: "2026-10-30",
      },
    ],
    [
      "https://m.ctrip.com/webapp/hotels/hotelsearch/listPage?cityname=杭州&checkin=2026-10-23&checkout=2026-10-25",
      { locationText: "杭州", startDate: "2026-10-23", endDate: "2026-10-25" },
    ],
    [
      "https://sjipiao.fliggy.com/flight_search_result.htm?depCity=北京&arrCity=上海&depDate=2026-10-23&returnDate=2026-10-30",
      {
        originText: "北京",
        destinationText: "上海",
        startDate: "2026-10-23",
        endDate: "2026-10-30",
      },
    ],
    [
      "https://hotel.fliggy.com/hotel_list.htm?city=杭州&checkIn=2026-10-23&checkOut=2026-10-25",
      { locationText: "杭州", startDate: "2026-10-23", endDate: "2026-10-25" },
    ],
    [
      "https://www.kayak.com/flights/SFO-JFK/2026-10-23/2026-10-30",
      { originText: "SFO", destinationText: "JFK", startDate: "2026-10-23", endDate: "2026-10-30" },
    ],
    [
      "https://www.booking.com/searchresults.html?ss=Paris&checkin=2026-10-23&checkout=2026-10-25",
      { locationText: "Paris", startDate: "2026-10-23", endDate: "2026-10-25" },
    ],
    [
      "https://www.airbnb.com/s/Paris--France/homes?checkin=2026-10-23&checkout=2026-10-25",
      { locationText: "Paris, France", startDate: "2026-10-23", endDate: "2026-10-25" },
    ],
    [
      "https://www.hilton.com/en/search/?query=Paris&arrivalDate=2026-10-23&departureDate=2026-10-25",
      { locationText: "Paris", startDate: "2026-10-23", endDate: "2026-10-25" },
    ],
    [
      "https://www.marriott.com/search/findHotels.mi?destinationAddress.destination=Paris&fromDate=10%2F23%2F2026&toDate=10%2F25%2F2026",
      { locationText: "Paris", startDate: "2026-10-23", endDate: "2026-10-25" },
    ],
    [
      "https://www.ihg.com/hotels/us/en/find-hotels/hotel-search?qDest=Paris&qCiD=23&qCiMy=102026&qCoD=25&qCoMy=102026",
      { locationText: "Paris", startDate: "2026-10-23", endDate: "2026-10-25" },
    ],
    [
      "https://www.hyatt.com/shop/hotels?location=Paris&checkinDate=2026-10-23&checkoutDate=2026-10-25",
      { locationText: "Paris", startDate: "2026-10-23", endDate: "2026-10-25" },
    ],
    [
      "https://www.enterprise.com/en/car-rental/reservation/start.html?pickUpLocation.searchCriteria=SFO&dropOffLocation.searchCriteria=LAX&pickUpDate=2026-10-23&dropOffDate=2026-10-25",
      { originText: "SFO", destinationText: "LAX", startDate: "2026-10-23", endDate: "2026-10-25" },
    ],
    [
      "https://www.hertz.com/rentacar/reservation/?pickupLocation=SFO&returnLocation=LAX&pickupDate=2026-10-23&returnDate=2026-10-25",
      { originText: "SFO", destinationText: "LAX", startDate: "2026-10-23", endDate: "2026-10-25" },
    ],
    ["https://www.google.com/maps/search/?api=1&query=West+Lake", { locationText: "West Lake" }],
    ["https://www.google.com/maps/place/West+Lake/@30,120", { locationText: "West Lake" }],
    ["https://maps.google.com/?q=West+Lake", { locationText: "West Lake" }],
    [
      "https://www.kayak.com/hotels/Paris?destination=Paris&checkin=2026-10-23&checkout=2026-10-25",
      { locationText: "Paris", startDate: "2026-10-23", endDate: "2026-10-25" },
    ],
    [
      "https://www.skyscanner.com/transport/flights/sfo/jfk/261023",
      { originText: "SFO", destinationText: "JFK" },
    ],
    [
      "https://www.united.com/en/us/flights?origin=SFO&destination=JFK&departureDate=2026-10-23",
      { originText: "SFO", destinationText: "JFK", startDate: "2026-10-23" },
    ],
    [
      "https://hotel.example/hotels/search?destination=Paris&checkin=2026-10-23&checkout=2026-10-25",
      { locationText: "Paris", startDate: "2026-10-23", endDate: "2026-10-25" },
    ],
    [
      "https://rental.example/car-rental/search?pickupLocation=SFO&pickupDate=2026-10-23&returnDate=2026-10-25",
      { originText: "SFO", startDate: "2026-10-23", endDate: "2026-10-25" },
    ],
    [
      "https://i.meituan.com/awp/h5/hotel-fe-oshotel/home/index.html?cityName=杭州&checkIn=2026-10-23&checkOut=2026-10-25",
      { locationText: "杭州", startDate: "2026-10-23", endDate: "2026-10-25" },
    ],
  ] as const;
  for (const [url, fields] of cases)
    assert.deepEqual(parseReliableIdeaFields(url), { ...blank, ...fields }, url);
  for (const url of [
    "https://www.xiaohongshu.com/explore/abc123",
    "https://www.dianping.com/shop/123456",
    "https://maps.app.goo.gl/abc123",
    "https://example.com/?city=Paris&checkin=2026-10-23",
  ])
    assert.deepEqual(parseReliableIdeaFields(url), blank, url);
});
