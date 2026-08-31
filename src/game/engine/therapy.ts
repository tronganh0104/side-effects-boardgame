import type { DisorderDefinition } from '../cards/types'
import { maybeAutoEndTurn } from './turns'
import type { GameState } from './types'
import { cannotPlayCards } from './temporaryEffects'
import { assertGameIsPlaying, finalizeGameIfWon } from './gameStatus'

const MAX_CARDS_PLAYED_PER_TURN = 2

export function canTreatWithTherapy(disorder: DisorderDefinition): boolean {
  return disorder.therapyAllowed
}

/** Uses Therapy to remove an untreated, Therapy-eligible Disorder from own Psyche. */
export function playTherapy(
  game: GameState,
  playerId: string,
  therapyCardId: string,
  disorderCardId: string,
): GameState {
  assertGameIsPlaying(game)
  if (playerId !== game.currentPlayerId) {
    throw new Error('Only the current player may take this action.')
  }
  if (game.turn.phase !== 'play') {
    throw new Error('Therapy may only be played during the play phase.')
  }
  if (game.turn.cardsPlayedThisTurn >= MAX_CARDS_PLAYED_PER_TURN) {
    throw new Error('A player may play at most two cards per turn.')
  }

  const currentPlayer = game.players[game.currentPlayerIndex]
  if (cannotPlayCards(currentPlayer)) {
    throw new Error('The current player cannot play cards this turn.')
  }
  const therapyIndex = currentPlayer.hand.findIndex(
    (card) => card.instanceId === therapyCardId,
  )
  if (therapyIndex === -1) {
    throw new Error('The selected Therapy is not in the current player hand.')
  }
  const therapy = currentPlayer.hand[therapyIndex]
  if (therapy.cardType !== 'therapy') {
    throw new Error('The selected card is not Therapy.')
  }

  const slotIndex = currentPlayer.psyche.slots.findIndex(
    (slot) => slot.disorder.instanceId === disorderCardId,
  )
  if (slotIndex === -1) {
    throw new Error('The target Disorder is not in the current player Psyche.')
  }
  const slot = currentPlayer.psyche.slots[slotIndex]
  if (slot.drug) {
    throw new Error('Therapy cannot treat a Disorder that already has a Drug.')
  }
  if (!canTreatWithTherapy(slot.disorder)) {
    throw new Error('This Disorder cannot be treated with Therapy.')
  }

  return maybeAutoEndTurn(finalizeGameIfWon({
    ...game,
    players: game.players.map((player, index) =>
      index === game.currentPlayerIndex
        ? {
            ...player,
            hand: player.hand.filter(
              (_, handIndex) => handIndex !== therapyIndex,
            ),
            psyche: {
              slots: player.psyche.slots.filter(
                (_, currentSlotIndex) => currentSlotIndex !== slotIndex,
              ),
            },
          }
        : player,
    ),
    discardPile: [...game.discardPile, therapy, slot.disorder],
    turn: {
      ...game.turn,
      cardsPlayedThisTurn: game.turn.cardsPlayedThisTurn + 1,
    },
  }))
}