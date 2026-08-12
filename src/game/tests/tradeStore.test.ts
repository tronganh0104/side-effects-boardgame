import { describe, expect, it } from 'vitest'
import { useTradeStore } from '../../store/tradeStore'
import type { TradeStatePayload } from '../trade/types'

function resetStore() {
  useTradeStore.getState().reset()
}

function statePayload(overrides: Partial<TradeStatePayload> = {}): TradeStatePayload {
  return {
    sessionId: 'session-1',
    withPlayerId: 'p2',
    phase: 'pending',
    yourRole: 'initiator',
    yourCardId: null,
    theyPlaced: false,
    yourReady: false,
    theyReady: false,
    ...overrides,
  }
}

describe('tradeStore', () => {
  it('applies a pending trade:state', () => {
    resetStore()
    const payload = statePayload({ phase: 'pending', expiresAt: 12_345 })
    useTradeStore.getState().applyState(payload)

    expect(useTradeStore.getState().session).toEqual(payload)
  })

  it('applies an open trade:state', () => {
    resetStore()
    const payload = statePayload({
      phase: 'open',
      yourCardId: 'card-mine',
      theyPlaced: true,
      yourReady: true,
      theyReady: false,
      expiresAt: undefined,
    })
    useTradeStore.getState().applyState(payload)

    expect(useTradeStore.getState().session).toEqual(payload)
  })

  it('clears the session and records the reason on trade:closed', () => {
    resetStore()
    useTradeStore.getState().applyState(statePayload())
    useTradeStore.getState().applyClosed({ reason: 'declined' })

    expect(useTradeStore.getState().session).toBeNull()
    expect(useTradeStore.getState().lastCloseReason).toBe('declined')
  })

  it('has no field capable of holding the opponent card id after a full place round-trip', () => {
    resetStore()
    // Initiator places their own card.
    useTradeStore.getState().applyState(
      statePayload({ phase: 'open', yourCardId: 'card-mine', theyPlaced: false }),
    )
    // Partner then places theirs — the server only ever tells us a boolean.
    useTradeStore.getState().applyState(
      statePayload({ phase: 'open', yourCardId: 'card-mine', theyPlaced: true }),
    )

    const session = useTradeStore.getState().session!
    expect(typeof session.theyPlaced).toBe('boolean')
    expect(Object.keys(session).sort()).toEqual(
      ['phase', 'sessionId', 'theyPlaced', 'theyReady', 'withPlayerId', 'yourCardId', 'yourReady', 'yourRole'].sort(),
    )
    // No key on the session object is capable of naming the opponent's card:
    // only `yourCardId` (the local player's own card) exists at all.
    const cardIdKeys = Object.keys(session).filter((key) =>
      key.toLowerCase().includes('cardid'),
    )
    expect(cardIdKeys).toEqual(['yourCardId'])
  })

  it('replaces stale fields rather than merging on a second trade:state', () => {
    resetStore()
    useTradeStore.getState().applyState(
      statePayload({ phase: 'open', yourCardId: 'card-mine', theyPlaced: true, yourReady: true, theyReady: true }),
    )

    // They clear their slot: a fresh payload with theyPlaced back to false
    // and both ready flags reset (mirrors the server's real behaviour on
    // trade:clear, section 6.2 of the design doc).
    useTradeStore.getState().applyState(
      statePayload({ phase: 'open', yourCardId: 'card-mine', theyPlaced: false, yourReady: false, theyReady: false }),
    )

    const session = useTradeStore.getState().session!
    expect(session.theyPlaced).toBe(false)
    expect(session.yourReady).toBe(false)
    expect(session.theyReady).toBe(false)
  })

  it('tracks the partner-picker flag independently of server session state', () => {
    resetStore()
    expect(useTradeStore.getState().isPartnerPickerOpen).toBe(false)

    useTradeStore.getState().openPartnerPicker()
    expect(useTradeStore.getState().isPartnerPickerOpen).toBe(true)
    expect(useTradeStore.getState().session).toBeNull()

    useTradeStore.getState().applyState(statePayload())
    expect(useTradeStore.getState().isPartnerPickerOpen).toBe(true)

    useTradeStore.getState().closePartnerPicker()
    expect(useTradeStore.getState().isPartnerPickerOpen).toBe(false)
  })

  it('resets session, picker flag, and close reason', () => {
    resetStore()
    useTradeStore.getState().applyState(statePayload())
    useTradeStore.getState().openPartnerPicker()
    useTradeStore.getState().applyClosed({ reason: 'expired' })

    useTradeStore.getState().reset()

    expect(useTradeStore.getState().session).toBeNull()
    expect(useTradeStore.getState().isPartnerPickerOpen).toBe(false)
    expect(useTradeStore.getState().lastCloseReason).toBeNull()
  })
})
