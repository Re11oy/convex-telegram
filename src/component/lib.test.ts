import { expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { initConvexTest } from "./setup.test.js";

test("stores, rotates, finds, and deletes webhook secrets", async () => {
  const t = initConvexTest();
  const botUsername = "@webhook_bot";

  await t.mutation(api.lib.saveWebhookSecret, {
    botUsername: "webhook_bot",
    webhookSecretToken: "secret-one",
  });
  expect(
    await t.query(api.lib.findWebhookSecret, {
      webhookSecretToken: "secret-one",
    }),
  ).toEqual({
    isValid: true,
    botUsername,
  });

  await t.mutation(api.lib.saveWebhookSecret, {
    botUsername,
    webhookSecretToken: "secret-two",
  });
  expect(
    await t.query(api.lib.findWebhookSecret, {
      webhookSecretToken: "secret-one",
    }),
  ).toEqual({
    isValid: false,
  });
  expect(
    await t.query(api.lib.findWebhookSecret, {
      webhookSecretToken: "secret-two",
    }),
  ).toEqual({
    isValid: true,
    botUsername,
  });

  expect(await t.mutation(api.lib.deleteWebhookSecret, { botUsername })).toBe(
    true,
  );
  expect(
    await t.query(api.lib.findWebhookSecret, {
      webhookSecretToken: "secret-two",
    }),
  ).toEqual({
    isValid: false,
  });
  expect(await t.mutation(api.lib.deleteWebhookSecret, { botUsername })).toBe(
    false,
  );
});

test("normalizes bot usernames when storing webhook secrets", async () => {
  const t = initConvexTest();

  await t.mutation(api.lib.saveWebhookSecret, {
    botUsername: "normalize_bot",
    webhookSecretToken: "secret",
  });

  expect(
    await t.query(api.lib.findWebhookSecret, {
      webhookSecretToken: "secret",
    }),
  ).toEqual({
    isValid: true,
    botUsername: "@normalize_bot",
  });
});
