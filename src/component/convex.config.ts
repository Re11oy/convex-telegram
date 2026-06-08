import { defineComponent } from "convex/server";
import { v } from "convex/values";

export default defineComponent("telegram", {
  env: {
    TELEGRAM_BOT_TOKEN: v.optional(v.string()),
    TELEGRAM_WEBHOOK_SECRET: v.optional(v.string()),
  },
});
