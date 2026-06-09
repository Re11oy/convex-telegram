/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const settings = {
  webhookUrl: "https://demo.convex.site/telegram/webhook",
  allowedUpdates: ["message"],
  dropPendingUpdates: true,
};

describe("webhooks", () => {
  test("create inserts a record", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.webhooks.create, {
      botUsername: "@demo_bot",
      botId: 123,
      secretHash: "deadbeef",
      settings,
    });

    const rows = await t.run((ctx) => ctx.db.query("webhooks").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      botUsername: "@demo_bot",
      botId: 123,
      secretHash: "deadbeef",
      settings,
    });
  });

  test("create replaces an existing record for the same bot", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.webhooks.create, {
      botUsername: "@demo_bot",
      botId: 123,
      settings,
    });
    await t.mutation(api.webhooks.create, {
      botUsername: "@demo_bot",
      botId: 456,
      settings,
    });

    const rows = await t.run((ctx) => ctx.db.query("webhooks").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.botId).toBe(456);
  });

  test("remove deletes the record", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.webhooks.create, {
      botUsername: "@demo_bot",
      botId: 123,
      settings,
    });
    await t.mutation(api.webhooks.remove, { botUsername: "@demo_bot" });

    const rows = await t.run((ctx) => ctx.db.query("webhooks").collect());
    expect(rows).toHaveLength(0);
  });

  test("remove is a no-op when no record exists", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.webhooks.remove, { botUsername: "@nobody" }),
    ).resolves.toBeNull();
  });
});
