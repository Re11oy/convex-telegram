/// <reference types="vite/client" />
import { componentsGeneric } from "convex/server";
import { test } from "vitest";
import type { ComponentApi } from "../component/_generated/component.js";

export const components = componentsGeneric() as unknown as {
  telegram: ComponentApi;
};

test("client test setup", () => {});
