import { describe, expect, it } from 'vitest'
import {
  parseTradeInvitePayload,
  parseTradePlacePayload,
} from '../trade/parseTradePayload'

describe('parseTradeInvitePayload', () => {
  it('rejects a non-object payload', () => {
    expect(() => parseTradeInvitePayload(null)).toThrow('Yêu cầu không hợp lệ')
    expect(() => parseTradeInvitePayload('nope')).toThrow('Yêu cầu không hợp lệ')
    expect(() => parseTradeInvitePayload(['array'])).toThrow('Yêu cầu không hợp lệ')
  })

  it('rejects a missing targetPlayerId', () => {
    expect(() => parseTradeInvitePayload({})).toThrow('targetPlayerId')
  })

  it('rejects a non-string targetPlayerId', () => {
    expect(() => parseTradeInvitePayload({ targetPlayerId: 42 })).toThrow('targetPlayerId')
  })

  it('rejects an empty or whitespace-only targetPlayerId', () => {
    expect(() => parseTradeInvitePayload({ targetPlayerId: '' })).toThrow('targetPlayerId')
    expect(() => parseTradeInvitePayload({ targetPlayerId: '   ' })).toThrow('targetPlayerId')
  })

  it('rejects a targetPlayerId longer than 256 characters', () => {
    expect(() =>
      parseTradeInvitePayload({ targetPlayerId: 'a'.repeat(257) }),
    ).toThrow('targetPlayerId')
  })

  it('accepts a valid targetPlayerId and ignores extra fields', () => {
    expect(
      parseTradeInvitePayload({
        targetPlayerId: 'ben-id',
        initiatorPlayerId: 'forged-id',
        cardInstanceId: 'should-be-ignored',
      }),
    ).toEqual({ targetPlayerId: 'ben-id' })
  })
})

describe('parseTradePlacePayload', () => {
  it('rejects a non-object payload', () => {
    expect(() => parseTradePlacePayload(undefined)).toThrow('Yêu cầu không hợp lệ')
  })

  it('rejects a missing cardInstanceId', () => {
    expect(() => parseTradePlacePayload({})).toThrow('cardInstanceId')
  })

  it('rejects a non-string cardInstanceId', () => {
    expect(() => parseTradePlacePayload({ cardInstanceId: { id: 1 } })).toThrow(
      'cardInstanceId',
    )
  })

  it('rejects an empty cardInstanceId', () => {
    expect(() => parseTradePlacePayload({ cardInstanceId: '' })).toThrow('cardInstanceId')
  })

  it('accepts a valid cardInstanceId and ignores extra fields', () => {
    expect(
      parseTradePlacePayload({
        cardInstanceId: 'card-1',
        partnerPlayerId: 'forged-id',
      }),
    ).toEqual({ cardInstanceId: 'card-1' })
  })
})
