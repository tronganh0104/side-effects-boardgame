import { randomUUID } from 'node:crypto'
import type { Server, Socket } from 'socket.io'
import type { RoomService } from '../rooms/roomService'
import { parseChatSendPayload } from './parseChatPayload'
import { createBucket, tryConsume, type TokenBucket } from './rateLimiter'
import type { ChatMessage } from './types'

interface Session {
  roomId: string
  playerId: string
}

export function createChatGateway(deps: {
  io: Server
  rooms: RoomService
  now?: () => number
  createId?: () => string
}) {
  const { io, rooms } = deps
  const now = deps.now ?? Date.now
  const createId = deps.createId ?? randomUUID
  // Keyed by player, not socket.id: socket.id changes on every reconnect, so
  // keying by socket would let a client burn its burst, disconnect, and get a
  // fresh bucket in a tight loop — defeating the limit almost entirely.
  const buckets = new Map<string, TokenBucket>()
  // release() only gets a socket id, so this remembers which player key each
  // socket belongs to, letting release() clean up the bucket map above by key.
  const socketPlayerKeys = new Map<string, string>()

  return {
    attach(
      socket: Socket,
      activeSession: () => Session,
      fail: (error: unknown) => void,
    ): void {
      socket.on('chat:send', (payload: unknown) => {
        try {
          const session = activeSession()
          // Only `text` is ever read out of the payload below, so a client
          // that also sends `author`, `playerId`, `id`, or `sentAt` has no
          // effect — impersonation is prevented by shape, not by a strip step.
          const { text } = parseChatSendPayload(payload)

          const playerKey = `${session.roomId}:${session.playerId}`
          socketPlayerKeys.set(socket.id, playerKey)
          const bucket = buckets.get(playerKey) ?? createBucket(now())
          buckets.set(playerKey, bucket)
          if (!tryConsume(bucket, now())) {
            socket.emit('game:error', 'You are sending messages too quickly.')
            return
          }

          const room = rooms.getRoom(session.roomId)
          const player = room?.players.find(
            (candidate) => candidate.id === session.playerId,
          )
          if (!player) throw new Error('Player is not in this room.')

          const message: ChatMessage = {
            kind: 'text',
            id: createId(),
            author: { playerId: player.id, displayName: player.displayName },
            sentAt: now(),
            text,
          }
          io.to(session.roomId).emit('chat:message', message)
        } catch (error) {
          fail(error)
        }
      })
    },
    release(socketId: string): void {
      const playerKey = socketPlayerKeys.get(socketId)
      if (playerKey) buckets.delete(playerKey)
      socketPlayerKeys.delete(socketId)
    },
  }
}
