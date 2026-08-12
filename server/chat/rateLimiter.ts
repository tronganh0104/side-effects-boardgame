export const CHAT_BURST = 5
export const CHAT_REFILL_PER_SECOND = 1

export interface TokenBucket {
  tokens: number
  lastRefillAt: number
}

export function createBucket(now: number): TokenBucket {
  return { tokens: CHAT_BURST, lastRefillAt: now }
}

// Refill is computed from elapsed wall-clock time rather than a background
// timer, so an idle bucket costs nothing and a long gap can never overshoot
// capacity — the min() clamp below is what keeps a week-long idle period from
// producing a week of banked tokens.
export function tryConsume(bucket: TokenBucket, now: number): boolean {
  const elapsedSeconds = Math.max(0, (now - bucket.lastRefillAt) / 1000)
  bucket.tokens = Math.min(
    CHAT_BURST,
    bucket.tokens + elapsedSeconds * CHAT_REFILL_PER_SECOND,
  )
  bucket.lastRefillAt = now
  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  return true
}
