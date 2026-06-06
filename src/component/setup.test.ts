/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { test } from "vitest";
import schema from "./schema.js";

export const modules = {
  ...import.meta.glob("./_generated/*.ts"),
  ...import.meta.glob("./convex.config.ts"),
  ...import.meta.glob("./lib.ts"),
  ...import.meta.glob("./schema.ts"),
  ...import.meta.glob("./utils.ts"),
};

export function initConvexTest() {
  return convexTest(schema, modules);
}

test("component test setup", () => {});
