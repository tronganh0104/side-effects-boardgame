import type { GameState } from './types'

export interface TradeCardsParams {
  initiatorPlayerId: string
  initiatorCardId: string
  partnerPlayerId: string
  partnerCardId: string
}

/** Swaps one hand card each between two players, spending the initiator's once-per-turn trade quota. */
export function tradeCards(game: GameState, params: TradeCardsParams): GameState {
  const { initiatorPlayerId, initiatorCardId, partnerPlayerId, partnerCardId } = params

  if (initiatorPlayerId === partnerPlayerId) {
    throw new Error('A player cannot trade with themself.')
  }

  const initiator = game.players.find((player) => player.id === initiatorPlayerId)
  if (!initiator) {
    throw new Error('The initiating player does not exist.')
  }
  const partner = game.players.find((player) => player.id === partnerPlayerId)
  if (!partner) {
    throw new Error('The partner player does not exist.')
  }

  if (game.status !== 'playing') {
    throw new Error('Trading is only allowed while the game is playing.')
  }
  if (game.turn.phase === 'draw') {
    throw new Error('Trading is not allowed until the running turn has drawn.')
  }
  if (initiator.tradeUsedThisTurn) {
    throw new Error('The initiating player has already traded this turn.')
  }

  const initiatorCardIndex = initiator.hand.findIndex(
    (card) => card.instanceId === initiatorCardId,
  )
  if (initiatorCardIndex === -1) {
    throw new Error('The selected card is not in the initiating player hand.')
  }
  const partnerCardIndex = partner.hand.findIndex(
    (card) => card.instanceId === partnerCardId,
  )
  if (partnerCardIndex === -1) {
    throw new Error('The selected card is not in the partner player hand.')
  }

  const initiatorCard = initiator.hand[initiatorCardIndex]
  const partnerCard = partner.hand[partnerCardIndex]

  return {
    ...game,
    players: game.players.map((player) => {
      if (player.id === initiator.id) {
        return {
          ...player,
          hand: player.hand.map((card, index) =>
            index === initiatorCardIndex ? partnerCard : card,
          ),
          tradeUsedThisTurn: true,
        }
      }
      if (player.id === partner.id) {
        return {
          ...player,
          hand: player.hand.map((card, index) =>
            index === partnerCardIndex ? initiatorCard : card,
          ),
        }
      }
      return player
    }),
  }
}
