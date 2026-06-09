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

describe("bots", () => {
  test("upsert inserts a record", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.bots.upsert, {
      token: "tok",
      botId: 123,
      botUsername: "@demo_bot",
    });

    const rows = await t.run((ctx) => ctx.db.query("bots").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      token: "tok",
      botId: 123,
      botUsername: "@demo_bot",
    });
  });

  test("upsert replaces an existing record for the same bot id", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.bots.upsert, {
      token: "old",
      botId: 123,
      botUsername: "@demo_bot",
    });
    await t.mutation(api.bots.upsert, {
      token: "new",
      botId: 123,
      botUsername: "@renamed_bot",
    });

    const rows = await t.run((ctx) => ctx.db.query("bots").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ token: "new", botUsername: "@renamed_bot" });
  });

  test("getByBotId returns the record or null", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.bots.upsert, {
      token: "tok",
      botId: 123,
      botUsername: "@demo_bot",
    });

    expect(await t.query(api.bots.getByBotId, { botId: 123 })).toMatchObject({
      token: "tok",
      botId: 123,
      botUsername: "@demo_bot",
    });
    expect(await t.query(api.bots.getByBotId, { botId: 999 })).toBeNull();
  });

  test("list returns every bot without its token", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.bots.upsert, { token: "a", botId: 1, botUsername: "@a" });
    await t.mutation(api.bots.upsert, { token: "b", botId: 2, botUsername: "@b" });

    const list = await t.query(api.bots.list, {});
    expect(list).toHaveLength(2);
    expect(list).toEqual(
      expect.arrayContaining([
        { botId: 1, botUsername: "@a" },
        { botId: 2, botUsername: "@b" },
      ]),
    );
  });

  test("remove deletes the record", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.bots.upsert, {
      token: "tok",
      botId: 123,
      botUsername: "@demo_bot",
    });
    await t.mutation(api.bots.remove, { botId: 123 });

    const rows = await t.run((ctx) => ctx.db.query("bots").collect());
    expect(rows).toHaveLength(0);
  });

  test("resolveBySecret joins the webhook secret to its bot", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.bots.upsert, {
      token: "tok",
      botId: 123,
      botUsername: "@demo_bot",
    });
    await t.mutation(api.webhooks.create, {
      botUsername: "@demo_bot",
      botId: 123,
      secretHash: "abc123",
      settings,
    });

    expect(
      await t.query(api.bots.resolveBySecret, { secretHash: "abc123" }),
    ).toMatchObject({ token: "tok", botId: 123, botUsername: "@demo_bot" });
  });

  test("resolveBySecret returns null for an unknown secret", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.bots.upsert, {
      token: "tok",
      botId: 123,
      botUsername: "@demo_bot",
    });
    await t.mutation(api.webhooks.create, {
      botUsername: "@demo_bot",
      botId: 123,
      secretHash: "abc123",
      settings,
    });

    expect(await t.query(api.bots.resolveBySecret, { secretHash: "nope" })).toBeNull();
  });
});
