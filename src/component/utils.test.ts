import { describe, expect, test } from "vitest";
import { makeWebhookSecretToken, normalizeUsername } from "./utils.js";

describe("telegram utils", () => {
  test("normalizes bot usernames with a leading @", () => {
    expect(normalizeUsername("demo_bot")).toBe("@demo_bot");
    expect(normalizeUsername("@demo_bot")).toBe("@demo_bot");
  });

  test("creates a webhook secret token", () => {
    const token = makeWebhookSecretToken();

    expect(token).toHaveLength(48);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
