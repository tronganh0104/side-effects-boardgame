import type { CardInstance } from '../../game/cards/types'
import type { RandomSource } from '../../game/engine/random'
import { systemRandom } from '../../game/engine/random'
import type { GameState } from '../../game/engine/types'
import type { LocalTradeDriverState } from '../../store/localTradeDriver'

export type TradeBotDecision = 'accept' | 'decline'

/** The slice of `localTradeDriver` the bot needs — never the full store, so
 *  a test double only has to implement four methods. */
export type TradeBotDriver = Pick<LocalTradeDriverState, 'accept' | 'decline' | 'place' | 'confirm'>

/** Pure and deterministic: the caller injects `rng`, this never touches
 *  Math.random(). 50/50 split, same idiom as `localChatBot.ts`'s `pickBotLine`. */
export function decideTradeInvite(rng: RandomSource): TradeBotDecision {
  return rng.next() < 0.5 ? 'decline' : 'accept'
}

/** Uniformly random card from `hand`, or undefined for an empty hand — the
 *  caller must treat that as "cannot place" rather than a silent no-op. */
export function pickTradeCard(
  hand: readonly CardInstance[],
  rng: RandomSource,
): CardInstance | undefined {
  if (hand.length === 0) return undefined
  const index = Math.floor(rng.next() * hand.length)
  return hand[Math.min(index, hand.length - 1)]
}

/**
 * Reacts to a pending invite addressed to `botPlayerId`: decides via
 * `decideTradeInvite`, and on accept immediately places a random card from
 * the bot's own hand (read live off `getGameState()` — never a snapshot
 * copied elsewhere, so it always reflects the hand `tradeCards` will later
 * mutate). An empty hand forces a decline instead of an accept that could
 * never place — see the module doc on `pickTradeCard`.
 *
 * Deliberately does NOT confirm here. Confirming before the human places
 * their own card would get wiped the moment that `place` call clears both
 * ready flags (trading spec 6.2), deadlocking the session with nobody left
 * to re-confirm. See `reactToHumanConfirm` for the other half of the
 * sequencing this splits on.
 */
export function respondToInvite(params: {
  botPlayerId: string
  driver: TradeBotDriver
  getGameState: () => GameState | undefined
  random?: RandomSource
}): void {
  const { botPlayerId, driver, getGameState, random = systemRandom } = params
  const hand = getGameState()?.players.find((player) => player.id === botPlayerId)?.hand ?? []

  if (hand.length === 0) {
    driver.decline(botPlayerId)
    return
  }

  if (decideTradeInvite(random) === 'decline') {
    driver.decline(botPlayerId)
    return
  }

  driver.accept(botPlayerId)
  const card = pickTradeCard(hand, random)
  if (card) driver.place(botPlayerId, card.instanceId)
}

/**
 * Reacts to the human's confirm by confirming as the bot. Callers must only
 * invoke this once the session shows the human's own ready flag true and
 * the bot's still false (see `useLocalTradeBot`'s effect condition) — that
 * is what makes this "confirm in response to the human", not a timer racing
 * them, and what stops a stale agreement from surviving a human clear +
 * re-place: a fresh confirm is required every time the ready flags reset.
 */
export function reactToHumanConfirm(botPlayerId: string, driver: TradeBotDriver): void {
  driver.confirm(botPlayerId)
}
