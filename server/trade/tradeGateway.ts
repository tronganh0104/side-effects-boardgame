import { randomUUID } from 'node:crypto'
import type { Server, Socket } from 'socket.io'
import { createPlayerView } from '../game/playerView'
import type { RoomService } from '../rooms/roomService'
import type { Room } from '../rooms/types'
import {
  parseTradeInvitePayload,
  parseTradePlacePayload,
} from './parseTradePayload'
import { createInviteBucket, tryConsumeInvite, type InviteBucket } from './rateLimiter'
import { assertRoomCanTrade } from './tradeEligibility'
import { toTradeCommand } from '../../src/game/trade/tradeCommand'
import { createTradeSessionStore } from '../../src/game/trade/tradeSession'
import { toStatePayload } from '../../src/game/trade/tradeStatePayload'
import type { TradeCloseReason, TradeSession } from '../../src/game/trade/types'

interface Session {
  roomId: string
  playerId: string
}

export function createTradeGateway(deps: {
  io: Server
  rooms: RoomService
  now?: () => number
  createId?: () => string
}) {
  const { io, rooms } = deps
  const now = deps.now ?? Date.now
  const store = createTradeSessionStore({
    now,
    createId: deps.createId ?? randomUUID,
  })

  // Keyed by playerId: a placed card stays locked against ordinary play
  // commands (wired up by Block 4's game:command handler) until it is
  // cleared, replaced, or the session closes.
  const lockedCardIds = new Map<string, string>()
  const inviteBuckets = new Map<string, InviteBucket>()
  // release() only gets a socket id; this remembers which player last used
  // it so a disconnect can close that player's session by playerId.
  const socketPlayers = new Map<string, string>()

  const requireRoom = (roomId: string): Room => {
    const room = rooms.getRoom(roomId)
    if (!room) throw new Error('Phòng không tồn tại.')
    return room
  }

  const emitToPlayer = (
    room: Room,
    playerId: string,
    event: string,
    payload: unknown,
  ): void => {
    const socketId = room.players.find((player) => player.id === playerId)?.socketId
    if (socketId) io.to(socketId).emit(event, payload)
  }

  const emitState = (room: Room, session: TradeSession): void => {
    emitToPlayer(room, session.initiatorPlayerId, 'trade:state', toStatePayload(session, session.initiatorPlayerId))
    emitToPlayer(room, session.partnerPlayerId, 'trade:state', toStatePayload(session, session.partnerPlayerId))
  }

  const emitClosed = (room: Room, session: TradeSession, reason: TradeCloseReason): void => {
    lockedCardIds.delete(session.initiatorPlayerId)
    lockedCardIds.delete(session.partnerPlayerId)
    emitToPlayer(room, session.initiatorPlayerId, 'trade:closed', { reason })
    emitToPlayer(room, session.partnerPlayerId, 'trade:closed', { reason })
  }

  const broadcastGame = (room: Room): void => {
    if (!room.gameState) return
    for (const player of room.players) {
      if (player.socketId)
        io.to(player.socketId).emit('game:state', createPlayerView(room.gameState, player.id, room.pendingDecision))
    }
    io.to(room.id).emit('game:log', room.gameLog)
  }

  const sweepExpiredInvites = (): void => {
    for (const session of store.sweepExpired()) {
      const room = rooms.getRoom(session.roomId)
      if (room) emitClosed(room, session, 'expired')
    }
  }

  const requireExisting = (playerId: string, message: string): TradeSession => {
    const existing = store.getByPlayer(playerId)
    if (!existing) throw new Error(message)
    return existing
  }

  // Both player ids and both card ids on the committed command come from
  // `session` (server state), never from a socket payload — trade:confirm
  // itself carries no payload for a forged id to ride in on.
  const commitTrade = (room: Room, session: TradeSession): void => {
    try {
      rooms.executeCommand(room.id, session.initiatorPlayerId, toTradeCommand(session))
      store.closeSession(session.id)
      const updatedRoom = rooms.getRoom(room.id)!
      broadcastGame(updatedRoom)
      emitClosed(updatedRoom, session, 'committed')
    } catch (error) {
      // The engine rejected the swap (e.g. a card left the hand between
      // confirm and commit). Close cleanly with an error instead of
      // leaving the session wedged.
      store.closeSession(session.id)
      const message = error instanceof Error ? error.message : 'Không thể hoàn tất trao đổi.'
      emitToPlayer(room, session.initiatorPlayerId, 'game:error', message)
      emitToPlayer(room, session.partnerPlayerId, 'game:error', message)
      emitClosed(room, session, 'cancelled')
    }
  }

  return {
    attach(
      socket: Socket,
      activeSession: () => Session,
      fail: (error: unknown) => void,
    ): void {
      const on = (event: string, handler: (session: Session, payload: unknown) => void) => {
        socket.on(event, (payload: unknown) => {
          try {
            sweepExpiredInvites()
            const session = activeSession()
            socketPlayers.set(socket.id, session.playerId)
            handler(session, payload)
          } catch (error) {
            fail(error)
          }
        })
      }

      on('trade:invite', (session, payload) => {
        // Only `targetPlayerId` is ever read out of the payload: the
        // inviter is always `session.playerId`, never client-supplied.
        const { targetPlayerId } = parseTradeInvitePayload(payload)
        const room = requireRoom(session.roomId)
        assertRoomCanTrade(room)
        const target = room.players.find((player) => player.id === targetPlayerId)
        if (!target) throw new Error('Người chơi không tồn tại trong phòng.')
        if (!target.connected) throw new Error('Người chơi đã mất kết nối.')

        const bucket = inviteBuckets.get(session.playerId) ?? createInviteBucket(now())
        inviteBuckets.set(session.playerId, bucket)
        if (!tryConsumeInvite(bucket, now())) {
          socket.emit('game:error', 'Bạn đang mời trao đổi quá nhanh, thử lại sau.')
          return
        }

        emitState(room, store.invite(session.roomId, session.playerId, targetPlayerId))
      })

      on('trade:accept', (session) => {
        const existing = requireExisting(session.playerId, 'Không có lời mời trao đổi nào để chấp nhận.')
        emitState(requireRoom(session.roomId), store.accept(existing.id, session.playerId))
      })

      on('trade:decline', (session) => {
        const existing = requireExisting(session.playerId, 'Không có lời mời trao đổi nào để từ chối.')
        emitClosed(requireRoom(session.roomId), store.decline(existing.id, session.playerId), 'declined')
      })

      on('trade:place', (session, payload) => {
        // Only `cardInstanceId` is ever read out of the payload.
        const { cardInstanceId } = parseTradePlacePayload(payload)
        const existing = requireExisting(session.playerId, 'Bạn không ở trong phiên trao đổi nào.')
        const updated = store.place(existing.id, session.playerId, cardInstanceId)
        lockedCardIds.set(session.playerId, cardInstanceId)
        emitState(requireRoom(session.roomId), updated)
      })

      on('trade:clear', (session) => {
        const existing = requireExisting(session.playerId, 'Bạn không ở trong phiên trao đổi nào.')
        const updated = store.clear(existing.id, session.playerId)
        lockedCardIds.delete(session.playerId)
        emitState(requireRoom(session.roomId), updated)
      })

      on('trade:confirm', (session) => {
        const existing = requireExisting(session.playerId, 'Bạn không ở trong phiên trao đổi nào.')
        const result = store.confirm(existing.id, session.playerId)
        const room = requireRoom(session.roomId)
        if (!result.bothReady) {
          emitState(room, result.session)
          return
        }
        commitTrade(room, result.session)
      })

      on('trade:cancel', (session) => {
        const existing = requireExisting(session.playerId, 'Bạn không ở trong phiên trao đổi nào.')
        emitClosed(requireRoom(session.roomId), store.cancel(existing.id, session.playerId), 'cancelled')
      })
    },

    /** Disconnects close that player's session and free its lock, mirroring chat's release(socketId). */
    release(socketId: string): void {
      const playerId = socketPlayers.get(socketId)
      socketPlayers.delete(socketId)
      if (!playerId) return
      const closed = store.closeForPlayer(playerId)
      if (!closed) return
      const room = rooms.getRoom(closed.roomId)
      if (room) emitClosed(room, closed, 'disconnected')
    },

    /** For Block 4 to call when a turn ends or the game finishes. */
    closeRoomSessions(roomId: string, reason: TradeCloseReason): void {
      const room = rooms.getRoom(roomId)
      for (const closed of store.closeAllInRoom(roomId)) {
        if (room) emitClosed(room, closed, reason)
      }
    },

    /** For Block 4's game:command handler to reject plays/discards of a placed card. */
    isCardLocked(playerId: string, cardInstanceId: string): boolean {
      return lockedCardIds.get(playerId) === cardInstanceId
    },

    /** For Block 4 to wire into a periodic timer; also runs lazily on every trade event. */
    sweepExpiredInvites,
  }
}
