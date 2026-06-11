/// <reference types="vite/client" />

import workpool from "@convex-dev/workpool/test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import type { TestConvex } from "convex-test";
import schema from "./component/schema.js";

const modules = import.meta.glob([
  "./component/**/*.ts",
  "!./component/**/*.test.ts",
]);

export function register(
  t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
  name: string = "telegram",
) {
  t.registerComponent(name, schema, modules);
  workpool.register(t, `${name}/workpool`);
}

export default { register, schema, modules };
