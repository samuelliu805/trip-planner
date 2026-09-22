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
    { originText: "Beijing", destinationText: "Shanghai", startDate: "2026-09-20", endDate: null },
  );
  assert.deepEqual(
    parseReliableIdeaFields(
      "https://www.booking.com/hotel/us/example.html?checkin=2026-02-30&checkout=2026-03-03",
    ),
    { originText: null, destinationText: null, startDate: null, endDate: "2026-03-03" },
  );
  assert.deepEqual(parseReliableIdeaFields("https://www.xiaohongshu.com/explore/abc"), {
    originText: null,
    destinationText: null,
    startDate: null,
    endDate: null,
  });
  assert.deepEqual(parseReliableIdeaFields("https://example.com/?price=100&hotel=Example"), {
    originText: null,
    destinationText: null,
    startDate: null,
    endDate: null,
  });
});
