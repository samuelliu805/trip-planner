/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect heterogeneous MCP JSON results. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { handleMcp } from "./mcp";
import { AiError, callRpc, invokeTool, type AiAuthorization, type Rpc } from "./service";

export function registerScheduleIntegrationTests({
  rpc,
  issue,
  config,
}: {
  rpc: Rpc;
  issue: () => Promise<{ authorization: AiAuthorization; token: { accessToken: string } }>;
  config: { resource: string; origin: string; issuer: string; rateLimit: number };
}) {
  test("MCP validation never exposes raw constraint row details", async () => {
    await assert.rejects(
      callRpc(
        async () => ({
          data: null,
          error: {
            code: "23514",
            message: "constraint failed",
            details: "Failing row contains private notes",
          },
        }),
        "ai_invoke_v1",
        {},
      ),
      (error: unknown) =>
        error instanceof AiError &&
        error.code === "INVALID_INPUT" &&
        error.message === "INVALID_INPUT" &&
        error.issues === undefined,
    );
  });
  test("MCP schedule rules return field errors for additions and merged updates without partial writes", async () => {
    const grant = await issue();
    const call = async (tool: string, args: unknown): Promise<any> =>
      invokeTool(rpc, tool, args, grant.authorization);
    const created = await call("trip_create", {
      title: "Schedule validation",
      timezone: "Asia/Tokyo",
      day_count: 1,
      idempotency_key: randomUUID(),
    });
    const trip = await call("trip_get", { trip_id: created.trip.id, section: "days" });
    const base = { trip_id: trip.trip.id, expected_revision: trip.revision };
    const add = (fields: Record<string, unknown>) => ({
      op: "add",
      day_id: trip.days[0].id,
      fields: { title: "Lunch", type: "meal", ...fields },
    });
    async function result(args: unknown) {
      const response = await handleMcp(
        new Request(config.resource, {
          method: "POST",
          headers: {
            authorization: `Bearer ${grant.token.accessToken}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "itinerary_apply_changes", arguments: args },
          }),
        }),
        rpc,
        config,
      );
      assert.equal(response.status, 200);
      return (await response.json()).result;
    }
    async function rejected(
      changes: unknown[],
      field: string,
      message: RegExp,
      revision = trip.revision,
      index = 0,
    ) {
      const output = await result({
        ...base,
        expected_revision: revision,
        dry_run: true,
        idempotency_key: randomUUID(),
        changes,
      });
      assert.equal(output.isError, true);
      const error = output.structuredContent.error;
      assert.equal(error.code, "INVALID_INPUT");
      assert.deepEqual(error.issues[0].path.map(String), [
        "changes",
        String(index),
        "fields",
        field,
      ]);
      assert.match(error.message, message);
      assert.deepEqual(JSON.parse(output.content[0].text), output.structuredContent);
    }
    await rejected(
      [
        add({ type: "activity" }),
        add({ scheduleKind: "range", startTime: "12:00", endTime: "13:00" }),
      ],
      "endTime",
      /Meals support one time/,
      trip.revision,
      1,
    );
    assert.equal(
      (await call("trip_get", { trip_id: trip.trip.id, section: "items" })).items.length,
      0,
    );
    await rejected(
      [add({ scheduleKind: "range", startTime: "12:00" })],
      "scheduleKind",
      /Meals support one time/,
    );
    await rejected(
      [add({ scheduleKind: "exact", startTime: "25:90" })],
      "startTime",
      /valid 24-hour/,
    );
    await rejected([add({ scheduleKind: "exact" })], "startTime", /exact requires/);
    await rejected(
      [add({ scheduleKind: "none", startTime: "12:00" })],
      "scheduleKind",
      /requires.*empty/,
    );
    await rejected(
      [add({ type: "activity", scheduleKind: "range", startTime: "13:00", endTime: "12:00" })],
      "endTime",
      /on or after/,
    );
    await rejected(
      [add({ type: "activity", scheduleKind: "range", startTime: "12:00" })],
      "endTime",
      /requires both/,
    );
    await rejected([add({ scheduleKind: "approximate" })], "scheduleKind", /MCP supports/);
    const preview = await call("itinerary_apply_changes", {
      ...base,
      dry_run: true,
      idempotency_key: randomUUID(),
      changes: [
        add({ scheduleKind: "exact", startTime: "12:00" }),
        add({
          type: "activity",
          title: "Temple",
          scheduleKind: "range",
          startTime: "13:00",
          endTime: "14:00",
        }),
        add({ scheduleKind: "all_day" }),
        add({ scheduleKind: "none" }),
      ],
    });
    await call("itinerary_apply_changes", {
      ...base,
      preview_id: preview.preview_id,
      idempotency_key: randomUUID(),
    });
    const saved = await call("trip_get", { trip_id: trip.trip.id, section: "items" });
    assert.equal(saved.items.length, 4);
    const meal = saved.items.find((item: any) => item.schedule_kind === "exact");
    const activity = saved.items.find((item: any) => item.type === "activity");
    await rejected(
      [{ op: "update", item_id: meal.id, fields: { scheduleKind: "range", endTime: "13:00" } }],
      "endTime",
      /Meals support one time/,
      saved.revision,
    );
    await rejected(
      [{ op: "update", item_id: activity.id, fields: { type: "meal" } }],
      "endTime",
      /Meals support one time/,
      saved.revision,
    );
    const unchanged = await call("trip_get", { trip_id: trip.trip.id, section: "items" });
    assert.equal(unchanged.revision, saved.revision);
    assert.equal(unchanged.items.find((item: any) => item.id === activity.id).type, "activity");
    const update = await call("itinerary_apply_changes", {
      ...base,
      expected_revision: saved.revision,
      dry_run: true,
      idempotency_key: randomUUID(),
      changes: [
        {
          op: "update",
          item_id: activity.id,
          fields: { type: "meal", scheduleKind: "exact", endTime: null },
        },
      ],
    });
    await call("itinerary_apply_changes", {
      ...base,
      expected_revision: saved.revision,
      preview_id: update.preview_id,
      idempotency_key: randomUUID(),
    });
    const updated = await call("trip_get", { trip_id: trip.trip.id, section: "items" });
    assert.equal(updated.items.find((item: any) => item.id === activity.id).end_time, null);
  });
}
