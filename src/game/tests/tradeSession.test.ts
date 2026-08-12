import { describe, expect, it } from 'vitest'
import { createTradeSessionStore } from '../trade/tradeSession'
import { toStatePayload } from '../trade/tradeStatePayload'
import { TRADE_INVITE_EXPIRY_MS } from '../trade/types'

function createStore(initialNow = 0) {
  let current = initialNow
  let counter = 0
  const store = createTradeSessionStore({
    now: () => current,
    createId: () => `trade-${++counter}`,
  })
  return { store, advance: (ms: number) => (current += ms) }
}

describe('trade session store — invite lifecycle', () => {
  it('creates a pending session with both flags false', () => {
    const { store } = createStore()
    const session = store.invite('ROOM1', 'ada', 'ben')

    expect(session).toMatchObject({
      roomId: 'ROOM1',
      initiatorPlayerId: 'ada',
      partnerPlayerId: 'ben',
      phase: 'pending',
      initiatorReady: false,
      partnerReady: false,
    })
    expect(session.initiatorCardId).toBeUndefined()
    expect(session.partnerCardId).toBeUndefined()
  })

  it('rejects inviting yourself', () => {
    const { store } = createStore()
    expect(() => store.invite('ROOM1', 'ada', 'ada')).toThrow('tự mời chính mình')
  })

  it('rejects inviting a player who is already in a session (the invitee)', () => {
    const { store } = createStore()
    store.invite('ROOM1', 'ada', 'ben')
    expect(() => store.invite('ROOM1', 'cara', 'ben')).toThrow('đang bận')
  })

  it('rejects a second invite from a player who already sent one (the initiator)', () => {
    const { store } = createStore()
    store.invite('ROOM1', 'ada', 'ben')
    expect(() => store.invite('ROOM1', 'ada', 'cara')).toThrow('đang bận')
  })

  it('marks both players busy the moment the invite is pending, before any accept', () => {
    const { store } = createStore()
    store.invite('ROOM1', 'ada', 'ben')
    expect(store.isBusy('ada')).toBe(true)
    expect(store.isBusy('ben')).toBe(true)
  })

  it('accept moves a pending session to open', () => {
    const { store } = createStore()
    const session = store.invite('ROOM1', 'ada', 'ben')
    const accepted = store.accept(session.id, 'ben')
    expect(accepted.phase).toBe('open')
  })

  it('only the invited partner can accept', () => {
    const { store } = createStore()
    const session = store.invite('ROOM1', 'ada', 'ben')
    expect(() => store.accept(session.id, 'ada')).toThrow('người được mời')
  })

  it('decline closes the session and frees both players', () => {
    const { store } = createStore()
    const session = store.invite('ROOM1', 'ada', 'ben')
    const closed = store.decline(session.id, 'ben')
    expect(closed.id).toBe(session.id)
    expect(store.isBusy('ada')).toBe(false)
    expect(store.isBusy('ben')).toBe(false)
    expect(store.getById(session.id)).toBeUndefined()
  })

  it('only the invited partner can decline, and only while pending', () => {
    const { store } = createStore()
    const session = store.invite('ROOM1', 'ada', 'ben')
    expect(() => store.decline(session.id, 'ada')).toThrow('người được mời')
    const accepted = store.accept(session.id, 'ben')
    expect(() => store.decline(accepted.id, 'ben')).toThrow('không còn hiệu lực')
  })

  it('a declined or expired invite does not need to touch any trade quota (session-layer concern only)', () => {
    // The quota itself lives in the engine (Block 1); this store never
    // references it. Declining just has to free the players cleanly.
    const { store } = createStore()
    const session = store.invite('ROOM1', 'ada', 'ben')
    store.decline(session.id, 'ben')
    expect(store.isBusy('ada')).toBe(false)
  })

  it('cancel closes the session for either participant, pending or open', () => {
    const { store } = createStore()
    const pending = store.invite('ROOM1', 'ada', 'ben')
    expect(store.cancel(pending.id, 'ada').phase).toBe('pending')

    const { store: store2 } = createStore()
    const session2 = store2.invite('ROOM1', 'ada', 'ben')
    store2.accept(session2.id, 'ben')
    expect(() => store2.cancel(session2.id, 'ben')).not.toThrow()
  })

  it('a non-participant cannot act on a session', () => {
    const { store } = createStore()
    const session = store.invite('ROOM1', 'ada', 'ben')
    expect(() => store.cancel(session.id, 'ghost')).toThrow('không tham gia')
  })

  it('acting on an unknown session id throws', () => {
    const { store } = createStore()
    expect(() => store.accept('nope', 'ada')).toThrow('không tồn tại')
  })
})

describe('trade session store — open phase: place/clear/confirm', () => {
  function openSession() {
    const { store, advance } = createStore()
    const invited = store.invite('ROOM1', 'ada', 'ben')
    store.accept(invited.id, 'ben')
    return { store, advance, sessionId: invited.id }
  }

  it('place/clear are rejected before the invite is accepted', () => {
    const { store } = createStore()
    const session = store.invite('ROOM1', 'ada', 'ben')
    expect(() => store.place(session.id, 'ada', 'card-1')).toThrow('chưa mở')
    expect(() => store.clear(session.id, 'ada')).toThrow('chưa mở')
    expect(() => store.confirm(session.id, 'ada')).toThrow('chưa mở')
  })

  it('place records the acting player card only, leaving the other side untouched', () => {
    const { store, sessionId } = openSession()
    const updated = store.place(sessionId, 'ada', 'card-ada')
    expect(updated.initiatorCardId).toBe('card-ada')
    expect(updated.partnerCardId).toBeUndefined()
  })

  it('THE key rule: any place or clear resets BOTH ready flags, even the other side\'s', () => {
    const { store, sessionId } = openSession()
    store.place(sessionId, 'ada', 'card-ada')
    store.place(sessionId, 'ben', 'card-ben')
    const bothConfirmed = store.confirm(sessionId, 'ben').session
    expect(store.confirm(sessionId, 'ada').bothReady).toBe(true)
    expect(bothConfirmed.partnerReady).toBe(true)

    // Ada already confirmed above (bothReady was true). Now Ben swaps his
    // card after the fact — this must not leave Ada's confirmation standing
    // against a deal that silently changed under her.
    const afterSwap = store.place(sessionId, 'ben', 'card-ben-2')
    expect(afterSwap.initiatorReady).toBe(false)
    expect(afterSwap.partnerReady).toBe(false)
  })

  it('clear also resets both ready flags and removes only the acting player card', () => {
    const { store, sessionId } = openSession()
    store.place(sessionId, 'ada', 'card-ada')
    store.place(sessionId, 'ben', 'card-ben')
    store.confirm(sessionId, 'ada')
    store.confirm(sessionId, 'ben')

    const cleared = store.clear(sessionId, 'ada')
    expect(cleared.initiatorCardId).toBeUndefined()
    expect(cleared.partnerCardId).toBe('card-ben')
    expect(cleared.initiatorReady).toBe(false)
    expect(cleared.partnerReady).toBe(false)
  })

  it('confirm requires a card to be placed first', () => {
    const { store, sessionId } = openSession()
    expect(() => store.confirm(sessionId, 'ada')).toThrow('đặt một lá bài')
  })

  it('confirm only reports bothReady once both sides have confirmed', () => {
    const { store, sessionId } = openSession()
    store.place(sessionId, 'ada', 'card-ada')
    store.place(sessionId, 'ben', 'card-ben')

    const afterAda = store.confirm(sessionId, 'ada')
    expect(afterAda.bothReady).toBe(false)
    expect(afterAda.session.initiatorReady).toBe(true)
    expect(afterAda.session.partnerReady).toBe(false)

    const afterBen = store.confirm(sessionId, 'ben')
    expect(afterBen.bothReady).toBe(true)
  })
})

describe('trade session store — expiry, disconnect, room teardown', () => {
  it('sweepExpired closes pending invites at or past 45s and leaves fresher ones alone', () => {
    const { store, advance } = createStore()
    const stale = store.invite('ROOM1', 'ada', 'ben')
    advance(TRADE_INVITE_EXPIRY_MS)
    const fresh = store.invite('ROOM1', 'cara', 'dan')

    const expired = store.sweepExpired()
    expect(expired.map((session) => session.id)).toEqual([stale.id])
    expect(store.getById(fresh.id)).toBeDefined()
    expect(store.isBusy('ada')).toBe(false)
    expect(store.isBusy('cara')).toBe(true)
  })

  it('sweepExpired does not touch an open (already-accepted) session even past 45s', () => {
    const { store, advance } = createStore()
    const session = store.invite('ROOM1', 'ada', 'ben')
    store.accept(session.id, 'ben')
    advance(TRADE_INVITE_EXPIRY_MS)
    expect(store.sweepExpired()).toEqual([])
    expect(store.getById(session.id)).toBeDefined()
  })

  it('closeForPlayer closes whichever session that player is in', () => {
    const { store } = createStore()
    const session = store.invite('ROOM1', 'ada', 'ben')
    const closed = store.closeForPlayer('ben')
    expect(closed?.id).toBe(session.id)
    expect(store.isBusy('ada')).toBe(false)
  })

  it('closeForPlayer is a no-op for a player with no session', () => {
    const { store } = createStore()
    expect(store.closeForPlayer('ghost')).toBeUndefined()
  })

  it('closeAllInRoom closes every session for that room and none for others', () => {
    const { store } = createStore()
    const inRoom = store.invite('ROOM1', 'ada', 'ben')
    const otherRoom = store.invite('ROOM2', 'cara', 'dan')
    const closed = store.closeAllInRoom('ROOM1')
    expect(closed.map((session) => session.id)).toEqual([inRoom.id])
    expect(store.getById(otherRoom.id)).toBeDefined()
  })
})

describe('toStatePayload — face-down guarantee', () => {
  it('never lets the opponent card id reach the payload, for either side', () => {
    const { store, sessionId } = (() => {
      const { store } = createStore()
      const session = store.invite('ROOM1', 'ada', 'ben')
      store.accept(session.id, 'ben')
      store.place(session.id, 'ada', 'card-ada-secret')
      store.place(session.id, 'ben', 'card-ben-secret')
      return { store, sessionId: session.id }
    })()
    const session = store.getById(sessionId)!

    const forAda = toStatePayload(session, 'ada')
    const forBen = toStatePayload(session, 'ben')

    expect(forAda.yourCardId).toBe('card-ada-secret')
    expect(forAda.theyPlaced).toBe(true)
    expect(typeof forAda.theyPlaced).toBe('boolean')
    expect(JSON.stringify(forAda)).not.toContain('card-ben-secret')
    expect(Object.values(forAda)).not.toContain('card-ben-secret')

    expect(forBen.yourCardId).toBe('card-ben-secret')
    expect(JSON.stringify(forBen)).not.toContain('card-ada-secret')
    expect(Object.values(forBen)).not.toContain('card-ada-secret')
  })

  it('reports yourCardId as null, not undefined, before placing', () => {
    const { store } = createStore()
    const session = store.invite('ROOM1', 'ada', 'ben')
    const payload = toStatePayload(session, 'ada')
    expect(payload.yourCardId).toBeNull()
    expect(payload.theyPlaced).toBe(false)
  })

  it('includes expiresAt only while pending', () => {
    const { store } = createStore(1_000)
    const session = store.invite('ROOM1', 'ada', 'ben')
    const pendingPayload = toStatePayload(session, 'ada')
    expect(pendingPayload.expiresAt).toBe(1_000 + TRADE_INVITE_EXPIRY_MS)

    const open = store.accept(session.id, 'ben')
    const openPayload = toStatePayload(open, 'ada')
    expect(openPayload.expiresAt).toBeUndefined()
  })

  it('sets withPlayerId and yourRole from the opposite side of the session', () => {
    const { store } = createStore()
    const session = store.invite('ROOM1', 'ada', 'ben')
    expect(toStatePayload(session, 'ada')).toMatchObject({ yourRole: 'initiator', withPlayerId: 'ben' })
    expect(toStatePayload(session, 'ben')).toMatchObject({ yourRole: 'partner', withPlayerId: 'ada' })
  })
})
