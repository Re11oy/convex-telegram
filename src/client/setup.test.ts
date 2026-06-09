/// <reference types="vite/client" />
import { componentsGeneric } from "convex/server";
import { convexTest } from "convex-test";
import { test } from "vitest";
import componentSchema from "../component/schema.js";
import type { ComponentApi } from "../component/_generated/component.js";

const componentModules = import.meta.glob([
  "../component/**/*.ts",
  "!../component/**/*.test.ts",
]);

export const components = componentsGeneric() as unknown as {
  telegram: ComponentApi;
};

export function setupTest() {
  const t = convexTest(componentSchema, componentModules);
  t.registerComponent("telegram", componentSchema, componentModules);
  return t;
}

export type RouteHandler = {
  _handler: (ctx: unknown, request: Request) => Promise<Response>;
};

export function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

export function getMeResponse() {
  return jsonResponse({
    ok: true,
    result: { id: 123, is_bot: true, first_name: "Demo", username: "demo_bot" },
  });
}

export function webhookRequest(secret: string | undefined, body: unknown) {
  const headers: Record<string, string> = {};
  if (secret !== undefined) {
    headers["X-Telegram-Bot-Api-Secret-Token"] = secret;
  }
  return new Request("https://demo.convex.site/telegram/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

test("client test setup", () => {});
