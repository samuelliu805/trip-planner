import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalIdeaUrl,
  classifyIdeaInput,
  findDuplicateIdea,
  overrideIdeaClassification,
  parseReliableIdeaFields,
} from "./idea-input.ts";

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
    segments: [
      {
        origin: "PVG",
        destination: "HND",
        departureDate: "2026-11-20",
        carrier: "NH",
        serviceNumber: "972",
      },
      {
        origin: "HND",
        destination: "PVG",
        departureDate: "2026-11-25",
        carrier: "NH",
        serviceNumber: "967",
      },
    ],
  });
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
