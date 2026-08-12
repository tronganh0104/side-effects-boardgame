import { describe, expect, it } from 'vitest'
import type { Server, Socket } from 'socket.io'
import { CHAT_BURST } from '../chat/rateLimiter'
import { createChatGateway } from '../chat/chatGateway'
import type { RoomService } from '../rooms/roomService'
import type { Room } from '../rooms/types'

interface EmittedToRoom {
  roomId: string
  event: string
  payload: unknown
}

function createFakeIo() {
  const emitted: EmittedToRoom[] = []
  const io = {
    to: (roomId: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ roomId, event, payload })
      },
    }),
  }
  return { io: io as unknown as Server, emitted }
}

function createFakeSocket(id: string) {
  const handlers = new Map<string, (payload: unknown) => void>()
  const emitted: { event: string; payload: unknown }[] = []
  const socket = {
    id,
    on: (event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler)
    },
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload })
    },
  }
  return {
    socket: socket as unknown as Socket,
    emitted,
    trigger: (event: string, payload: unknown) => handlers.get(event)?.(payload),
  }
}

function createFakeRooms(room: Room) {
  return {
    getRoom: (roomId: string) => (roomId === room.id ? room : undefined),
  } as unknown as RoomService
}

const room = {
  id: 'ROOM1',
  players: [{ id: 'ada-id', displayName: 'Ada', connected: true }],
} as unknown as Room

describe('chat gateway', () => {
  it('ignores a forged author and stamps the session player and room name', () => {
    const { io, emitted } = createFakeIo()
    const gateway = createChatGateway({
      io,
      rooms: createFakeRooms(room),
      now: () => 1000,
      createId: () => 'msg-1',
    })
    const { socket, trigger } = createFakeSocket('socket-1')
    gateway.attach(
      socket,
      () => ({ roomId: 'ROOM1', playerId: 'ada-id' }),
      (error) => {
        throw error
      },
    )

    trigger('chat:send', {
      text: 'hi there',
      author: { playerId: 'forged-id', displayName: 'Forged' },
      playerId: 'forged-id',
      displayName: 'Forged',
      id: 'forged-msg',
      sentAt: 1,
    })

    expect(emitted).toEqual([
      {
        roomId: 'ROOM1',
        event: 'chat:message',
        payload: {
          kind: 'text',
          id: 'msg-1',
          author: { playerId: 'ada-id', displayName: 'Ada' },
          sentAt: 1000,
          text: 'hi there',
        },
      },
    ])
  })

  it('broadcasts to the room id so the sender receives its own message', () => {
    const { io, emitted } = createFakeIo()
    const gateway = createChatGateway({ io, rooms: createFakeRooms(room) })
    const { socket, trigger } = createFakeSocket('sender-socket')
    gateway.attach(
      socket,
      () => ({ roomId: 'ROOM1', playerId: 'ada-id' }),
      (error) => {
        throw error
      },
    )

    trigger('chat:send', { text: 'hello' })

    expect(emitted).toHaveLength(1)
    expect(emitted[0].roomId).toBe('ROOM1')
  })

  it('routes a session-less socket to fail and broadcasts nothing', () => {
    const { io, emitted } = createFakeIo()
    const gateway = createChatGateway({ io, rooms: createFakeRooms(room) })
    const { socket, trigger } = createFakeSocket('socket-1')
    const failures: unknown[] = []
    gateway.attach(
      socket,
      () => {
        throw new Error('Join a room first.')
      },
      (error) => failures.push(error),
    )

    trigger('chat:send', { text: 'hello' })

    expect(failures).toHaveLength(1)
    expect(emitted).toHaveLength(0)
  })

  it('rate-limits a socket, emitting game:error only to it and no broadcast', () => {
    const { io, emitted } = createFakeIo()
    const gateway = createChatGateway({ io, rooms: createFakeRooms(room), now: () => 0 })
    const { socket, trigger, emitted: socketEmitted } = createFakeSocket('socket-1')
    gateway.attach(
      socket,
      () => ({ roomId: 'ROOM1', playerId: 'ada-id' }),
      (error) => {
        throw error
      },
    )

    for (let i = 0; i < CHAT_BURST; i++) trigger('chat:send', { text: `msg ${i}` })
    trigger('chat:send', { text: 'one too many' })

    expect(emitted).toHaveLength(CHAT_BURST)
    expect(socketEmitted).toEqual([
      { event: 'game:error', payload: 'You are sending messages too quickly.' },
    ])
  })

  it('keeps rate-limiting the same player after they reconnect with a new socket id', () => {
    const { io, emitted } = createFakeIo()
    const gateway = createChatGateway({ io, rooms: createFakeRooms(room), now: () => 0 })
    const session = () => ({ roomId: 'ROOM1', playerId: 'ada-id' })

    const first = createFakeSocket('socket-1')
    gateway.attach(first.socket, session, (error) => {
      throw error
    })
    for (let i = 0; i < CHAT_BURST; i++) first.trigger('chat:send', { text: `msg ${i}` })

    const second = createFakeSocket('socket-2')
    gateway.attach(second.socket, session, (error) => {
      throw error
    })
    second.trigger('chat:send', { text: 'from a new socket id' })

    expect(emitted).toHaveLength(CHAT_BURST)
    expect(second.emitted).toEqual([
      { event: 'game:error', payload: 'You are sending messages too quickly.' },
    ])
  })
})
