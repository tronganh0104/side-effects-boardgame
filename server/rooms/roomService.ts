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
import { discardCard, discardManual, drawForTurn, endTurn, forfeitGame } from '../../src/game/engine/turns'
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

export class RoomService {
  private readonly rooms = new Map<string, Room>()
  private readonly persistenceQueues = new Map<string, Promise<void>>()

  constructor(
    private readonly repository: RoomRepository = new InMemoryRoomRepository(),
    private readonly logError: (message: string) => void = console.error,
  ) {}

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
    if (room.status !== 'lobby')
      throw new Error('Leaving an active game is not supported yet.')
    const remainingPlayers = room.players.filter(
      (player) => player.id !== playerId,
    )
    if (remainingPlayers.length === room.players.length)
      throw new Error('Player is not in this room.')
    if (remainingPlayers.length === 0) {
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
    if (nextGame.status === 'finished') room.status = 'finished'
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
    room.pendingDecision = undefined
    room.gameState = nextGame
    room.gameLog = [
      ...room.gameLog,
      describeCommand(before, decision.command, nextGame),
    ].slice(-30)
    if (nextGame.status === 'finished') room.status = 'finished'
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
    player.connected = true
    player.socketId = socketId
    this.persistRoom(room)
    return room
  }

  markDisconnected(roomId: string, playerId: string, socketId?: string): Room {
    const room = this.requireRoom(roomId)
    const player = room.players.find((candidate) => candidate.id === playerId)
    if (!player) throw new Error('Player is not in this room.')
    if (socketId && player.socketId !== socketId) return room
    player.connected = false
    player.socketId = undefined
    this.persistRoom(room)
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
    return {
      id: `decision-${randomUUID()}`,
      kind: requirement.kind,
      chooserPlayerId: requirement.chooserPlayerId,
      command,
      choiceMap,
    }
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
}
