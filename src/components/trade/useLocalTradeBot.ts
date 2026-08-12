import { useEffect } from 'react'
import { systemRandom } from '../../game/engine/random'
import type { RandomSource } from '../../game/engine/random'
import { useGameStore } from '../../store/gameStore'
import { useLocalTradeDriver } from '../../store/localTradeDriver'
import { useTradeStore } from '../../store/tradeStore'
import { reactToHumanConfirm, respondToInvite } from './localTradeBot'

const MIN_DELAY_MS = 700
const MAX_DELAY_MS = 1_500

function nextDelay(rng: RandomSource): number {
  return MIN_DELAY_MS + rng.next() * (MAX_DELAY_MS - MIN_DELAY_MS)
}

/**
 * Local hot-seat has no real partner to trade with, so this drives the
 * *other* side of every local `createTradeSessionStore` negotiation as a
 * bot — through the exact same `localTradeDriver` actions a remote player's
 * client would call (see `localTradeBot.ts` for the actual decisions).
 * `enabled` must be false in online mode, same idiom as `useLocalChatBot`;
 * unlike that hook this one is state-driven, not timer-looped, because the
 * bot has to react to specific session transitions rather than post at will.
 *
 * `tradeStore`'s session always mirrors the *initiator's* view in local play
 * (see `localTradeDriver.ts`'s `publish`) — since only the human ever
 * initiates a local trade, `session.yourReady`/`theyReady` here are always
 * "has the human confirmed" / "has the bot confirmed", never the reverse.
 * That is what lets this hook read the human-facing store directly instead
 * of needing its own private view of the negotiation.
 */
export function useLocalTradeBot(options: {
  enabled: boolean
  isFinished: boolean
  random?: RandomSource
}) {
  const { enabled, isFinished, random = systemRandom } = options
  const session = useTradeStore((state) => state.session)

  useEffect(() => {
    if (!enabled || isFinished || !session) return

    const botPlayerId = session.withPlayerId

    // A fresh invite the human just sent: this player is the invited
    // partner, so the bot decides whether to accept (and place) or decline.
    // The session reference only changes when the driver publishes a new
    // state, so this effect fires exactly once per pending invite — the
    // bot's own `accept`/`decline` call is what flips `phase` away from
    // 'pending' and stops it firing again.
    if (session.phase === 'pending') {
      const timeoutId = setTimeout(() => {
        respondToInvite({
          botPlayerId,
          driver: useLocalTradeDriver.getState(),
          getGameState: () => useGameStore.getState().gameState,
          random,
        })
      }, nextDelay(random))
      return () => clearTimeout(timeoutId)
    }

    // The human just confirmed (`yourReady`) and the bot hasn't yet
    // (`theyReady` false): react by confirming too. Gating on `!theyReady`
    // rather than a one-shot flag is what makes a human clear + re-place +
    // re-confirm work correctly — `place`/`clear` reset both ready flags
    // (spec 6.2), so this condition naturally re-arms itself for a fresh
    // confirm instead of committing a stale agreement.
    if (session.phase === 'open' && session.yourReady && !session.theyReady) {
      const timeoutId = setTimeout(() => {
        reactToHumanConfirm(botPlayerId, useLocalTradeDriver.getState())
      }, nextDelay(random))
      return () => clearTimeout(timeoutId)
    }
  }, [enabled, isFinished, session, random])
}
