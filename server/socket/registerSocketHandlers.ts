import type { Server, Socket } from 'socket.io'
import { createChatGateway } from '../chat/chatGateway'
import { createPlayerView } from '../game/playerView'
import type { GameCommand } from '../game/commands'
import { RoomService } from '../rooms/roomService'
import type { Room } from '../rooms/types'
import { createTradeGateway } from '../trade/tradeGateway'
import { lockableCardId } from '../trade/lockedCardGuard'

interface Session {
  roomId: string
  playerId: string
}

interface ResumePayload extends Session {
  sessionToken: string
}

type UnknownRecord = Record<string, unknown>

function requireRecord(payload: unknown): UnknownRecord {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('Invalid request payload.')
  return payload as UnknownRecord
}

function requireString(
  payload: UnknownRecord,
  key: string,
  maxLength = 256,
): string {
  const value = payload[key]
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maxLength
  )
    throw new Error(`Invalid ${key}.`)
  return value
}

export function parseRoomCreatePayload(payload: unknown): {
  displayName: string
} {
  const record = requireRecord(payload)
  return {
    displayName: requireString(record, 'displayName'),
  }
}

export function parseRoomJoinPayload(payload: unknown): {
  roomId: string
  displayName: string
} {
  const record = requireRecord(payload)
  return {
    roomId: requireString(record, 'roomId'),
    displayName: requireString(record, 'displayName'),
  }
}

export function parseSessionPayload(payload: unknown): ResumePayload {
  const record = requireRecord(payload)
  return {
    roomId: requireString(record, 'roomId'),
    playerId: requireString(record, 'playerId'),
    sessionToken: requireString(record, 'sessionToken', 512),
  }
}

/**
 * Accept only command identifiers. Episode effect options are created by the
 * authoritative pending-decision flow, never trusted from a client payload.
 */
export function parseGameCommandPayload(payload: unknown): GameCommand {
  const record = requireRecord(payload)
  switch (requireString(record, 'type')) {
    case 'draw':
      return { type: 'draw' }
    case 'forfeit':
      return { type: 'forfeit' }
    case 'endTurn':
      return { type: 'endTurn' }
    case 'playDrug':
      return {
        type: 'playDrug',
        drugCardId: requireString(record, 'drugCardId'),
        disorderCardId: requireString(record, 'disorderCardId'),
      }
    case 'playDisorder':
      return {
        type: 'playDisorder',
        disorderCardId: requireString(record, 'disorderCardId'),
        targetPlayerId: requireString(record, 'targetPlayerId'),
      }
    case 'playEpisode':
      return {
        type: 'playEpisode',
        episodeCardId: requireString(record, 'episodeCardId'),
        targetPlayerId: requireString(record, 'targetPlayerId'),
        targetDisorderCardId: requireString(record, 'targetDisorderCardId'),
      }
    case 'playTherapy':
      return {
        type: 'playTherapy',
        therapyCardId: requireString(record, 'therapyCardId'),
        disorderCardId: requireString(record, 'disorderCardId'),
      }
    case 'discard':
      return { type: 'discard', cardInstanceId: requireString(record, 'cardInstanceId') }
    case 'discardManual':
      return { type: 'discardManual', cardInstanceId: requireString(record, 'cardInstanceId') }
    default:
      throw new Error('Unknown game command.')
  }
}

export function parseDecisionPayload(payload: unknown): {
  decisionId: string
  choiceIds: string[]
} {
  const record = requireRecord(payload)
  const choiceIds = record.choiceIds
  if (
    !Array.isArray(choiceIds) ||
    choiceIds.length > 3 ||
    choiceIds.some((choiceId) => typeof choiceId !== 'string' || !choiceId.trim())
  )
    throw new Error('Invalid pending card choices.')
  return {
    decisionId: requireString(record, 'decisionId'),
    choiceIds,
  }
}

export function registerSocketHandlers(io: Server, rooms: RoomService): void {
  const sessions = new Map<string, Session>()
  const chat = createChatGateway({ io, rooms })
  const trade = createTradeGateway({ io, rooms })

  const roomState = (room: Room) => ({
    id: room.id,
    hostPlayerId: room.hostPlayerId,
    status: room.status,
    players: room.players.map(({ id, displayName, connected }) => ({
      id,
      displayName,
      connected,
    })),
  })
  const broadcastRoom = (room: Room) =>
    io.to(room.id).emit('room:state', roomState(room))
  const broadcastGame = (room: Room) => {
    if (!room.gameState) return
    for (const player of room.players) {
      if (player.socketId)
        io.to(player.socketId).emit(
          'game:state',
          createPlayerView(room.gameState, player.id, room.pendingDecision),
        )
    }
    io.to(room.id).emit('game:log', room.gameLog)
  }
  const fail = (socket: Socket, error: unknown) =>
    socket.emit(
      'game:error',
      error instanceof Error ? error.message : 'Unable to process request.',
    )
  const activeSession = (socket: Socket): Session => {
    const session = sessions.get(socket.id)
    if (!session) throw new Error('Join a room first.')
    if (!rooms.isActiveSocket(session.roomId, session.playerId, socket.id))
      throw new Error('This socket session is no longer active.')
    return session
  }

  io.on('connection', (socket) => {
    chat.attach(socket, () => activeSession(socket), (error) => fail(socket, error))
    trade.attach(socket, () => activeSession(socket), (error) => fail(socket, error))

    socket.on('room:create', (payload: unknown) => {
        try {
          const { displayName } = parseRoomCreatePayload(payload)
          const { room, player, session } = rooms.createRoom(displayName, socket.id)
          sessions.set(socket.id, { roomId: room.id, playerId: player.id })
          socket.join(room.id)
          socket.emit('session:restored', session)
          socket.emit('room:state', roomState(room))
        } catch (error) {
          fail(socket, error)
        }
      })

    socket.on('room:join', (payload: unknown) => {
        try {
          const { roomId, displayName } = parseRoomJoinPayload(payload)
          const { room, player, session } = rooms.joinRoom(
            roomId,
            displayName,
            socket.id,
          )
          sessions.set(socket.id, { roomId, playerId: player.id })
          socket.join(roomId)
          socket.emit('session:restored', session)
          broadcastRoom(room)
        } catch (error) {
          fail(socket, error)
        }
      })

    socket.on('session:resume', (payload: unknown) => {
      try {
        const { roomId, playerId, sessionToken } = parseSessionPayload(payload)
        const room = rooms.resumeSession(
          roomId,
          playerId,
          sessionToken,
          socket.id,
        )
        sessions.set(socket.id, { roomId, playerId })
        socket.join(roomId)
        socket.emit('session:restored', { roomId, playerId, sessionToken })
        broadcastRoom(room)
        broadcastGame(room)
      } catch {
        // Do not reveal whether a room, player, or credential was invalid.
        socket.emit('game:error', 'Unable to restore session.')
      }
    })

    socket.on('room:start', () => {
      try {
        const session = activeSession(socket)
        const room = rooms.startRoom(session.roomId, session.playerId)
        broadcastRoom(room)
        broadcastGame(room)
      } catch (error) {
        fail(socket, error)
      }
    })

    socket.on('room:leave', () => {
      try {
        const session = activeSession(socket)
        const room = rooms.leaveRoom(session.roomId, session.playerId)
        sessions.delete(socket.id)
        socket.leave(session.roomId)
        // A player leaving invalidates any trade session in this room (spec
        // section 6.3): the two seats a session assumes may no longer both
        // be occupied.
        trade.closeRoomSessions(session.roomId, 'cancelled')
        socket.emit('room:left')
        if (room) broadcastRoom(room)
      } catch (error) {
        fail(socket, error)
      }
    })

    socket.on('game:command', (payload: unknown) => {
      try {
        const session = activeSession(socket)
        const command = parseGameCommandPayload(payload)
        // Spec section 6.1: a card placed into a trade slot must not be
        // playable or discardable while the session is open, or the other
        // side can confirm against a card that no longer exists. This is a
        // UX guard only — the engine still re-validates at commit time.
        const targetedCardId = lockableCardId(command)
        if (targetedCardId && trade.isCardLocked(session.playerId, targetedCardId))
          throw new Error(
            'Lá bài này đang được đặt trong một phiên trao đổi, hãy rút ra trước khi sử dụng.',
          )
        const beforePlayerId = rooms.getRoom(session.roomId)?.gameState?.currentPlayerId
        const nextGame = rooms.executeCommand(session.roomId, session.playerId, command)
        const room = rooms.getRoom(session.roomId)!
        // Spec section 6.3: a trade session becomes invalid once the current
        // turn ends or the game finishes, since it was negotiated against a
        // hand state that may no longer hold.
        if (nextGame.status === 'finished' || nextGame.currentPlayerId !== beforePlayerId)
          trade.closeRoomSessions(session.roomId, 'cancelled')
        broadcastRoom(room)
        broadcastGame(room)
      } catch (error) {
        fail(socket, error)
      }
    })

    socket.on('game:decision', (payload: unknown) => {
        try {
          const session = activeSession(socket)
          const { decisionId, choiceIds } = parseDecisionPayload(payload)
          const beforePlayerId = rooms.getRoom(session.roomId)?.gameState?.currentPlayerId
          const nextGame = rooms.resolveDecision(
            session.roomId,
            session.playerId,
            decisionId,
            choiceIds,
          )
          const room = rooms.getRoom(session.roomId)!
          if (nextGame.status === 'finished' || nextGame.currentPlayerId !== beforePlayerId)
            trade.closeRoomSessions(session.roomId, 'cancelled')
          broadcastRoom(room)
          broadcastGame(room)
        } catch (error) {
          fail(socket, error)
        }
      })

    socket.on('disconnect', () => {
      const session = sessions.get(socket.id)
      sessions.delete(socket.id)
      chat.release(socket.id)
      trade.release(socket.id)
      if (!session) return
      try {
        const room = rooms.markDisconnected(
          session.roomId,
          session.playerId,
          socket.id,
        )
        broadcastRoom(room)
      } catch {
        // The in-memory room may already have been removed from a lobby leave.
      }
    })
  })
}
