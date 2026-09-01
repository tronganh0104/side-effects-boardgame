import { randomUUID } from 'node:crypto'
import { playDisorder } from '../../src/game/engine/disorderPlay'
import { playDrug } from '../../src/game/engine/drugTreatment'
import { playEpisode } from '../../src/game/engine/episode'
import {
  getEpisodeDecisionRequirement,
  getEpisodePlayContext,
} from '../../src/game/engine/episode'
import { createGame } from '../../src/game/engine/setup'
import { playTherapy } from '../../src/game/engine/therapy'
import { tradeCards } from '../../src/game/engine/trading'
import {
  applyTwoPlayerForfeitCore,
  discardCard,
  discardManual,
  drawForTurn,
  endTurn,
  forfeitGame,
  removePlayer,
  surrenderTurn,
} from '../../src/game/engine/turns'
import type { GameState } from '../../src/game/engine/types'
import { describeCommand } from '../../src/game/log/describeCommand'
import type { GameCommand } from '../game/commands'
import type { Room, RoomPlayer } from './types'
import type { PendingDecision } from './types'
import { deserializeRoom, serializeRoom } from '../persistence/serializer'
import { InMemoryRoomRepository } from '../persistence/inMemoryRoomRepository'
import type { RoomRepository } from '../persistence/types'
import {
  createSessionToken,
  hashSessionToken,
  matchesSessionToken,
} from '../security/sessionToken'

export interface SessionCredential {
  roomId: string
  playerId: string
  sessionToken: string
}

export interface Clock {
  now(): number
}

export interface TimeoutScheduler {
  set(callback: () => void, delayMs: number): unknown
  clear(handle: unknown): void
}

export interface RoomServiceDependencies {
  clock?: Clock
  scheduler?: TimeoutScheduler
}

const TREMORS_TIMEOUT_MS = 3_000
const DISCONNECT_GRACE_MS = 30_000
const systemClock: Clock = { now: () => Date.now() }
const systemScheduler: TimeoutScheduler = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as NodeJS.Timeout),
}

export class RoomService {
  private readonly rooms = new Map<string, Room>()
  private readonly persistenceQueues = new Map<string, Promise<void>>()
  private readonly decisionTimers = new Map<
    string,
    { decisionId: string; handle: unknown }
  >()
  private readonly disconnectTimers = new Map<
    string,
    { deadline: number; handle: unknown }
  >()
  private readonly mutationListeners = new Set<(room: Room) => void>()
  private readonly clock: Clock
  private readonly scheduler: TimeoutScheduler

  constructor(
    private readonly repository: RoomRepository = new InMemoryRoomRepository(),
    private readonly logError: (message: string) => void = console.error,
    dependencies: RoomServiceDependencies = {},
  ) {
    this.clock = dependencies.clock ?? systemClock
    this.scheduler = dependencies.scheduler ?? systemScheduler
  }

  onMutation(listener: (room: Room) => void): () => void {
    this.mutationListeners.add(listener)
    return () => this.mutationListeners.delete(listener)
  }

  dispose(): void {
    for (const roomId of this.decisionTimers.keys()) this.clearDecisionTimer(roomId)
    for (const key of this.disconnectTimers.keys()) this.clearDisconnectTimer(key)
    this.mutationListeners.clear()
  }

  createRoom(
    displayName: string,
    socketId?: string,
  ): { room: Room; player: RoomPlayer; session: SessionCredential } {
    const player = this.createPlayer(displayName, socketId)
    const sessionToken = createSessionToken()
    const room: Room = {
      id: this.createRoomCode(),
      hostPlayerId: player.id,
      players: [player],
      status: 'lobby',
      gameLog: [],
      sessionTokenHashes: { [player.id]: hashSessionToken(sessionToken) },
    }
    this.rooms.set(room.id, room)
    this.persistRoom(room)
    return {
      room,
      player,
      session: { roomId: room.id, playerId: player.id, sessionToken },
    }
  }

  joinRoom(
    roomId: string,
    displayName: string,
    socketId?: string,
  ): { room: Room; player: RoomPlayer; session: SessionCredential } {
    const room = this.requireRoom(roomId)
    if (room.status !== 'lobby')
      throw new Error('Cannot join a room after the game has started.')
    this.validateDisplayName(displayName)
    if (room.players.length >= 8) throw new Error('This room is full.')
    if (
      room.players.some((player) => player.displayName === displayName.trim())
    )
      throw new Error('Display names must be unique in a room.')

    const player = this.createPlayer(displayName, socketId)
    const sessionToken = createSessionToken()
    room.players.push(player)
    room.sessionTokenHashes[player.id] = hashSessionToken(sessionToken)
    this.persistRoom(room)
    return {
      room,
      player,
      session: { roomId, playerId: player.id, sessionToken },
    }
  }

  leaveRoom(roomId: string, playerId: string): Room | undefined {
    const room = this.requireRoom(roomId)
    if (room.status === 'playing') {
      if (room.players.length === 2) return this.abandonTwoPlayer(room, playerId)
      return this.removePlayerFromActiveGame(room, playerId)
    }
    if (room.status !== 'lobby') throw new Error('This room has already finished.')
    const remainingPlayers = room.players.filter(
      (player) => player.id !== playerId,
    )
    if (remainingPlayers.length === room.players.length)
      throw new Error('Player is not in this room.')
    if (remainingPlayers.length === 0) {
      this.clearDecisionTimer(roomId)
      this.rooms.delete(roomId)
      this.deletePersistedRoom(roomId)
      return undefined
    }
    room.players = remainingPlayers
    delete room.sessionTokenHashes[playerId]
    if (room.hostPlayerId === playerId)
      room.hostPlayerId = remainingPlayers[0].id
    this.persistRoom(room)
    return room
  }

  startRoom(roomId: string, playerId: string): Room {
    const room = this.requireRoom(roomId)
    if (room.hostPlayerId !== playerId)
      throw new Error('Only the host can start the game.')
    if (room.status !== 'lobby')
      throw new Error('This room has already started.')
    if (room.players.length < 2)
      throw new Error('At least two players are required to start.')
    if (room.players.some((player) => !player.connected))
      throw new Error('All players must be connected before starting.')

    room.gameState = createGame(
      room.players.map((player) => player.displayName),
      { playerIds: room.players.map((player) => player.id) },
    )
    room.status = 'playing'
    room.gameLog.push('Ván chơi đã bắt đầu.')
    this.persistRoom(room)
    return room
  }

  executeCommand(
    roomId: string,
    playerId: string,
    command: GameCommand,
  ): GameState {
    const room = this.requireRoom(roomId)
    if (!room.gameState || room.status !== 'playing')
      throw new Error('This room does not have an active game.')
    const roomPlayer = room.players.find((player) => player.id === playerId)
    if (!roomPlayer) throw new Error('Player is not in this room.')
    if (!roomPlayer.connected)
      throw new Error('Disconnected players cannot send gameplay commands.')
    if (room.pendingDecision)
      throw new Error('Resolve the pending Episode decision first.')

    const game = room.gameState
    if (command.type === 'playEpisode') {
      const requirement = getEpisodeDecisionRequirement(
        getEpisodePlayContext(
          game,
          playerId,
          command.episodeCardId,
          command.targetPlayerId,
          command.targetDisorderCardId,
        ),
      )
      if (requirement) {
        room.pendingDecision = this.createPendingDecision(command, requirement)
        this.schedulePendingDecision(room)
        this.persistRoom(room)
        return game
      }
    }
    const nextGame = this.applyCommand(game, playerId, command)
    room.gameState = nextGame
    room.gameLog = [
      ...room.gameLog,
      describeCommand(game, command, nextGame),
    ].slice(-30)
    if (nextGame.status === 'finished') {
      room.status = 'finished'
      this.clearDecisionTimer(room.id)
      this.clearRoomDisconnectTimers(room.id)
    }
    this.persistRoom(room)
    return nextGame
  }

  resolveDecision(
    roomId: string,
    playerId: string,
    decisionId: string,
    selectedChoiceIds: string[],
  ): GameState {
    const room = this.requireRoom(roomId)
    const decision = room.pendingDecision
    if (!room.gameState || !decision)
      throw new Error('There is no pending decision.')
    const chooser = room.players.find((player) => player.id === playerId)
    if (!chooser?.connected)
      throw new Error('Disconnected players cannot resolve decisions.')
    if (decision.id !== decisionId || decision.chooserPlayerId !== playerId)
      throw new Error('This player cannot resolve that decision.')
    if (decision.kind === 'tremors' && this.clock.now() >= decision.expiresAt) {
      this.resolveTremorsTimeout(room, decision.id)
      throw new Error('The Tremors decision has expired and is being resolved.')
    }
    const expectedCount = decision.kind === 'anxiety' ? 1 : 3
    if (
      selectedChoiceIds.length !== expectedCount ||
      new Set(selectedChoiceIds).size !== expectedCount
    )
      throw new Error(`Choose exactly ${expectedCount} distinct cards.`)
    const cardIds = selectedChoiceIds.map(
      (choiceId) => decision.choiceMap[choiceId],
    )
    if (cardIds.some((cardId) => !cardId))
      throw new Error('Invalid pending card choice.')
    const command: GameCommand = {
      ...decision.command,
      options:
        decision.kind === 'anxiety'
          ? { chosenCardId: cardIds[0] }
          : { tremorsDiscardCardIds: cardIds },
    }
    const before = room.gameState
    const nextGame = this.applyCommand(
      before,
      before.currentPlayerId,
      command,
    )
    this.clearDecisionTimer(room.id, decision.id)
    room.pendingDecision = undefined
    room.gameState = nextGame
    room.gameLog = [
      ...room.gameLog,
      describeCommand(before, decision.command, nextGame),
    ].slice(-30)
    if (nextGame.status === 'finished') {
      room.status = 'finished'
      this.clearDecisionTimer(room.id)
    }
    this.persistRoom(room)
    return nextGame
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId)
  }

  resumeSession(
    roomId: string,
    playerId: string,
    sessionToken: string,
    socketId: string,
  ): Room {
    const room = this.requireRoom(roomId)
    const player = room.players.find((candidate) => candidate.id === playerId)
    const tokenHash = room.sessionTokenHashes[playerId]
    if (!player || !tokenHash || !matchesSessionToken(sessionToken, tokenHash))
      throw new Error('Unable to restore session.')
    if (
      room.status === 'playing' &&
      room.players.length === 2 &&
      player.graceExpiresAt !== undefined &&
      this.clock.now() >= player.graceExpiresAt
    ) {
      this.abandonTwoPlayer(room, playerId)
      throw new Error('Unable to restore session.')
    }
    player.connected = true
    player.socketId = socketId
    const previousDeadline = player.graceExpiresAt
    delete player.graceExpiresAt
    if (previousDeadline !== undefined) this.clearDisconnectTimer(room.id, player.id)
    room.gameLog = [...room.gameLog, `${player.displayName} đã kết nối lại.`].slice(-30)
    this.persistRoom(room)
    this.notifyMutation(room)
    return room
  }



  markDisconnected(roomId: string, playerId: string, socketId?: string): Room {
    const room = this.requireRoom(roomId)
    const player = room.players.find((candidate) => candidate.id === playerId)
    if (!player) throw new Error('Player is not in this room.')
    if (socketId && player.socketId !== socketId) return room
    if (!player.connected) return room
    player.connected = false
    player.socketId = undefined
    delete player.graceExpiresAt
    if (room.status === 'playing' && room.players.length === 2) {
      player.graceExpiresAt = this.clock.now() + DISCONNECT_GRACE_MS
      this.scheduleDisconnect(room, player)
      room.gameLog = [...room.gameLog, `${player.displayName} mất kết nối.`].slice(-30)
    }
    this.persistRoom(room)
    this.notifyMutation(room)
    return room
  }

  async restoreFromRepository(): Promise<void> {
    const snapshots = await this.repository.loadActive()
    for (const snapshot of snapshots) {
      try {
        const room = deserializeRoom(snapshot)
        if (this.rooms.has(room.id))
          throw new Error(`Duplicate persisted room code: ${room.id}`)
        this.rooms.set(room.id, room)
        if (room.status === 'playing') {
          for (const player of room.players) {
            const persistedPlayer = snapshot.room.players.find((candidate) => candidate.id === player.id)
            if (snapshot.schemaVersion === 3 || (persistedPlayer?.connected && player.graceExpiresAt === undefined))
              player.graceExpiresAt = this.clock.now() + DISCONNECT_GRACE_MS
          }
          this.persistRoom(room)
        }
        for (const player of room.players) {
          if (room.status === 'playing' && room.players.length === 2 && player.graceExpiresAt !== undefined) {
            if (this.clock.now() >= player.graceExpiresAt)
              this.abandonTwoPlayer(room, player.id)
            else this.scheduleDisconnect(room, player)
          }
        }
        if (room.pendingDecision?.kind === 'tremors') {
          if (this.clock.now() >= room.pendingDecision.expiresAt)
            this.resolveTremorsTimeout(room, room.pendingDecision.id)
          else this.schedulePendingDecision(room)
        }
      } catch {
        this.logError('Skipped an unsupported persisted room snapshot.')
      }
    }
  }

  flushPersistence(roomId: string): Promise<void> {
    return this.persistenceQueues.get(roomId) ?? Promise.resolve()
  }

  isActiveSocket(roomId: string, playerId: string, socketId: string): boolean {
    const player = this.requireRoom(roomId).players.find(
      (candidate) => candidate.id === playerId,
    )
    return player?.connected === true && player.socketId === socketId
  }

  private createPlayer(
    displayName: string,
    socketId?: string,
  ): RoomPlayer {
    this.validateDisplayName(displayName)
    return {
      id: this.createPlayerId(),
      displayName: displayName.trim(),
      connected: true,
      socketId,
    }
  }

  private persistRoom(room: Room): void {
    const snapshot = serializeRoom(room)
    const previous = this.persistenceQueues.get(room.id) ?? Promise.resolve()
    const queued = previous
      .catch(() => undefined)
      .then(() => this.repository.save(snapshot))
      .catch(() => {
        this.logError('Room persistence failed; the in-memory game remains active.')
      })
    this.persistenceQueues.set(room.id, queued)
  }

  private deletePersistedRoom(roomId: string): void {
    const previous = this.persistenceQueues.get(roomId) ?? Promise.resolve()
    const queued = previous
      .catch(() => undefined)
      .then(() => this.repository.deleteRoom(roomId))
      .catch(() => {
        this.logError('Room persistence cleanup failed; the room may restore later.')
      })
    this.persistenceQueues.set(roomId, queued)
  }

  private createPlayerId(): string {
    return `player-${randomUUID()}`
  }

  private createRoomCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const generateCode = () =>
      Array.from(
        { length: 6 },
        () => alphabet[Math.floor(Math.random() * alphabet.length)],
      ).join('')
    let code = generateCode()
    while (this.rooms.has(code)) code = generateCode()
    return code
  }

  private createPendingDecision(
    command: Extract<GameCommand, { type: 'playEpisode' }>,
    requirement: NonNullable<ReturnType<typeof getEpisodeDecisionRequirement>>,
  ): PendingDecision {
    const choiceMap = Object.fromEntries(
      requirement.cardIds.map((cardId, index) => [
        requirement.kind === 'anxiety' ? `choice-${index + 1}` : cardId,
        cardId,
      ]),
    )
    const base = {
      id: `decision-${randomUUID()}`,
      chooserPlayerId: requirement.chooserPlayerId,
      command,
      choiceMap,
    }
    return requirement.kind === 'tremors'
      ? {
          ...base,
          kind: 'tremors',
          expiresAt: this.clock.now() + TREMORS_TIMEOUT_MS,
        }
      : { ...base, kind: 'anxiety' }
  }

  private schedulePendingDecision(room: Room): void {
    const decision = room.pendingDecision
    if (!decision || decision.kind !== 'tremors') return
    this.clearDecisionTimer(room.id)
    const decisionId = decision.id
    const delayMs = Math.max(0, decision.expiresAt - this.clock.now())
    const handle = this.scheduler.set(() => {
      const currentRoom = this.rooms.get(room.id)
      const currentDecision = currentRoom?.pendingDecision
      if (
        !currentRoom ||
        currentDecision?.kind !== 'tremors' ||
        currentDecision.id !== decisionId
      )
        return
      if (this.clock.now() < currentDecision.expiresAt) {
        this.schedulePendingDecision(currentRoom)
        return
      }
      try {
        this.resolveTremorsTimeout(currentRoom, decisionId)
      } catch {
        this.logError('Tremors timeout resolution failed; the decision remains pending.')
      }
    }, delayMs)
    this.decisionTimers.set(room.id, { decisionId, handle })
  }

  private clearDecisionTimer(roomId: string, decisionId?: string): void {
    const timer = this.decisionTimers.get(roomId)
    if (!timer || (decisionId && timer.decisionId !== decisionId)) return
    this.scheduler.clear(timer.handle)
    this.decisionTimers.delete(roomId)
  }

  private resolveTremorsTimeout(room: Room, decisionId: string): boolean {
    const decision = room.pendingDecision
    if (
      !room.gameState ||
      decision?.kind !== 'tremors' ||
      decision.id !== decisionId
    )
      return false
    const before = room.gameState
    const command: GameCommand = {
      ...decision.command,
      options: { tremorsTimedOut: true },
    }
    const nextGame = this.applyCommand(
      before,
      before.currentPlayerId,
      command,
    )
    this.clearDecisionTimer(room.id, decisionId)
    room.pendingDecision = undefined
    room.gameState = nextGame
    const chooserName =
      room.players.find((player) => player.id === decision.chooserPlayerId)
        ?.displayName ?? 'Một người chơi'
    room.gameLog = [
      ...room.gameLog,
      describeCommand(before, decision.command, nextGame),
      `${chooserName} đã không chọn kịp 3 lá do Run rẩy.`,
    ].slice(-30)
    if (nextGame.status === 'finished') room.status = 'finished'
    this.persistRoom(room)
    for (const listener of this.mutationListeners) listener(room)
    return true
  }

  private requireRoom(roomId: string): Room {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found.')
    return room
  }

  private validateDisplayName(displayName: string): void {
    if (!displayName.trim()) throw new Error('Display name is required.')
  }

  private applyCommand(
    game: GameState,
    playerId: string,
    command: GameCommand,
  ): GameState {
    switch (command.type) {
      case 'draw':
        return drawForTurn(game, playerId)
      case 'forfeit':
        return forfeitGame(game, playerId)
      case 'surrender':
        return surrenderTurn(game, playerId)
      case 'playDrug':
        return playDrug(
          game,
          playerId,
          command.drugCardId,
          command.disorderCardId,
        )
      case 'playDisorder':
        return playDisorder(
          game,
          playerId,
          command.disorderCardId,
          command.targetPlayerId,
        )
      case 'playEpisode':
        return playEpisode(
          game,
          playerId,
          command.episodeCardId,
          command.targetPlayerId,
          command.targetDisorderCardId,
          command.options,
        )
      case 'playTherapy':
        return playTherapy(
          game,
          playerId,
          command.therapyCardId,
          command.disorderCardId,
        )
      case 'discard':
        return discardCard(game, playerId, command.cardInstanceId)
      case 'discardManual':
        return discardManual(game, playerId, command.cardInstanceId)
      case 'endTurn':
        return endTurn(game, playerId)
      case 'tradeCards':
        return tradeCards(game, {
          initiatorPlayerId: command.initiatorPlayerId,
          initiatorCardId: command.initiatorCardId,
          partnerPlayerId: command.partnerPlayerId,
          partnerCardId: command.partnerCardId,
        })
    }
  }

  private notifyMutation(room: Room): void {
    for (const listener of this.mutationListeners) listener(room)
  }

  private removePlayerFromActiveGame(room: Room, playerId: string): Room {
    if (!room.gameState || room.players.length < 3) throw new Error('This room is not an active multi-player game.')
    const player = room.players.find((candidate) => candidate.id === playerId)
    if (!player) throw new Error('Player is not in this room.')
    // Close any pending decision owned by the leaving player — the chooser
    // is gone so the decision can never be resolved normally.
    if (room.pendingDecision?.chooserPlayerId === playerId) {
      this.clearDecisionTimer(room.id)
      room.pendingDecision = undefined
    }
    this.clearDisconnectTimer(room.id, playerId)
    room.gameState = removePlayer(room.gameState, playerId)
    // Remove from room player list and clean up session token.
    room.players = room.players.filter((candidate) => candidate.id !== playerId)
    delete room.sessionTokenHashes[playerId]
    room.gameLog = [...room.gameLog, `${player.displayName} đã rời ván.`].slice(-30)
    if (room.gameState.status === 'finished') {
      room.status = 'finished'
      this.clearDecisionTimer(room.id)
      this.clearRoomDisconnectTimers(room.id)
    }
    this.persistRoom(room)
    this.notifyMutation(room)
    return room
  }

  private abandonTwoPlayer(room: Room, playerId: string): Room {
    if (!room.gameState || room.players.length !== 2) throw new Error('This room is not an active two-player game.')
    const player = room.players.find((candidate) => candidate.id === playerId)
    if (!player) throw new Error('Player is not in this room.')
    this.clearDisconnectTimer(room.id, playerId)
    this.clearRoomDisconnectTimers(room.id)
    if (room.pendingDecision?.kind === 'tremors')
      this.resolveTremorsTimeout(room, room.pendingDecision.id)
    if (room.pendingDecision) {
      this.clearDecisionTimer(room.id)
      room.pendingDecision = undefined
    }
    room.gameState = applyTwoPlayerForfeitCore(room.gameState, playerId)
    room.status = 'finished'
    room.gameLog = [...room.gameLog, `${player.displayName} đã rời ván.`].slice(-30)
    for (const candidate of room.players) delete candidate.graceExpiresAt
    this.persistRoom(room)
    this.notifyMutation(room)
    return room
  }

  private scheduleDisconnect(room: Room, player: RoomPlayer): void {
    if (room.status !== 'playing' || room.players.length !== 2 || player.graceExpiresAt === undefined) return
    const key = `${room.id}:${player.id}`
    this.clearDisconnectTimer(key)
    const deadline = player.graceExpiresAt
    const handle = this.scheduler.set(() => {
      const currentRoom = this.rooms.get(room.id)
      const currentPlayer = currentRoom?.players.find((candidate) => candidate.id === player.id)
      if (!currentRoom || !currentPlayer || currentPlayer.connected || currentPlayer.graceExpiresAt !== deadline) return
      if (this.clock.now() < deadline) {
        this.scheduleDisconnect(currentRoom, currentPlayer)
        return
      }
      try { this.abandonTwoPlayer(currentRoom, currentPlayer.id) }
      catch { this.logError('Disconnect abandonment resolution failed; the room remains active.') }
    }, Math.max(0, deadline - this.clock.now()))
    this.disconnectTimers.set(key, { deadline, handle })
  }

  private clearDisconnectTimer(roomIdOrKey: string, playerId?: string): void {
    const key = playerId ? `${roomIdOrKey}:${playerId}` : roomIdOrKey
    const timer = this.disconnectTimers.get(key)
    if (!timer) return
    this.scheduler.clear(timer.handle)
    this.disconnectTimers.delete(key)
  }

  private clearRoomDisconnectTimers(roomId: string): void {
    for (const key of this.disconnectTimers.keys()) {
      if (key.startsWith(`${roomId}:`)) this.clearDisconnectTimer(key)
    }
  }
}