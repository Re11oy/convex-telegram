import { cronJobs } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api.js";
import { internalMutation } from "./_generated/server.js";

// Without this cron, terminal outboundMessages rows accumulate forever —
// the component never deletes data the app didn't ask it to.
export const cleanupTelegramOutbound = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.runMutation(
      components.telegram.outbound.cleanupOldOutboundMessages,
      { olderThan: 7 * 24 * 60 * 60 * 1000 },
    );
    return null;
  },
});

const crons = cronJobs();

crons.daily(
  "telegram outbound cleanup",
  { hourUTC: 4, minuteUTC: 0 },
  internal.crons.cleanupTelegramOutbound,
  {},
);

export default crons;
