import { episodeHandlers, type EpisodeEffectOptions } from './episodeHandlers'
import { maybeAutoEndTurn } from './turns'
import { assertGameIsPlaying } from './gameStatus'
import { cannotPlayCards } from './temporaryEffects'
import type { GameState, PlayerState } from './types'
import type { DisorderId } from '../cards/types'

export type { EpisodeEffectOptions } from './episodeHandlers'

const MAX_CARDS_PLAYED_PER_TURN = 2

/** Effects that can remove or transfer cards from the target's hand. */
export function episodeMutatesTargetHand(disorderId: DisorderId): boolean {
  return (
    disorderId === 'suicidal-thoughts' ||
    disorderId === 'tremors' ||
    disorderId === 'gambling-addiction' ||
    disorderId === 'anxiety'
  )
}

export interface EpisodePlayContext {
  attackerIndex: number
  attacker: PlayerState
  episodeIndex: number
  target: PlayerState
  targetDisorderId: PlayerState['psyche']['slots'][number]['disorder']['definitionId']
}

export function getEpisodePlayContext(
  game: GameState,
  playerId: string,
  episodeCardId: string,
  targetPlayerId: string,
  targetDisorderCardId: string,
): EpisodePlayContext {
  assertGameIsPlaying(game)
  if (playerId !== game.currentPlayerId)
    throw new Error('Only the current player may take this action.')
  if (game.turn.phase !== 'play')
    throw new Error('Episode may only be played during the play phase.')
  if (game.turn.cardsPlayedThisTurn >= MAX_CARDS_PLAYED_PER_TURN)
    throw new Error('A player may play at most two cards per turn.')
  if (targetPlayerId === playerId)
    throw new Error('A player cannot target themself with an Episode.')
  const attackerIndex = game.currentPlayerIndex
  const attacker = game.players[attackerIndex]
  if (cannotPlayCards(attacker))
    throw new Error('The current player cannot play cards this turn.')
  const episodeIndex = attacker.hand.findIndex(
    (card) => card.instanceId === episodeCardId,
  )
  if (episodeIndex === -1)
    throw new Error('The selected Episode is not in the current player hand.')
  if (attacker.hand[episodeIndex].cardType !== 'episode')
    throw new Error('The selected card is not an Episode.')
  const target = game.players.find((player) => player.id === targetPlayerId)
  if (!target) throw new Error('The target player does not exist.')
  const targetSlot = target.psyche.slots.find(
    (slot) => slot.disorder.instanceId === targetDisorderCardId,
  )
  if (!targetSlot)
    throw new Error('The target Disorder is not in the target player Psyche.')
  if (targetSlot.drug)
    throw new Error('Episode cannot target a treated Disorder.')
  if (!episodeHandlers[targetSlot.disorder.definitionId])
    throw new Error(
      'This Disorder does not have an implemented Episode effect.',
    )
  return {
    attackerIndex,
    attacker,
    episodeIndex,
    target,
    targetDisorderId: targetSlot.disorder.definitionId,
  }
}

export function getEpisodeDecisionRequirement(
  context: EpisodePlayContext,
):
  | { kind: 'anxiety' | 'tremors'; chooserPlayerId: string; cardIds: string[] }
  | undefined {
  if (context.targetDisorderId === 'anxiety' && context.target.hand.length > 0)
    return {
      kind: 'anxiety',
      chooserPlayerId: context.attacker.id,
      cardIds: context.target.hand.map((card) => card.instanceId),
    }
  if (context.targetDisorderId === 'tremors' && context.target.hand.length >= 3)
    return {
      kind: 'tremors',
      chooserPlayerId: context.target.id,
      cardIds: context.target.hand.map((card) => card.instanceId),
    }
  return undefined
}

/** Plays the shared Episode card and dispatches the target Disorder's supported effect. */
export function playEpisode(
  game: GameState,
  playerId: string,
  episodeCardId: string,
  targetPlayerId: string,
  targetDisorderCardId: string,
  options: EpisodeEffectOptions = {},
): GameState {
  const context = getEpisodePlayContext(
    game,
    playerId,
    episodeCardId,
    targetPlayerId,
    targetDisorderCardId,
  )
  const handler = episodeHandlers[context.targetDisorderId]!
  const episode = context.attacker.hand[context.episodeIndex]
  const baseGame: GameState = {
    ...game,
    players: game.players.map((player, index) =>
      index === context.attackerIndex
        ? {
            ...player,
            hand: player.hand.filter(
              (_, handIndex) => handIndex !== context.episodeIndex,
            ),
          }
        : player,
    ),
    discardPile: [...game.discardPile, episode],
    turn: {
      ...game.turn,
      cardsPlayedThisTurn: game.turn.cardsPlayedThisTurn + 1,
    },
  }
  return maybeAutoEndTurn(handler({
    game: baseGame,
    attacker: baseGame.players[context.attackerIndex],
    target: baseGame.players.find((player) => player.id === targetPlayerId)!,
    options,
  }))
}