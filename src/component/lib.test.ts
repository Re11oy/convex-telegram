import { expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { initConvexTest } from "./setup.test.js";

test("saves bot credentials and updates an existing username", async () => {
  const t = initConvexTest();

  const botUsername = await t.mutation(api.lib.saveBotCredentials, {
    token: "first-token",
    botUsername: "demo_bot",
  });
  const sameBotUsername = await t.mutation(api.lib.saveBotCredentials, {
    token: "rotated-token",
    botUsername: "demo_bot",
  });

  expect(botUsername).toBe("@demo_bot");
  expect(sameBotUsername).toBe(botUsername);
  expect(await t.query(api.lib.getBotToken, { botUsername })).toBe(
    "rotated-token",
  );
});

test("stores, rotates, finds, and deletes webhook secrets", async () => {
  const t = initConvexTest();
  const botUsername = await t.mutation(api.lib.saveBotCredentials, {
    token: "bot-token",
    botUsername: "webhook_bot",
  });

  await t.mutation(api.lib.saveWebhookSecret, {
    botUsername,
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

test("requires saved bot credentials before storing a webhook secret", async () => {
  const t = initConvexTest();

  await expect(
    t.mutation(api.lib.saveWebhookSecret, {
      botUsername: "missing_bot",
      webhookSecretToken: "secret",
    }),
  ).rejects.toThrow("Bot missing_bot not found in database");
});

test("deletes bot credentials idempotently", async () => {
  const t = initConvexTest();
  const botUsername = await t.mutation(api.lib.saveBotCredentials, {
    token: "bot-token",
    botUsername: "delete_bot",
  });

  expect(await t.mutation(api.lib.deleteBotCredentials, { botUsername })).toBe(
    true,
  );
  expect(await t.mutation(api.lib.deleteBotCredentials, { botUsername })).toBe(
    false,
  );
});
