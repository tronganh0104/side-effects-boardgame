import type { CardInstance } from '../cards/types'
import { shuffle, systemRandom, type RandomSource } from './random'
import { cannotPlayCards } from './temporaryEffects'
import { assertGameIsPlaying } from './gameStatus'
import type { GameState, PlayerState, TurnState } from './types'

const CARDS_PER_TURN = 2
const MAX_CARDS_PLAYED_PER_TURN = 2
const HAND_LIMIT = 6

export interface TurnCommandOptions {
  rng?: RandomSource
}

function assertCurrentPlayer(game: GameState, playerId: string): void {
  if (playerId !== game.currentPlayerId) {
    throw new Error('Only the current player may take this action.')
  }
}

function assertPhase(game: GameState, phase: TurnState['phase']): void {
  if (game.turn.phase !== phase) {
    throw new Error(`This action is only allowed during the ${phase} phase.`)
  }
}

function replaceCurrentPlayer(
  game: GameState,
  player: PlayerState,
): PlayerState[] {
  return game.players.map((candidate, index) =>
    index === game.currentPlayerIndex ? player : candidate,
  )
}

function updatePlayer(
  game: GameState,
  playerIndex: number,
  player: PlayerState,
): GameState {
  return {
    ...game,
    players: game.players.map((candidate, index) =>
      index === playerIndex ? player : candidate,
    ),
  }
}

function beginTurn(
  game: GameState,
  currentPlayerIndex: number,
  turnNumber: number,
): GameState {
  let nextGame: GameState = {
    ...game,
    currentPlayerIndex,
    currentPlayerId: game.players[currentPlayerIndex].id,
    turnNumber,
    turn: {
      number: turnNumber,
      currentPlayerId: game.players[currentPlayerIndex].id,
      phase: 'draw',
      cardsPlayedThisTurn: 0,
      cardsDrawnThisTurn: 0,
    },
  }

  for (
    let skippedPlayers = 0;
    skippedPlayers < nextGame.players.length;
    skippedPlayers += 1
  ) {
    const player = nextGame.players[nextGame.currentPlayerIndex]
    if (player.effects.skipTurns === 0) {
      if (player.effects.skipDrawTurns > 0) {
        nextGame = updatePlayer(nextGame, nextGame.currentPlayerIndex, {
          ...player,
          effects: {
            ...player.effects,
            skipDrawTurns: player.effects.skipDrawTurns - 1,
          },
        })
        return { ...nextGame, turn: { ...nextGame.turn, phase: 'play' } }
      }
      return nextGame
    }

    nextGame = updatePlayer(nextGame, nextGame.currentPlayerIndex, {
      ...player,
      effects: { ...player.effects, skipTurns: player.effects.skipTurns - 1 },
    })
    const followingIndex =
      (nextGame.currentPlayerIndex + 1) % nextGame.players.length
    nextGame = {
      ...nextGame,
      currentPlayerIndex: followingIndex,
      currentPlayerId: nextGame.players[followingIndex].id,
      turnNumber: nextGame.turnNumber + 1,
      turn: {
        number: nextGame.turnNumber + 1,
        currentPlayerId: nextGame.players[followingIndex].id,
        phase: 'draw',
        cardsPlayedThisTurn: 0,
        cardsDrawnThisTurn: 0,
      },
    }
  }

  return nextGame
}

function advanceTurn(game: GameState): GameState {
  const currentPlayer = game.players[game.currentPlayerIndex]
  const afterCurrentEffects =
    currentPlayer.effects.cannotPlayTurns > 0
      ? updatePlayer(game, game.currentPlayerIndex, {
          ...currentPlayer,
          effects: {
            ...currentPlayer.effects,
            cannotPlayTurns: currentPlayer.effects.cannotPlayTurns - 1,
          },
        })
      : game
  const currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
  return beginTurn(afterCurrentEffects, currentPlayerIndex, game.turnNumber + 1)
}

function drawAvailableCards(
  drawPile: readonly CardInstance[],
  discardPile: readonly CardInstance[],
  requestedCount: number,
  rng: RandomSource,
): {
  drawn: CardInstance[]
  drawPile: CardInstance[]
  discardPile: CardInstance[]
} {
  let availableDrawPile = [...drawPile]
  let availableDiscardPile = [...discardPile]
  const drawn: CardInstance[] = []

  while (drawn.length < requestedCount) {
    if (availableDrawPile.length === 0 && availableDiscardPile.length > 0) {
      availableDrawPile = shuffle(availableDiscardPile, rng)
      availableDiscardPile = []
    }

    const card = availableDrawPile.shift()
    if (!card) break
    drawn.push(card)
  }

  return {
    drawn,
    drawPile: availableDrawPile,
    discardPile: availableDiscardPile,
  }
}

/** Confirms that the current game is ready for the current player's draw phase. */
export function startTurn(game: GameState): GameState {
  assertGameIsPlaying(game)
  if (game.status !== 'playing') {
    throw new Error('A turn can only start while the game is playing.')
  }
  assertPhase(game, 'draw')
  return beginTurn(game, game.currentPlayerIndex, game.turnNumber)
}

/** Draws up to the two cards required for this turn, recycling discards if needed. */
export function drawForTurn(
  game: GameState,
  playerId: string,
  options: TurnCommandOptions = {},
): GameState {
  assertGameIsPlaying(game)
  assertCurrentPlayer(game, playerId)
  assertPhase(game, 'draw')

  if (game.turn.cardsDrawnThisTurn >= CARDS_PER_TURN) {
    throw new Error('The current player has already drawn for this turn.')
  }

  const currentPlayer = game.players[game.currentPlayerIndex]
  const { drawn, drawPile, discardPile } = drawAvailableCards(
    game.drawPile,
    game.discardPile,
    CARDS_PER_TURN - game.turn.cardsDrawnThisTurn,
    options.rng ?? systemRandom,
  )

  return {
    ...game,
    players: replaceCurrentPlayer(game, {
      ...currentPlayer,
      hand: [...currentPlayer.hand, ...drawn],
    }),
    drawPile,
    discardPile,
    turn: {
      ...game.turn,
      cardsDrawnThisTurn: game.turn.cardsDrawnThisTurn + drawn.length,
      phase: 'play',
    },
  }
}

/** After any action that increments cardsPlayedThisTurn, call this to
 * auto-advance the turn when the player has used both actions. */
export function maybeAutoEndTurn(game: GameState): GameState {
  if (game.turn.phase !== 'play') return game
  if (game.turn.cardsPlayedThisTurn < MAX_CARDS_PLAYED_PER_TURN) return game
  const currentPlayer = game.players[game.currentPlayerIndex]
  if (currentPlayer.hand.length > HAND_LIMIT) {
    return { ...game, turn: { ...game.turn, phase: 'discard' } }
  }
  return advanceTurn(game)
}

/** Placeholder play command; future card effects can replace the discard destination. */
export function registerCardPlayed(
  game: GameState,
  playerId: string,
  cardInstanceId: string,
): GameState {
  assertGameIsPlaying(game)
  assertCurrentPlayer(game, playerId)
  assertPhase(game, 'play')

  if (cannotPlayCards(game.players[game.currentPlayerIndex])) {
    throw new Error('The current player cannot play cards this turn.')
  }

  if (game.turn.cardsPlayedThisTurn >= MAX_CARDS_PLAYED_PER_TURN) {
    throw new Error('A player may play at most two cards per turn.')
  }

  const currentPlayer = game.players[game.currentPlayerIndex]
  const cardIndex = currentPlayer.hand.findIndex(
    (card) => card.instanceId === cardInstanceId,
  )
  if (cardIndex === -1) {
    throw new Error('The selected card is not in the current player hand.')
  }

  const card = currentPlayer.hand[cardIndex]
  if (card.cardType === 'drug') {
    throw new Error('Use playDrug to play a Drug card.')
  }
  return maybeAutoEndTurn({
    ...game,
    players: replaceCurrentPlayer(game, {
      ...currentPlayer,
      hand: currentPlayer.hand.filter((_, index) => index !== cardIndex),
    }),
    discardPile: [...game.discardPile, card],
    turn: {
      ...game.turn,
      cardsPlayedThisTurn: game.turn.cardsPlayedThisTurn + 1,
    },
  })
}

/** Discards one card during the enforced hand-limit discard phase. */
export function discardCard(
  game: GameState,
  playerId: string,
  cardInstanceId: string,
): GameState {
  assertGameIsPlaying(game)
  assertCurrentPlayer(game, playerId)
  assertPhase(game, 'discard')

  const currentPlayer = game.players[game.currentPlayerIndex]
  const cardIndex = currentPlayer.hand.findIndex(
    (card) => card.instanceId === cardInstanceId,
  )
  if (cardIndex === -1) {
    throw new Error('The selected card is not in the current player hand.')
  }

  const card = currentPlayer.hand[cardIndex]
  const players = replaceCurrentPlayer(game, {
    ...currentPlayer,
    hand: currentPlayer.hand.filter((_, index) => index !== cardIndex),
  })
  const nextGame = {
    ...game,
    players,
    discardPile: [...game.discardPile, card],
  }

  return players[game.currentPlayerIndex].hand.length <= HAND_LIMIT
    ? advanceTurn(nextGame)
    : nextGame
}

/** Voluntarily discards a card during the play phase. Does NOT count as an
 * action -- cardsPlayedThisTurn is unchanged. */
export function discardManual(
  game: GameState,
  playerId: string,
  cardInstanceId: string,
): GameState {
  assertGameIsPlaying(game)
  assertCurrentPlayer(game, playerId)
  assertPhase(game, 'play')
  const currentPlayer = game.players[game.currentPlayerIndex]
  const card = currentPlayer.hand.find((candidate) => candidate.instanceId === cardInstanceId)
  if (!card) throw new Error('The selected card is not in the current player hand.')
  return {
    ...game,
    players: replaceCurrentPlayer(game, {
      ...currentPlayer,
      hand: currentPlayer.hand.filter((candidate) => candidate.instanceId !== cardInstanceId),
    }),
    discardPile: [...game.discardPile, card],
  }
}

/** Ends a play phase, or enters discard phase when the hand exceeds six cards. */
export function endTurn(game: GameState, playerId: string): GameState {
  assertGameIsPlaying(game)
  assertCurrentPlayer(game, playerId)
  assertPhase(game, 'play')

  const currentPlayer = game.players[game.currentPlayerIndex]
  if (currentPlayer.hand.length > HAND_LIMIT) {
    return { ...game, turn: { ...game.turn, phase: 'discard' } }
  }

  return advanceTurn(game)
}

/** Skips the current player's next turn. Can be called at any phase;
 * the turn advances immediately so other players continue normally. */
export function surrenderTurn(
  game: GameState,
  playerId: string,
): GameState {
  assertGameIsPlaying(game)
  assertCurrentPlayer(game, playerId)
  const playerIndex = game.players.findIndex((p) => p.id === playerId)
  const player = game.players[playerIndex]
  const withSkip = updatePlayer(game, playerIndex, {
    ...player,
    effects: { ...player.effects, skipTurns: player.effects.skipTurns + 1 },
  })
  return advanceTurn(withSkip)
}

/** Ends the game immediately for the player who surrenders and returns their
 * hand and all cards in their Psyche to the draw pile. */
export function forfeitGame(
  game: GameState,
  playerId: string,
  options: TurnCommandOptions = {},
): GameState {
  assertGameIsPlaying(game)
  assertCurrentPlayer(game, playerId)
  return applyTwoPlayerForfeitCore(game, playerId, options)
}

/**
 * Removes a player from an active 3P+ game (voluntary leave).
 * Their hand and Psyche cards return to the shuffled draw pile.
 * If it was their turn, the turn advances to the next player.
 * If only one player remains after removal, the game ends.
 */
export function removePlayer(
  game: GameState,
  playerId: string,
  options: TurnCommandOptions = {},
): GameState {
  assertGameIsPlaying(game)
  if (game.players.length < 3) {
    throw new Error('Use forfeit to leave a two-player game.')
  }
  const playerIndex = game.players.findIndex((p) => p.id === playerId)
  if (playerIndex === -1) throw new Error('Player is not in this game.')

  const player = game.players[playerIndex]
  const returnedCards = [
    ...player.hand,
    ...player.psyche.slots.flatMap((slot) =>
      slot.drug ? [slot.disorder, slot.drug] : [slot.disorder],
    ),
  ]

  const remainingPlayers = game.players.filter((p) => p.id !== playerId)

  // If only one player remains they win immediately.
  if (remainingPlayers.length === 1) {
    return {
      ...game,
      drawPile: shuffle([...game.drawPile, ...returnedCards], options.rng ?? systemRandom),
      players: remainingPlayers,
      currentPlayerIndex: 0,
      currentPlayerId: remainingPlayers[0].id,
      status: 'finished',
      winnerPlayerId: remainingPlayers[0].id,
    }
  }

  const wasCurrentPlayer = game.currentPlayerIndex === playerIndex

  // Recalculate currentPlayerIndex in the new array.
  // If the removed player came before (or was) the current player, the index
  // shifts down by one; clamp with modulo so the last slot wraps correctly.
  let nextCurrentIndex = wasCurrentPlayer
    ? playerIndex % remainingPlayers.length
    : playerIndex < game.currentPlayerIndex
      ? game.currentPlayerIndex - 1
      : game.currentPlayerIndex

  nextCurrentIndex = nextCurrentIndex % remainingPlayers.length

  const nextGame: GameState = {
    ...game,
    drawPile: shuffle([...game.drawPile, ...returnedCards], options.rng ?? systemRandom),
    players: remainingPlayers,
    currentPlayerIndex: nextCurrentIndex,
    currentPlayerId: remainingPlayers[nextCurrentIndex].id,
  }

  // If it was the leaving player's turn, start a fresh turn for the next player.
  if (wasCurrentPlayer) {
    return beginTurn(nextGame, nextCurrentIndex, game.turnNumber + 1)
  }

  return nextGame
}

/** Applies the shared terminal 2-player abandonment/forfeit semantics. */
export function applyTwoPlayerForfeitCore(
  game: GameState,
  playerId: string,
  options: TurnCommandOptions = {},
): GameState {
  assertGameIsPlaying(game)
  if (game.players.length !== 2) {
    throw new Error('Forfeit is currently supported only in two-player games.')
  }
  const playerIndex = game.players.findIndex((player) => player.id === playerId)
  if (playerIndex === -1) throw new Error('Player is not in this game.')

  const player = game.players[playerIndex]
  const returnedCards = [
    ...player.hand,
    ...player.psyche.slots.flatMap((slot) =>
      slot.drug ? [slot.disorder, slot.drug] : [slot.disorder],
    ),
  ]
  const remainingPlayers = game.players.filter((candidate) => candidate.id !== playerId)
  const winner = remainingPlayers[0]
  if (!winner) throw new Error('A game needs another player to continue.')

  return {
    ...game,
    drawPile: shuffle([...game.drawPile, ...returnedCards], options.rng ?? systemRandom),
    players: game.players.map((candidate, index) =>
      index === playerIndex
        ? { ...candidate, hand: [], psyche: { slots: [] } }
        : candidate,
    ),
    status: 'finished',
    winnerPlayerId: winner.id,
  }
}