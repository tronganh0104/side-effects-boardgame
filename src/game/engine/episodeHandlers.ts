import type { DisorderId } from '../cards/types'
import { shuffle, systemRandom, type RandomSource } from './random'
import type { GameState, PlayerState } from './types'

export interface EpisodeEffectOptions {
  rng?: RandomSource
  chosenCardId?: string
  tremorsDiscardCardIds?: string[]
  /** Server-only canonical fallback when the three-second choice expires. */
  tremorsTimedOut?: true
}

export interface EpisodeHandlerContext {
  game: GameState
  attacker: PlayerState
  target: PlayerState
  options: EpisodeEffectOptions
}

export type EpisodeHandler = (context: EpisodeHandlerContext) => GameState

function replacePlayers(
  game: GameState,
  replacements: ReadonlyMap<string, PlayerState>,
): PlayerState[] {
  return game.players.map((player) => replacements.get(player.id) ?? player)
}

const madness: EpisodeHandler = ({ game, target }) => {
  const discardedDrugs = target.psyche.slots.flatMap((slot) =>
    slot.drug ? [slot.drug] : [],
  )

  return {
    ...game,
    players: replacePlayers(
      game,
      new Map([
        [
          target.id,
          {
            ...target,
            psyche: {
              slots: target.psyche.slots.map((slot) => ({
                disorder: slot.disorder,
              })),
            },
          },
        ],
      ]),
    ),
    discardPile: [...game.discardPile, ...discardedDrugs],
  }
}

const suicidalThoughts: EpisodeHandler = ({ game, target }) => ({
  ...game,
  players: replacePlayers(
    game,
    new Map([[target.id, { ...target, hand: [] }]]),
  ),
  discardPile: [...game.discardPile, ...target.hand],
})

const gamblingAddiction: EpisodeHandler = ({
  game,
  attacker,
  target,
  options,
}) => {
  const stolenCards = shuffle(target.hand, options.rng ?? systemRandom).slice(
    0,
    3,
  )
  const stolenCardIds = new Set(stolenCards.map((card) => card.instanceId))

  return {
    ...game,
    players: replacePlayers(
      game,
      new Map([
        [
          attacker.id,
          { ...attacker, hand: [...attacker.hand, ...stolenCards] },
        ],
        [
          target.id,
          {
            ...target,
            hand: target.hand.filter(
              (card) => !stolenCardIds.has(card.instanceId),
            ),
          },
        ],
      ]),
    ),
  }
}

const anxiety: EpisodeHandler = ({ game, attacker, target, options }) => {
  if (target.hand.length === 0) return game
  if (!options.chosenCardId) {
    throw new Error('Anxiety requires a chosen card from the target hand.')
  }

  const cardIndex = target.hand.findIndex(
    (card) => card.instanceId === options.chosenCardId,
  )
  if (cardIndex === -1) {
    throw new Error('The chosen Anxiety card is not in the target player hand.')
  }

  const card = target.hand[cardIndex]
  return {
    ...game,
    players: replacePlayers(
      game,
      new Map([
        [attacker.id, { ...attacker, hand: [...attacker.hand, card] }],
        [
          target.id,
          {
            ...target,
            hand: target.hand.filter((_, index) => index !== cardIndex),
          },
        ],
      ]),
    ),
  }
}

const depression: EpisodeHandler = ({ game, target }) => ({
  ...game,
  players: replacePlayers(
    game,
    new Map([
      [
        target.id,
        {
          ...target,
          effects: {
            ...target.effects,
            skipTurns: target.effects.skipTurns + 1,
          },
        },
      ],
    ]),
  ),
})

const impotence: EpisodeHandler = ({ game, target }) => ({
  ...game,
  players: replacePlayers(
    game,
    new Map([
      [
        target.id,
        {
          ...target,
          effects: {
            ...target.effects,
            cannotPlayTurns: target.effects.cannotPlayTurns + 1,
          },
        },
      ],
    ]),
  ),
})

const anorexia: EpisodeHandler = ({ game, target }) => ({
  ...game,
  players: replacePlayers(
    game,
    new Map([
      [
        target.id,
        {
          ...target,
          effects: {
            ...target.effects,
            skipDrawTurns: target.effects.skipDrawTurns + 1,
          },
        },
      ],
    ]),
  ),
})

const tremors: EpisodeHandler = ({ game, target, options }) => {
  if (target.hand.length < 3 || options.tremorsTimedOut) {
    return suicidalThoughts({ game, target, attacker: target, options })
  }

  const selectedIds = options.tremorsDiscardCardIds
  if (!selectedIds || selectedIds.length !== 3) {
    throw new Error('Tremors requires exactly three selected cards.')
  }
  const selectedIdSet = new Set(selectedIds)
  if (selectedIdSet.size !== 3) {
    throw new Error('Tremors selected cards must be unique.')
  }
  const selectedCards = target.hand.filter((card) =>
    selectedIdSet.has(card.instanceId),
  )
  if (selectedCards.length !== 3) {
    throw new Error(
      'Every Tremors selection must be in the target player hand.',
    )
  }

  return {
    ...game,
    players: replacePlayers(
      game,
      new Map([
        [
          target.id,
          {
            ...target,
            hand: target.hand.filter(
              (card) => !selectedIdSet.has(card.instanceId),
            ),
          },
        ],
      ]),
    ),
    discardPile: [...game.discardPile, ...selectedCards],
  }
}

export const episodeHandlers: Partial<Record<DisorderId, EpisodeHandler>> = {
  depression,
  tremors,
  impotence,
  anorexia,
  madness,
  'suicidal-thoughts': suicidalThoughts,
  'gambling-addiction': gamblingAddiction,
  anxiety,
}
