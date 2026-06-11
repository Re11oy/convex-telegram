import { v, type Infer, type VString } from "convex/values";

/** Durable handle for a queued outbound message (status/cancel). */
export type OutboundMessageId = string & { __isOutboundMessageId: true };
export const vOutboundMessageId = v.string() as VString<OutboundMessageId>;

export const vOutboundStatus = v.union(
  v.literal("waiting"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("cancelled"),
);
export type OutboundStatus = Infer<typeof vOutboundStatus>;

/**
 * Validator for the args of the app's `onOutboundEvent` mutation.
 * Carries the full outcome so the common handler needs no round-trip
 * back into the component.
 */
export const vOnOutboundEventArgs = v.object({
  id: vOutboundMessageId,
  event: v.union(
    v.literal("sent"),
    v.literal("failed"),
    v.literal("cancelled"),
  ),
  clientRef: v.optional(v.string()),
  telegramMessageId: v.optional(v.float64()),
  errorCode: v.optional(v.float64()),
  errorMessage: v.optional(v.string()),
});
export type OnOutboundEventArgs = Infer<typeof vOnOutboundEventArgs>;

/** What `bot.outbound.status` returns for a live row. */
export const vOutboundMessageStatus = v.object({
  status: vOutboundStatus,
  telegramMessageId: v.optional(v.float64()),
  errorCode: v.optional(v.float64()),
  errorMessage: v.optional(v.string()),
  clientRef: v.optional(v.string()),
  attemptCount: v.number(),
});
export type OutboundMessageStatus = Infer<typeof vOutboundMessageStatus>;
