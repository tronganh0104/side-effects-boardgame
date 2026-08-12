import { describe, expect, it } from 'vitest'
import { CHAT_BURST, createBucket, tryConsume } from '../chat/rateLimiter'

describe('chat token bucket', () => {
  it('allows a burst of 5 and refuses the 6th', () => {
    const bucket = createBucket(0)
    for (let i = 0; i < CHAT_BURST; i++) expect(tryConsume(bucket, 0)).toBe(true)
    expect(tryConsume(bucket, 0)).toBe(false)
  })

  it('refills one token after 1000ms', () => {
    const bucket = createBucket(0)
    for (let i = 0; i < CHAT_BURST; i++) tryConsume(bucket, 0)
    expect(tryConsume(bucket, 1000)).toBe(true)
    expect(tryConsume(bucket, 1000)).toBe(false)
  })

  it('never exceeds capacity after a long idle gap', () => {
    const bucket = createBucket(0)
    // A week of elapsed time would refill far past capacity without clamping.
    expect(tryConsume(bucket, 7 * 24 * 60 * 60 * 1000)).toBe(true)
    for (let i = 0; i < CHAT_BURST - 1; i++)
      expect(tryConsume(bucket, 7 * 24 * 60 * 60 * 1000)).toBe(true)
    expect(tryConsume(bucket, 7 * 24 * 60 * 60 * 1000)).toBe(false)
  })
})
