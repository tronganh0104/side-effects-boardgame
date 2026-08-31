import type { GameState, PlayerState } from './types'
import { maybeAutoEndTurn } from './turns'
import { cannotPlayCards } from './temporaryEffects'
import { assertGameIsPlaying, finalizeGameIfWon } from './gameStatus'

const MAX_CARDS_PLAYED_PER_TURN = 2

function replaceCurrentPlayer(
  game: GameState,
  player: PlayerState,
): PlayerState[] {
  return game.players.map((candidate, index) =>
    index === game.currentPlayerIndex ? player : candidate,
  )
}

/** Plays a Drug from hand onto its matching, untreated Disorder in the player's Psyche. */
export function playDrug(
  game: GameState,
  playerId: string,
  drugCardId: string,
  disorderCardId: string,
): GameState {
  assertGameIsPlaying(game)
  if (playerId !== game.currentPlayerId) {
    throw new Error('Only the current player may take this action.')
  }
  if (game.turn.phase !== 'play') {
    throw new Error('A Drug may only be played during the play phase.')
  }
  if (game.turn.cardsPlayedThisTurn >= MAX_CARDS_PLAYED_PER_TURN) {
    throw new Error('A player may play at most two cards per turn.')
  }

  const currentPlayer = game.players[game.currentPlayerIndex]
  if (cannotPlayCards(currentPlayer)) {
    throw new Error('The current player cannot play cards this turn.')
  }
  const drugIndex = currentPlayer.hand.findIndex(
    (card) => card.instanceId === drugCardId,
  )
  if (drugIndex === -1) {
    throw new Error('The selected Drug is not in the current player hand.')
  }

  const drug = currentPlayer.hand[drugIndex]
  if (drug.cardType !== 'drug') {
    throw new Error('The selected card is not a Drug.')
  }

  const targetSlotIndex = currentPlayer.psyche.slots.findIndex(
    (slot) => slot.disorder.instanceId === disorderCardId,
  )
  if (targetSlotIndex === -1) {
    throw new Error('The target Disorder is not in the current player Psyche.')
  }

  const targetSlot = currentPlayer.psyche.slots[targetSlotIndex]
  if (targetSlot.drug) {
    throw new Error('The target Disorder already has a Drug treatment.')
  }
  if (drug.treats !== targetSlot.disorder.definitionId) {
    throw new Error('This Drug does not treat the target Disorder.')
  }

  return maybeAutoEndTurn(finalizeGameIfWon({
    ...game,
    players: replaceCurrentPlayer(game, {
      ...currentPlayer,
      hand: currentPlayer.hand.filter((_, index) => index !== drugIndex),
      psyche: {
        slots: currentPlayer.psyche.slots.map((slot, index) =>
          index === targetSlotIndex ? { ...slot, drug } : slot,
        ),
      },
    }),
    turn: {
      ...game.turn,
      cardsPlayedThisTurn: game.turn.cardsPlayedThisTurn + 1,
    },
  }))
}