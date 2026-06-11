import workpool from "@convex-dev/workpool/convex.config";
import { defineComponent } from "convex/server";
import { v } from "convex/values";

const telegram = defineComponent("telegram", {
  env: {
    TELEGRAM_BOT_TOKEN: v.optional(v.string()),
    TELEGRAM_WEBHOOK_SECRET: v.optional(v.string()),
  },
});
telegram.use(workpool);

export default telegram;
