import { createDeck } from '../cards/deckFactory'
import type { CardInstance, DisorderDefinition } from '../cards/types'
import { shuffle, systemRandom, type RandomSource } from './random'
import type { GameState, PlayerState } from './types'

const MIN_PLAYERS = 2
const MAX_PLAYERS = 8
const INITIAL_HAND_SIZE = 4

export interface CreateGameOptions {
  rng?: RandomSource
  playerIds?: readonly string[]
}

function validatePlayerNames(playerNames: readonly string[]): void {
  if (playerNames.length < MIN_PLAYERS || playerNames.length > MAX_PLAYERS) {
    throw new Error(`A game requires ${MIN_PLAYERS} to ${MAX_PLAYERS} players.`)
  }

  const normalizedNames = playerNames.map((name) => name.trim())
  if (normalizedNames.some((name) => name.length === 0)) {
    throw new Error('Every player must have a name.')
  }

  if (new Set(normalizedNames).size !== normalizedNames.length) {
    throw new Error('Player names must be unique.')
  }
}

function dealInitialPsyches(
  disorders: readonly CardInstance<DisorderDefinition>[],
  playerCount: number,
): {
  psyches: CardInstance<DisorderDefinition>[][]
  remaining: CardInstance<DisorderDefinition>[]
} {
  const disordersPerPlayer = playerCount <= 5 ? 4 : 3
  const remaining = [...disorders]
  const psyches = Array.from(
    { length: playerCount },
    () => [] as CardInstance<DisorderDefinition>[],
  )

  for (const psyche of psyches) {
    while (psyche.length < disordersPerPlayer) {
      const existingDefinitions = new Set(
        psyche.map((disorder) => disorder.definitionId),
      )
      const cardIndex = remaining.findIndex(
        (disorder) => !existingDefinitions.has(disorder.definitionId),
      )

      if (cardIndex === -1) {
        throw new Error('Not enough distinct Disorders to set up every player.')
      }

      psyche.push(remaining.splice(cardIndex, 1)[0])
    }
  }

  return { psyches, remaining }
}

function dealHands(
  players: readonly PlayerState[],
  shuffledCards: readonly CardInstance[],
): { players: PlayerState[]; drawPile: CardInstance[] } {
  let nextCardIndex = 0
  const dealtPlayers = players.map((player) => ({
    ...player,
    hand: shuffledCards.slice(
      nextCardIndex,
      (nextCardIndex += INITIAL_HAND_SIZE),
    ),
  }))

  return { players: dealtPlayers, drawPile: shuffledCards.slice(nextCardIndex) }
}

/** Creates a complete base-game setup without applying any gameplay effects. */
export function createGame(
  playerNames: readonly string[],
  options: CreateGameOptions = {},
): GameState {
  validatePlayerNames(playerNames)

  if (
    options.playerIds &&
    (options.playerIds.length !== playerNames.length ||
      new Set(options.playerIds).size !== options.playerIds.length ||
      options.playerIds.some((id) => id.trim().length === 0))
  ) {
    throw new Error(
      'Player IDs must be non-empty and uniquely match player names.',
    )
  }

  const rng = options.rng ?? systemRandom
  const deck = createDeck()
  const disorders = shuffle(
    deck.filter(
      (card): card is CardInstance<DisorderDefinition> =>
        card.cardType === 'disorder',
    ),
    rng,
  )
  const nonDisorders = deck.filter((card) => card.cardType !== 'disorder')
  const { psyches, remaining } = dealInitialPsyches(
    disorders,
    playerNames.length,
  )
  const playersWithoutHands: PlayerState[] = playerNames.map((name, index) => ({
    id: options.playerIds?.[index] ?? `player-${index + 1}`,
    name: name.trim(),
    hand: [],
    psyche: { slots: psyches[index].map((disorder) => ({ disorder })) },
    effects: { skipTurns: 0, cannotPlayTurns: 0, skipDrawTurns: 0 },
    tradeUsedThisTurn: false,
  }))
  const { players, drawPile } = dealHands(
    playersWithoutHands,
    shuffle([...nonDisorders, ...remaining], rng),
  )
  const currentPlayerIndex = Math.floor(rng.next() * players.length)
  const currentPlayerId = players[currentPlayerIndex].id

  return {
    players,
    drawPile,
    discardPile: [],
    currentPlayerIndex,
    currentPlayerId,
    turnNumber: 1,
    turn: {
      number: 1,
      currentPlayerId,
      phase: 'draw',
      cardsPlayedThisTurn: 0,
      cardsDrawnThisTurn: 0,
    },
    status: 'playing',
  }
}
