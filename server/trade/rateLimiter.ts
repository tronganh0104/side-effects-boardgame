export const TRADE_INVITE_BURST = 3
const TRADE_INVITE_REFILL_PER_SECOND = 1 / 5

export interface InviteBucket {
  tokens: number
  lastRefillAt: number
}

export function createInviteBucket(now: number): InviteBucket {
  return { tokens: TRADE_INVITE_BURST, lastRefillAt: now }
}

// Same shape as server/chat/rateLimiter.ts but reimplemented here: trade
// must not import from chat, and this is the only rate limit trade needs.
export function tryConsumeInvite(bucket: InviteBucket, now: number): boolean {
  const elapsedSeconds = Math.max(0, (now - bucket.lastRefillAt) / 1000)
  bucket.tokens = Math.min(
    TRADE_INVITE_BURST,
    bucket.tokens + elapsedSeconds * TRADE_INVITE_REFILL_PER_SECOND,
  )
  bucket.lastRefillAt = now
  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  return true
}
