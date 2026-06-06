import { describe, expect, test } from "vitest";
import { normalizeUsername } from "./utils.js";

describe("telegram utils", () => {
  test("normalizes bot usernames with a leading @", () => {
    expect(normalizeUsername("demo_bot")).toBe("@demo_bot");
    expect(normalizeUsername("@demo_bot")).toBe("@demo_bot");
  });
});
