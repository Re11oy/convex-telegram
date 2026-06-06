import { defineSchema } from "convex/server";

// The component is stateless: the bot token and webhook secret live in the
// app's environment, and webhook requests are verified directly against the
// configured secret. No component tables are needed.
export default defineSchema({});
