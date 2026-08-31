import { canReceiveDisorder } from './sideEffects'
import { maybeAutoEndTurn } from './turns'
import { cannotPlayCards } from './temporaryEffects'
import { assertGameIsPlaying } from './gameStatus'
import type { GameState } from './types'

const MAX_CARDS_PLAYED_PER_TURN = 2

/** Plays a Disorder from hand onto an exposed opponent Psyche. */
export function playDisorder(
  game: GameState,
  playerId: string,
  disorderCardId: string,
  targetPlayerId: string,
): GameState {
  assertGameIsPlaying(game)
  if (playerId !== game.currentPlayerId) {
    throw new Error('Only the current player may take this action.')
  }
  if (game.turn.phase !== 'play') {
    throw new Error('A Disorder may only be played during the play phase.')
  }
  if (game.turn.cardsPlayedThisTurn >= MAX_CARDS_PLAYED_PER_TURN) {
    throw new Error('A player may play at most two cards per turn.')
  }
  if (targetPlayerId === playerId) {
    throw new Error('A player cannot target themself with a Disorder.')
  }

  const currentPlayer = game.players[game.currentPlayerIndex]
  if (cannotPlayCards(currentPlayer)) {
    throw new Error('The current player cannot play cards this turn.')
  }
  const disorderIndex = currentPlayer.hand.findIndex(
    (card) => card.instanceId === disorderCardId,
  )
  if (disorderIndex === -1) {
    throw new Error('The selected Disorder is not in the current player hand.')
  }

  const disorder = currentPlayer.hand[disorderIndex]
  if (disorder.cardType !== 'disorder') {
    throw new Error('The selected card is not a Disorder.')
  }

  const targetPlayer = game.players.find(
    (player) => player.id === targetPlayerId,
  )
  if (!targetPlayer) {
    throw new Error('The target player does not exist.')
  }
  if (
    targetPlayer.psyche.slots.some(
      (slot) => slot.disorder.definitionId === disorder.definitionId,
    )
  ) {
    throw new Error('The target player already has this Disorder.')
  }
  if (!canReceiveDisorder(targetPlayer, disorder.definitionId)) {
    throw new Error('The target player is not exposed to this Disorder.')
  }

  return maybeAutoEndTurn({
    ...game,
    players: game.players.map((player) => {
      if (player.id === currentPlayer.id) {
        return {
          ...player,
          hand: player.hand.filter((_, index) => index !== disorderIndex),
        }
      }
      if (player.id === targetPlayer.id) {
        return {
          ...player,
          psyche: { slots: [...player.psyche.slots, { disorder }] },
        }
      }
      return player
    }),
    turn: {
      ...game.turn,
      cardsPlayedThisTurn: game.turn.cardsPlayedThisTurn + 1,
    },
  })
}