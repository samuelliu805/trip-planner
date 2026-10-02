import assert from "node:assert/strict";
import { test } from "node:test";
import { prefillFlightSchedule, updateFlightSchedule } from "./flight-schedule-prefill.ts";
import type { ResearchSegment } from "./types.ts";

const empty = (): ResearchSegment => ({
  origin: "",
  destination: "",
  departureDate: "",
  departureTime: "",
  arrivalDate: "",
  arrivalTime: "",
  carrier: "",
  serviceNumber: "",
});

test("round-trip and multi-city flights prefill each empty leg three calendar days apart", () => {
  const before = [empty(), empty(), empty(), empty()];
  const dates = prefillFlightSchedule(
    before,
    before.map((segment, index) => (index ? segment : { ...segment, departureDate: "2028-02-27" })),
  );
  assert.deepEqual(
    dates.map(({ departureDate, arrivalDate }) => [departureDate, arrivalDate]),
    [
      ["2028-02-27", "2028-02-27"],
      ["2028-03-01", "2028-03-01"],
      ["2028-03-04", "2028-03-04"],
      ["2028-03-07", "2028-03-07"],
    ],
  );
  const times = prefillFlightSchedule(
    dates,
    dates.map((segment, index) => (index ? segment : { ...segment, departureTime: "09:30" })),
  );
  assert.deepEqual(
    times.map(({ departureTime, arrivalTime }) => [departureTime, arrivalTime]),
    Array(4).fill(["09:30", "09:30"]),
  );
});

test("a return-leg arrival can seed preceding dates without overwriting manually entered values", () => {
  const before = [
    empty(),
    empty(),
    { ...empty(), departureDate: "2027-05-20", departureTime: "18:15" },
  ];
  const after = prefillFlightSchedule(
    before,
    before.map((segment, index) =>
      index === 1 ? { ...segment, arrivalDate: "2027-05-10", arrivalTime: "11:00" } : segment,
    ),
  );
  assert.equal(after[0].departureDate, "2027-05-07");
  assert.equal(after[1].departureDate, "2027-05-10");
  assert.equal(after[2].departureDate, "2027-05-20");
  assert.equal(after[2].departureTime, "18:15");
  assert.deepEqual(before[0], empty(), "the previous state is immutable");
});

test("new flight legs follow the last entered schedule and cleared defaults stay empty", () => {
  const before = [
    { ...empty(), departureDate: "2027-04-01" },
    { ...empty(), departureDate: "2027-04-12", departureTime: "16:00" },
  ];
  const added = prefillFlightSchedule(before, [...before, empty()]);
  assert.equal(added[2].departureDate, "2027-04-15");
  assert.equal(added[2].departureTime, "16:00");
  const cleared = prefillFlightSchedule(
    added,
    added.map((segment, index) =>
      index === 2 ? { ...segment, departureDate: "", departureTime: "" } : segment,
    ),
  );
  assert.equal(cleared[2].departureDate, "");
  assert.equal(cleared[2].departureTime, "");
});

test("prefilled arrival dates follow a changed departure even after times are entered", () => {
  const first = updateFlightSchedule({ segments: [empty(), empty()], defaultArrivalDates: [] }, [
    { ...empty(), departureDate: "2027-04-01", arrivalDate: "2027-04-01" },
    empty(),
  ]);
  const timed = updateFlightSchedule(
    first,
    first.segments.map((segment, index) =>
      index ? segment : { ...segment, departureTime: "09:30" },
    ),
  );
  const changed = updateFlightSchedule(
    timed,
    timed.segments.map((segment, index) =>
      index ? { ...segment, departureDate: "2027-04-12" } : segment,
    ),
  );
  assert.equal(changed.segments[1].arrivalDate, "2027-04-12");
  const explicit = updateFlightSchedule(
    changed,
    changed.segments.map((segment, index) =>
      index ? { ...segment, arrivalDate: "2027-04-13" } : segment,
    ),
  );
  const changedAgain = updateFlightSchedule(
    explicit,
    explicit.segments.map((segment, index) =>
      index ? { ...segment, departureDate: "2027-04-11" } : segment,
    ),
  );
  assert.equal(
    changedAgain.segments[1].arrivalDate,
    "2027-04-13",
    "an explicit arrival date remains unchanged",
  );
});
