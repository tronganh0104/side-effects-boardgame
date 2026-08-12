import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../../store/gameStore'
import { createLocalTradeDriverStore } from '../../store/localTradeDriver'
import { useTradeStore } from '../../store/tradeStore'
import {
  pickTradeCard,
  reactToHumanConfirm,
  respondToInvite,
  type TradeBotDriver,
} from '../../components/trade/localTradeBot'
import type { RandomSource } from '../engine/random'

type Driver = ReturnType<typeof createLocalTradeDriverStore>

/** Drives a fresh, isolated local game + driver pair for one test. */
function setupPlayableGame() {
  useGameStore.getState().resetGame()
  useTradeStore.getState().reset()
  useGameStore.getState().createLocalGame(['Ada', 'Ben'])
  // Leave the draw phase — trading is blocked while turn.phase === 'draw'.
  useGameStore.getState().draw()

  const game = useGameStore.getState().gameState!
  const initiator = game.players[game.currentPlayerIndex]
  const partner = game.players.find((player) => player.id !== initiator.id)!
  return { initiator, partner }
}

/** A `RandomSource` that always returns the same value — deterministic for
 *  both `decideTradeInvite` (< 0.5 declines, >= 0.5 accepts) and
 *  `pickTradeCard` (`floor(value * hand.length)`). */
function fixedRandom(value: number): RandomSource {
  return { next: () => value }
}

/** Has the bot respond to whatever invite is currently addressed to
 *  `partnerId`, using the real driver and the real game state — exactly the
 *  calls `useLocalTradeBot` would make, minus the setTimeout. */
function botRespondsToInvite(driver: Driver, partnerId: string, random: RandomSource): void {
  respondToInvite({
    botPlayerId: partnerId,
    driver: driver.getState(),
    getGameState: () => useGameStore.getState().gameState,
    random,
  })
}

/** Runs one full trade round to commit, in the order the app actually
 *  drives it: the bot accepts and places first (never confirming yet — see
 *  localTradeBot.ts), then the human places and confirms, then the bot
 *  reacts to that confirm. */
function runFullTrade(
  driver: Driver,
  params: { initiatorId: string; partnerId: string; initiatorCardId: string; random: RandomSource },
): void {
  const { initiatorId, partnerId, initiatorCardId, random } = params
  driver.getState().invite(initiatorId, partnerId)
  botRespondsToInvite(driver, partnerId, random)
  driver.getState().place(initiatorId, initiatorCardId)
  driver.getState().confirm(initiatorId)
  reactToHumanConfirm(partnerId, driver.getState())
}

describe('localTradeDriver + local trade bot', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame()
    useTradeStore.getState().reset()
  })

  it('forced decline: the session closes, nothing swaps, and the quota stays unspent', () => {
    const { initiator, partner } = setupPlayableGame()
    const driver = createLocalTradeDriverStore()

    driver.getState().invite(initiator.id, partner.id)
    expect(useTradeStore.getState().session?.phase).toBe('pending')

    // < 0.5 → decideTradeInvite declines.
    botRespondsToInvite(driver, partner.id, fixedRandom(0.1))

    expect(useTradeStore.getState().session).toBeNull()
    expect(useTradeStore.getState().lastCloseReason).toBe('declined')

    const game = useGameStore.getState().gameState!
    expect(game.players.find((player) => player.id === initiator.id)!.tradeUsedThisTurn).toBe(false)
    // Hands are byte-for-byte the pre-invite hands — nothing was ever placed.
    expect(game.players.find((player) => player.id === partner.id)!.hand).toEqual(partner.hand)
  })

  it('an empty partner hand forces a decline instead of an accept that could never place', () => {
    const { initiator, partner } = setupPlayableGame()
    const driver = createLocalTradeDriverStore()

    driver.getState().invite(initiator.id, partner.id)
    // >= 0.5 would normally accept, but the hand is empty below.
    respondToInvite({
      botPlayerId: partner.id,
      driver: driver.getState(),
      getGameState: () => {
        const game = useGameStore.getState().gameState!
        return {
          ...game,
          players: game.players.map((player) =>
            player.id === partner.id ? { ...player, hand: [] } : player,
          ),
        }
      },
      random: fixedRandom(0.9),
    })

    expect(useTradeStore.getState().session).toBeNull()
    expect(useTradeStore.getState().lastCloseReason).toBe('declined')
  })

  it('forced accept: the bot places, the human confirms, the bot reacts, and the two specific cards swap', () => {
    const { initiator, partner } = setupPlayableGame()
    const driver = createLocalTradeDriverStore()
    const random = fixedRandom(0.9) // >= 0.5 → accept; also picks the card deterministically.
    const expectedPartnerCard = pickTradeCard(partner.hand, random)!

    driver.getState().invite(initiator.id, partner.id)
    botRespondsToInvite(driver, partner.id, random)

    expect(useTradeStore.getState().session?.phase).toBe('open')
    expect(useTradeStore.getState().session?.theyPlaced).toBe(true)
    expect(useTradeStore.getState().session?.yourCardId).toBeNull()

    const initiatorCard = initiator.hand[0]
    driver.getState().place(initiator.id, initiatorCard.instanceId)
    driver.getState().confirm(initiator.id)

    // Only the human has confirmed so far — no commit yet.
    expect(useTradeStore.getState().session?.yourReady).toBe(true)
    expect(useTradeStore.getState().session?.theyReady).toBe(false)
    expect(useGameStore.getState().gameState!.players.find((p) => p.id === initiator.id)!.hand
      .some((card) => card.instanceId === initiatorCard.instanceId)).toBe(true)

    reactToHumanConfirm(partner.id, driver.getState())

    expect(useTradeStore.getState().session).toBeNull()
    expect(useTradeStore.getState().lastCloseReason).toBe('committed')

    const after = useGameStore.getState().gameState!
    const afterInitiator = after.players.find((player) => player.id === initiator.id)!
    const afterPartner = after.players.find((player) => player.id === partner.id)!
    expect(afterInitiator.hand.some((card) => card.instanceId === expectedPartnerCard.instanceId)).toBe(true)
    expect(afterInitiator.hand.some((card) => card.instanceId === initiatorCard.instanceId)).toBe(false)
    expect(afterPartner.hand.some((card) => card.instanceId === initiatorCard.instanceId)).toBe(true)
    expect(afterPartner.hand.some((card) => card.instanceId === expectedPartnerCard.instanceId)).toBe(false)
    expect(afterInitiator.tradeUsedThisTurn).toBe(true)
  })

  it('never confirms on the bot\'s behalf while merely responding to an invite', () => {
    const { initiator, partner } = setupPlayableGame()
    const driver = createLocalTradeDriverStore()
    driver.getState().invite(initiator.id, partner.id)

    const calls: string[] = []
    const state = driver.getState()
    const spyDriver: TradeBotDriver = {
      accept: (id) => {
        calls.push('accept')
        state.accept(id)
      },
      decline: (id) => {
        calls.push('decline')
        state.decline(id)
      },
      place: (id, cardId) => {
        calls.push('place')
        state.place(id, cardId)
      },
      confirm: (id) => {
        calls.push('confirm')
        state.confirm(id)
      },
    }

    respondToInvite({
      botPlayerId: partner.id,
      driver: spyDriver,
      getGameState: () => useGameStore.getState().gameState,
      random: fixedRandom(0.9),
    })

    expect(calls).toEqual(['accept', 'place'])
    expect(useTradeStore.getState().session?.phase).toBe('open')
    expect(useTradeStore.getState().session?.theyReady).toBe(false)
  })

  it('does not commit a stale agreement: a human re-place after confirming clears ready flags, and the bot commits only after a fresh confirm', () => {
    const { initiator, partner } = setupPlayableGame()
    const driver = createLocalTradeDriverStore()
    const random = fixedRandom(0.9)
    const partnerCard = pickTradeCard(partner.hand, random)!

    driver.getState().invite(initiator.id, partner.id)
    botRespondsToInvite(driver, partner.id, random)

    const [firstCard, secondCard] = initiator.hand
    driver.getState().place(initiator.id, firstCard.instanceId)
    driver.getState().confirm(initiator.id)
    expect(useTradeStore.getState().session?.yourReady).toBe(true)

    // The human changes their mind before the bot's (delayed, in the real
    // app) reaction to that confirm ever fires.
    driver.getState().place(initiator.id, secondCard.instanceId)
    expect(useTradeStore.getState().session?.yourReady).toBe(false)
    expect(useTradeStore.getState().session?.theyReady).toBe(false)

    // The bot reacting now is reacting to stale information — it must not
    // commit, because the human's ready flag was wiped by the re-place.
    reactToHumanConfirm(partner.id, driver.getState())
    expect(useTradeStore.getState().session?.phase).toBe('open')
    expect(useTradeStore.getState().lastCloseReason).toBeNull()

    // Only a fresh human confirm completes the deal.
    driver.getState().confirm(initiator.id)

    expect(useTradeStore.getState().session).toBeNull()
    expect(useTradeStore.getState().lastCloseReason).toBe('committed')

    const after = useGameStore.getState().gameState!
    const afterInitiator = after.players.find((player) => player.id === initiator.id)!
    const afterPartner = after.players.find((player) => player.id === partner.id)!
    // The card that actually swapped is the *second* card — the one placed
    // after the re-place — never the first, stale one.
    expect(afterInitiator.hand.some((card) => card.instanceId === partnerCard.instanceId)).toBe(true)
    expect(afterInitiator.hand.some((card) => card.instanceId === secondCard.instanceId)).toBe(false)
    expect(afterPartner.hand.some((card) => card.instanceId === secondCard.instanceId)).toBe(true)
    expect(afterPartner.hand.some((card) => card.instanceId === firstCard.instanceId)).toBe(false)
  })

  it("never carries the bot's card id into the human's view before commit", () => {
    const { initiator, partner } = setupPlayableGame()
    const driver = createLocalTradeDriverStore()
    const random = fixedRandom(0.9)
    const partnerCard = pickTradeCard(partner.hand, random)!

    driver.getState().invite(initiator.id, partner.id)
    botRespondsToInvite(driver, partner.id, random)

    const view = useTradeStore.getState().session!
    expect(view.yourRole).toBe('initiator')
    // Face-down holds: the bot's placement only ever shows up as the
    // boolean `theyPlaced`, on a payload shape with no field able to carry
    // its actual card id.
    expect(view.theyPlaced).toBe(true)
    expect(Object.keys(view).sort()).toEqual(
      ['phase', 'sessionId', 'theyPlaced', 'theyReady', 'withPlayerId', 'yourCardId', 'yourReady', 'yourRole'].sort(),
    )
    expect(JSON.stringify(view)).not.toContain(partnerCard.instanceId)
  })

  it('closes the session on cancel without spending the trade quota', () => {
    const { initiator, partner } = setupPlayableGame()
    const driver = createLocalTradeDriverStore()

    driver.getState().invite(initiator.id, partner.id)
    botRespondsToInvite(driver, partner.id, fixedRandom(0.9))

    driver.getState().cancel(initiator.id)

    expect(useTradeStore.getState().session).toBeNull()
    expect(useTradeStore.getState().lastCloseReason).toBe('cancelled')

    const game = useGameStore.getState().gameState!
    expect(game.players.find((player) => player.id === initiator.id)!.tradeUsedThisTurn).toBe(false)

    // Inviting again afterwards must succeed, not be rejected as "still
    // busy" — `guarded` swallows thrown errors into `.error` rather than
    // rethrowing, so a real failure here has to be read off that field.
    driver.getState().invite(initiator.id, partner.id)
    expect(driver.getState().error).toBeUndefined()
  })

  it('surfaces the engine quota rejection without the driver duplicating the check', () => {
    const { initiator, partner } = setupPlayableGame()
    const driver = createLocalTradeDriverStore()
    const random = fixedRandom(0.9)

    // First trade succeeds and spends the initiator's once-per-turn quota.
    runFullTrade(driver, {
      initiatorId: initiator.id,
      partnerId: partner.id,
      initiatorCardId: initiator.hand[0].instanceId,
      random,
    })
    expect(useTradeStore.getState().lastCloseReason).toBe('committed')

    // Second trade the same turn: the negotiation itself is fine (nothing
    // here re-checks the quota), so it reaches commit — where the engine
    // throws, and the driver just relays that as a normal close.
    const refreshedGame = useGameStore.getState().gameState!
    const stillInitiator = refreshedGame.players.find((player) => player.id === initiator.id)!

    runFullTrade(driver, {
      initiatorId: initiator.id,
      partnerId: partner.id,
      initiatorCardId: stillInitiator.hand[0].instanceId,
      random,
    })

    expect(useTradeStore.getState().lastCloseReason).toBe('cancelled')
    expect(useGameStore.getState().error).toMatch(/already traded/)
  })
})
