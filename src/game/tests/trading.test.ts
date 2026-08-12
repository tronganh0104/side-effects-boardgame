import { describe, expect, it } from 'vitest'
import type { RandomSource } from '../engine/random'
import { createGame } from '../engine/setup'
import { startTurn, drawForTurn, endTurn } from '../engine/turns'
import { tradeCards } from '../engine/trading'

class SeededRandom implements RandomSource {
  private state: number

  constructor(seed: number) {
    this.state = seed
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0
    return this.state / 2 ** 32
  }
}

const createTurnGame = () =>
  createGame(['Ada', 'Ben'], { rng: new SeededRandom(10) })

const currentPlayer = <T extends ReturnType<typeof createTurnGame>>(game: T) =>
  game.players[game.currentPlayerIndex]

const otherPlayer = <T extends ReturnType<typeof createTurnGame>>(game: T) =>
  game.players.find((player) => player.id !== game.currentPlayerId)!

const draw = (game: ReturnType<typeof createTurnGame>) =>
  drawForTurn(game, game.currentPlayerId, { rng: new SeededRandom(20) })

/** A game past the draw phase, ready for trading. */
const playableGame = () => draw(createTurnGame())

describe('tradeCards', () => {
  it('swaps one hand card each way and preserves hand sizes', () => {
    const game = playableGame()
    const initiator = currentPlayer(game)
    const partner = otherPlayer(game)
    const initiatorCard = initiator.hand[0]
    const partnerCard = partner.hand[0]

    const result = tradeCards(game, {
      initiatorPlayerId: initiator.id,
      initiatorCardId: initiatorCard.instanceId,
      partnerPlayerId: partner.id,
      partnerCardId: partnerCard.instanceId,
    })

    const resultInitiator = result.players.find((player) => player.id === initiator.id)!
    const resultPartner = result.players.find((player) => player.id === partner.id)!

    expect(resultInitiator.hand).toHaveLength(initiator.hand.length)
    expect(resultPartner.hand).toHaveLength(partner.hand.length)
    expect(resultInitiator.hand.some((card) => card.instanceId === partnerCard.instanceId)).toBe(true)
    expect(resultInitiator.hand.some((card) => card.instanceId === initiatorCard.instanceId)).toBe(false)
    expect(resultPartner.hand.some((card) => card.instanceId === initiatorCard.instanceId)).toBe(true)
    expect(resultPartner.hand.some((card) => card.instanceId === partnerCard.instanceId)).toBe(false)
  })

  it('spends the initiating player quota but not the partner quota', () => {
    const game = playableGame()
    const initiator = currentPlayer(game)
    const partner = otherPlayer(game)

    const result = tradeCards(game, {
      initiatorPlayerId: initiator.id,
      initiatorCardId: initiator.hand[0].instanceId,
      partnerPlayerId: partner.id,
      partnerCardId: partner.hand[0].instanceId,
    })

    expect(result.players.find((player) => player.id === initiator.id)!.tradeUsedThisTurn).toBe(true)
    expect(result.players.find((player) => player.id === partner.id)!.tradeUsedThisTurn).toBe(false)
  })

  it('does not touch cardsPlayedThisTurn, drawPile, or discardPile', () => {
    const game = playableGame()
    const initiator = currentPlayer(game)
    const partner = otherPlayer(game)

    const result = tradeCards(game, {
      initiatorPlayerId: initiator.id,
      initiatorCardId: initiator.hand[0].instanceId,
      partnerPlayerId: partner.id,
      partnerCardId: partner.hand[0].instanceId,
    })

    expect(result.turn.cardsPlayedThisTurn).toBe(game.turn.cardsPlayedThisTurn)
    expect(result.drawPile).toEqual(game.drawPile)
    expect(result.discardPile).toEqual(game.discardPile)
  })

  it('rejects trading with yourself', () => {
    const game = playableGame()
    const initiator = currentPlayer(game)

    expect(() =>
      tradeCards(game, {
        initiatorPlayerId: initiator.id,
        initiatorCardId: initiator.hand[0].instanceId,
        partnerPlayerId: initiator.id,
        partnerCardId: initiator.hand[1].instanceId,
      }),
    ).toThrow('trade with themself')
  })

  it('rejects when either player does not exist', () => {
    const game = playableGame()
    const initiator = currentPlayer(game)
    const partner = otherPlayer(game)

    expect(() =>
      tradeCards(game, {
        initiatorPlayerId: 'ghost',
        initiatorCardId: 'anything',
        partnerPlayerId: partner.id,
        partnerCardId: partner.hand[0].instanceId,
      }),
    ).toThrow('initiating player does not exist')

    expect(() =>
      tradeCards(game, {
        initiatorPlayerId: initiator.id,
        initiatorCardId: initiator.hand[0].instanceId,
        partnerPlayerId: 'ghost',
        partnerCardId: 'anything',
      }),
    ).toThrow('partner player does not exist')
  })

  it('rejects when the running turn has not drawn yet', () => {
    const game = startTurn(createTurnGame())
    const initiator = currentPlayer(game)
    const partner = otherPlayer(game)

    expect(game.turn.phase).toBe('draw')
    expect(() =>
      tradeCards(game, {
        initiatorPlayerId: initiator.id,
        initiatorCardId: initiator.hand[0].instanceId,
        partnerPlayerId: partner.id,
        partnerCardId: partner.hand[0].instanceId,
      }),
    ).toThrow('running turn has drawn')
  })

  it('rejects when the initiator has already traded this turn', () => {
    const game = playableGame()
    const initiator = currentPlayer(game)
    const partner = otherPlayer(game)

    const afterFirstTrade = tradeCards(game, {
      initiatorPlayerId: initiator.id,
      initiatorCardId: initiator.hand[0].instanceId,
      partnerPlayerId: partner.id,
      partnerCardId: partner.hand[0].instanceId,
    })

    const initiatorAfter = afterFirstTrade.players.find((player) => player.id === initiator.id)!
    const partnerAfter = afterFirstTrade.players.find((player) => player.id === partner.id)!

    expect(() =>
      tradeCards(afterFirstTrade, {
        initiatorPlayerId: initiator.id,
        initiatorCardId: initiatorAfter.hand[0].instanceId,
        partnerPlayerId: partner.id,
        partnerCardId: partnerAfter.hand[0].instanceId,
      }),
    ).toThrow('already traded this turn')
  })

  it('rejects when a card is not in its claimed owner hand', () => {
    const game = playableGame()
    const initiator = currentPlayer(game)
    const partner = otherPlayer(game)

    expect(() =>
      tradeCards(game, {
        initiatorPlayerId: initiator.id,
        initiatorCardId: 'missing-card',
        partnerPlayerId: partner.id,
        partnerCardId: partner.hand[0].instanceId,
      }),
    ).toThrow('not in the initiating player hand')

    expect(() =>
      tradeCards(game, {
        initiatorPlayerId: initiator.id,
        initiatorCardId: initiator.hand[0].instanceId,
        partnerPlayerId: partner.id,
        partnerCardId: 'missing-card',
      }),
    ).toThrow('not in the partner player hand')

    // A card that belongs to the initiator cannot be claimed as the partner's.
    expect(() =>
      tradeCards(game, {
        initiatorPlayerId: initiator.id,
        initiatorCardId: initiator.hand[0].instanceId,
        partnerPlayerId: partner.id,
        partnerCardId: initiator.hand[1].instanceId,
      }),
    ).toThrow('not in the partner player hand')
  })

  it('allows a trade even when the partner hand already exceeds six cards', () => {
    const game = playableGame()
    const initiator = currentPlayer(game)
    const partner = otherPlayer(game)
    // A 1-for-1 trade never changes hand size on its own, so to exercise the
    // "no hand-limit enforcement" rule we simulate a pre-existing overflow
    // (as some other game effect might cause) and confirm trading neither
    // rejects it nor trims it back down.
    const extraCards = game.drawPile.slice(0, 3)
    const stuffedGame = {
      ...game,
      players: game.players.map((player) =>
        player.id === partner.id
          ? { ...player, hand: [...player.hand, ...extraCards] }
          : player,
      ),
      drawPile: game.drawPile.slice(3),
    }
    const stuffedPartner = stuffedGame.players.find((player) => player.id === partner.id)!
    expect(stuffedPartner.hand.length).toBeGreaterThan(6)

    const result = tradeCards(stuffedGame, {
      initiatorPlayerId: initiator.id,
      initiatorCardId: initiator.hand[0].instanceId,
      partnerPlayerId: partner.id,
      partnerCardId: stuffedPartner.hand[0].instanceId,
    })

    const resultPartner = result.players.find((player) => player.id === partner.id)!
    expect(resultPartner.hand.length).toBe(stuffedPartner.hand.length)
    expect(resultPartner.hand.length).toBeGreaterThan(6)
  })
})

describe('beginTurn quota reset', () => {
  it('resets the incoming player quota and leaves the outgoing player alone', () => {
    const game = playableGame()
    const initiator = currentPlayer(game)
    const partner = otherPlayer(game)
    // Force both players' quotas to "used" so we can tell reset apart from
    // an already-false default.
    const bothUsed = {
      ...game,
      players: game.players.map((player) => ({
        ...player,
        tradeUsedThisTurn: true,
      })),
    }

    const nextTurn = endTurn(bothUsed, initiator.id)

    expect(nextTurn.currentPlayerId).toBe(partner.id)
    expect(
      nextTurn.players.find((player) => player.id === partner.id)!.tradeUsedThisTurn,
    ).toBe(false)
    expect(
      nextTurn.players.find((player) => player.id === initiator.id)!.tradeUsedThisTurn,
    ).toBe(true)
  })
})
