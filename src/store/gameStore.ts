import { create } from 'zustand'
import { playDisorder as playDisorderCommand } from '../game/engine/disorderPlay'
import { playDrug as playDrugCommand } from '../game/engine/drugTreatment'
import {
  getEpisodeDecisionRequirement,
  getEpisodePlayContext,
  playEpisode as playEpisodeCommand,
  type EpisodeEffectOptions,
} from '../game/engine/episode'
import { createGame } from '../game/engine/setup'
import { playTherapy as playTherapyCommand } from '../game/engine/therapy'
import { tradeCards as tradeCardsCommand } from '../game/engine/trading'
import {
  discardCard as discardCardCommand,
  discardManual as discardManualCommand,
  drawForTurn,
  endTurn as endTurnCommand,
  forfeitGame as forfeitGameCommand,
  surrenderTurn as surrenderTurnCommand,
} from '../game/engine/turns'
import type { GameState } from '../game/engine/types'
import { describeCommand } from '../game/log/describeCommand'
import { t } from '../i18n'
import type { GameCommand } from '../../server/game/commands'
import { useChatStore } from './chatStore'

type TradeCardsCommand = Extract<GameCommand, { type: 'tradeCards' }>

export interface LocalPendingDecision {
  id: string
  kind: 'anxiety' | 'tremors'
  chooserPlayerId: string
  command: Extract<GameCommand, { type: 'playEpisode' }>
  choices: { id: string; label: string }[]
  choiceMap: Record<string, string>
}

type StoreAction = (game: GameState) => GameState

interface GameStore {
  gameState?: GameState
  error?: string
  gameLog: string[]
  pendingDecision?: LocalPendingDecision
  createLocalGame: (playerNames: string[]) => void
  draw: () => void
  playDrug: (drugCardId: string, disorderCardId: string) => void
  playDisorder: (disorderCardId: string, targetPlayerId: string) => void
  playEpisode: (
    episodeCardId: string,
    targetPlayerId: string,
    targetDisorderCardId: string,
    options?: EpisodeEffectOptions,
  ) => void
  resolvePendingDecision: (decisionId: string, choiceIds: string[]) => void
  playTherapy: (therapyCardId: string, disorderCardId: string) => void
  discard: (cardInstanceId: string) => void
  manualDiscard: (cardInstanceId: string) => void
  endTurn: () => void
  forfeit: () => void
  surrender: () => void
  /**
   * Commits a negotiated trade to the engine. Returns whether the engine
   * accepted it — `localTradeDriver` needs this to tell a real commit apart
   * from a rejection (e.g. quota already spent) without duplicating the
   * engine's own validation in `src/game/engine/trading.ts`.
   */
  tradeCards: (command: TradeCardsCommand) => boolean
  resetGame: () => void
  clearError: () => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Unable to complete that action.'
}

export const useGameStore = create<GameStore>((set, get) => {
  // Returns whether the command was applied, so callers that need to branch
  // on success (currently only `tradeCards`, via `localTradeDriver`) can do
  // so without re-deriving it from `error` state after the fact.
  const run = (action: StoreAction, command: GameCommand): boolean => {
    const game = get().gameState
    if (!game) return false
    if (get().pendingDecision) {
      set({ error: 'Resolve the pending Episode decision first.' })
      return false
    }
    try {
      const nextGame = action(game)
      const entry = describeCommand(game, command, nextGame)
      const winner =
        nextGame.status === 'finished'
          ? nextGame.players.find(
              (player) => player.id === nextGame.winnerPlayerId,
            )
          : undefined
      const newEntries = [
        ...(entry ? [entry] : []),
        ...(winner ? [t('wins', { player: winner.name })] : []),
      ]
      set({
        gameState: nextGame,
        error: undefined,
        gameLog: [...get().gameLog, ...newEntries].slice(-30),
      })
      // Mirror every new log line into the chat timeline as a system message
      // so players can follow game events in context with their conversation.
      // appendSystemMessage does not bump the unread badge.
      const { appendSystemMessage } = useChatStore.getState()
      for (const line of newEntries) appendSystemMessage(line)
      return true
    } catch (error) {
      set({ error: errorMessage(error) })
      return false
    }
  }

  return {
    gameState: undefined,
    error: undefined,
    gameLog: [],
    pendingDecision: undefined,
    createLocalGame: (playerNames) => {
      try {
        set({
          gameState: createGame(playerNames),
          error: undefined,
          gameLog: [t('logLocalStarted')],
          pendingDecision: undefined,
        })
      } catch (error) {
        set({ error: errorMessage(error) })
      }
    },
    draw: () =>
      run((game) => drawForTurn(game, game.currentPlayerId), { type: 'draw' }),
    playDrug: (drugCardId, disorderCardId) =>
      run(
        (game) =>
          playDrugCommand(
            game,
            game.currentPlayerId,
            drugCardId,
            disorderCardId,
          ),
        { type: 'playDrug', drugCardId, disorderCardId },
      ),
    playDisorder: (disorderCardId, targetPlayerId) =>
      run(
        (game) =>
          playDisorderCommand(
            game,
            game.currentPlayerId,
            disorderCardId,
            targetPlayerId,
          ),
        { type: 'playDisorder', disorderCardId, targetPlayerId },
      ),
    playEpisode: (episodeCardId, targetPlayerId, targetDisorderCardId, options) => {
      const game = get().gameState
      if (!game) return
      if (get().pendingDecision) {
        set({ error: 'Resolve the pending Episode decision first.' })
        return
      }
      const command: Extract<GameCommand, { type: 'playEpisode' }> = {
        type: 'playEpisode',
        episodeCardId,
        targetPlayerId,
        targetDisorderCardId,
      }
      try {
        const requirement = getEpisodeDecisionRequirement(
          getEpisodePlayContext(game, game.currentPlayerId, episodeCardId, targetPlayerId, targetDisorderCardId),
        )
        if (requirement && !options) {
          const choiceMap = Object.fromEntries(
            requirement.cardIds.map((cardId, index) => [
              requirement.kind === 'anxiety' ? `choice-${index + 1}` : cardId,
              cardId,
            ]),
          )
          const target = game.players.find((player) => player.id === targetPlayerId)!
          set({
            error: undefined,
            pendingDecision: {
              id: `local-decision-${game.turnNumber}-${episodeCardId}`,
              kind: requirement.kind,
              chooserPlayerId: requirement.chooserPlayerId,
              command,
              choiceMap,
              choices: Object.entries(choiceMap).map(([id, cardId], index) => ({
                id,
                label: requirement.kind === 'anxiety'
                  ? `Lá bài ${index + 1}`
                  : target.hand.find((card) => card.instanceId === cardId)?.displayName ?? id,
              })),
            },
          })
          return
        }
      } catch (error) {
        set({ error: errorMessage(error) })
        return
      }
      run(
        (currentGame) => playEpisodeCommand(
          currentGame,
          currentGame.currentPlayerId,
          episodeCardId,
          targetPlayerId,
          targetDisorderCardId,
          options,
        ),
        command,
      )
    },
    resolvePendingDecision: (decisionId, choiceIds) => {
      const pending = get().pendingDecision
      const game = get().gameState
      if (!pending || !game || pending.id !== decisionId) {
        set({ error: 'There is no matching pending Episode decision.' })
        return
      }
      const expectedCount = pending.kind === 'anxiety' ? 1 : 3
      const cardIds = choiceIds.map((choiceId) => pending.choiceMap[choiceId])
      if (choiceIds.length !== expectedCount || new Set(choiceIds).size !== expectedCount || cardIds.some((cardId) => !cardId)) {
        set({ error: `Choose exactly ${expectedCount} distinct cards.` })
        return
      }
      try {
        const options: EpisodeEffectOptions = pending.kind === 'anxiety'
          ? { chosenCardId: cardIds[0] }
          : { tremorsDiscardCardIds: cardIds }
        const nextGame = playEpisodeCommand(
          game,
          game.currentPlayerId,
          pending.command.episodeCardId,
          pending.command.targetPlayerId,
          pending.command.targetDisorderCardId,
          options,
        )
        const entry = describeCommand(game, pending.command, nextGame)
        set({
          gameState: nextGame,
          pendingDecision: undefined,
          error: undefined,
          gameLog: [...get().gameLog, ...(entry ? [entry] : [])].slice(-30),
        })
      } catch (error) {
        set({ error: errorMessage(error) })
      }
    },
    playTherapy: (therapyCardId, disorderCardId) =>
      run(
        (game) =>
          playTherapyCommand(
            game,
            game.currentPlayerId,
            therapyCardId,
            disorderCardId,
          ),
        { type: 'playTherapy', therapyCardId, disorderCardId },
      ),
    discard: (cardInstanceId) =>
      run(
        (game) =>
          discardCardCommand(game, game.currentPlayerId, cardInstanceId),
        { type: 'discard', cardInstanceId },
      ),
    manualDiscard: (cardInstanceId) =>
      run(
        (game) => discardManualCommand(game, game.currentPlayerId, cardInstanceId),
        { type: 'discardManual', cardInstanceId },
      ),
    endTurn: () =>
      run((game) => endTurnCommand(game, game.currentPlayerId), {
        type: 'endTurn',
      }),
    forfeit: () =>
      run((game) => forfeitGameCommand(game, game.currentPlayerId), {
        type: 'forfeit',
      }),
    surrender: () =>
      run((game) => surrenderTurnCommand(game, game.currentPlayerId), {
        type: 'surrender',
      }),
    tradeCards: (command) =>
      run((game) => tradeCardsCommand(game, command), command),
    resetGame: () =>
      set({ gameState: undefined, error: undefined, gameLog: [], pendingDecision: undefined }),
    clearError: () => set({ error: undefined }),
  }
})