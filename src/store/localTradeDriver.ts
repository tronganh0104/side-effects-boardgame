import { create } from 'zustand'
import { createTradeSessionStore } from '../game/trade/tradeSession'
import { toStatePayload } from '../game/trade/tradeStatePayload'
import { toTradeCommand } from '../game/trade/tradeCommand'
import type { TradeCloseReason, TradeSession } from '../game/trade/types'
import { useGameStore } from './gameStore'
import { useTradeStore } from './tradeStore'

const LOCAL_ROOM_ID = 'local'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Không thể thực hiện thao tác trao đổi.'
}

export interface LocalTradeDriverState {
  /**
   * Negotiation-layer failures (busy, no session, wrong role, …). Engine
   * failures (quota already spent, phase is still `draw`, …) instead flow
   * through `useGameStore`'s own `error` field — this store never inspects
   * or repeats that validation, it only relays the boolean `tradeCards`
   * hands back.
   */
  error?: string
  /** Sends an invite as `fromPlayerId` (always the local human — the trade
   *  partner is a bot in local play, never a hot-seat handoff) to
   *  `targetPlayerId`. */
  invite: (fromPlayerId: string, targetPlayerId: string) => void
  /** Every action below takes the acting player explicitly rather than
   *  inferring "whose turn to act" from any stored seat: in local play the
   *  human always acts as the initiator and `useLocalTradeBot` always acts
   *  as the partner, so both sides can call into this same driver — exactly
   *  like two independent remote clients would — without it needing to
   *  track "whose screen is this" at all. */
  accept: (playerId: string) => void
  decline: (playerId: string) => void
  place: (playerId: string, cardInstanceId: string) => void
  clear: (playerId: string) => void
  /** Confirms as `playerId`; once both sides are ready this also commits the
   *  swap through `useGameStore().tradeCards`, the same engine entry point
   *  the server drives in online play. */
  confirm: (playerId: string) => void
  cancel: (playerId: string) => void
  clearError: () => void
  /** Closes any lingering local session — call when starting a fresh local
   *  game so a stale session can't survive across games. */
  reset: () => void
}

/**
 * Factory mirroring `createTradeSessionStore`'s own factory shape: production
 * code uses the singleton `useLocalTradeDriver` below, tests can build an
 * isolated instance with a fake clock/id generator.
 *
 * This is the local-hot-seat analogue of `server/trade/tradeGateway.ts`:
 * same session machine (`createTradeSessionStore`), same
 * `toStatePayload`/`toTradeCommand` helpers, same sequencing (sweep expired
 * invites, require the caller is actually in a session, publish state,
 * commit and close on both-ready).
 *
 * `tradeStore` always mirrors the *initiator's* view of the session
 * (`publish` below), never whichever player last acted — in local play the
 * human is always the initiator and the bot (`useLocalTradeBot`) is always
 * the partner, so this is what keeps the on-screen panel showing the
 * human's own perspective even while the bot's `accept`/`place`/`confirm`
 * calls are flowing through the exact same actions.
 */
export function createLocalTradeDriverStore(deps?: {
  now?: () => number
  createId?: () => string
}) {
  const sessionStore = createTradeSessionStore({
    now: deps?.now ?? Date.now,
    createId: deps?.createId,
  })

  return create<LocalTradeDriverState>((set) => {
    const publish = (session: TradeSession): void => {
      useTradeStore.getState().applyState(toStatePayload(session, session.initiatorPlayerId))
    }

    const finalizeClose = (reason: TradeCloseReason): void => {
      useTradeStore.getState().applyClosed({ reason })
    }

    /** Mirrors `tradeGateway.ts`'s `sweepExpiredInvites()` call at the top of
     *  every socket handler: no background timer, just a lazy check before
     *  each action so an ignored 45s-old invite still closes itself out. */
    const sweep = (playerId: string): void => {
      const expired = sessionStore.sweepExpired()
      if (
        expired.some(
          (session) => session.initiatorPlayerId === playerId || session.partnerPlayerId === playerId,
        )
      )
        finalizeClose('expired')
    }

    const requireSessionFor = (playerId: string): TradeSession => {
      const session = sessionStore.getByPlayer(playerId)
      if (!session) throw new Error('Bạn không ở trong phiên trao đổi nào.')
      return session
    }

    const guarded = (playerId: string, fn: () => void): void => {
      sweep(playerId)
      try {
        fn()
        set({ error: undefined })
      } catch (error) {
        set({ error: errorMessage(error) })
      }
    }

    return {
      error: undefined,

      invite: (fromPlayerId, targetPlayerId) =>
        guarded(fromPlayerId, () => {
          const session = sessionStore.invite(LOCAL_ROOM_ID, fromPlayerId, targetPlayerId)
          publish(session)
        }),

      accept: (playerId) =>
        guarded(playerId, () => {
          const session = requireSessionFor(playerId)
          publish(sessionStore.accept(session.id, playerId))
        }),

      decline: (playerId) =>
        guarded(playerId, () => {
          const session = requireSessionFor(playerId)
          sessionStore.decline(session.id, playerId)
          finalizeClose('declined')
        }),

      place: (playerId, cardInstanceId) =>
        guarded(playerId, () => {
          const session = requireSessionFor(playerId)
          publish(sessionStore.place(session.id, playerId, cardInstanceId))
        }),

      clear: (playerId) =>
        guarded(playerId, () => {
          const session = requireSessionFor(playerId)
          publish(sessionStore.clear(session.id, playerId))
        }),

      confirm: (playerId) =>
        guarded(playerId, () => {
          const session = requireSessionFor(playerId)
          const result = sessionStore.confirm(session.id, playerId)
          if (!result.bothReady) {
            publish(result.session)
            return
          }
          // Both sides readied: commit through the same engine command
          // online play uses, and let it throw/reject on its own terms
          // (quota, phase, a card that left the hand) — this driver never
          // re-checks any of that itself.
          const success = useGameStore.getState().tradeCards(toTradeCommand(result.session))
          sessionStore.closeSession(result.session.id)
          finalizeClose(success ? 'committed' : 'cancelled')
        }),

      cancel: (playerId) =>
        guarded(playerId, () => {
          const session = requireSessionFor(playerId)
          sessionStore.cancel(session.id, playerId)
          finalizeClose('cancelled')
        }),

      clearError: () => set({ error: undefined }),

      reset: () => {
        sessionStore.closeAllInRoom(LOCAL_ROOM_ID)
        useTradeStore.getState().reset()
        set({ error: undefined })
      },
    }
  })
}

export const useLocalTradeDriver = createLocalTradeDriverStore()
