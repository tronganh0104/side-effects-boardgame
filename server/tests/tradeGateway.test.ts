import { describe, expect, it } from 'vitest'
import type { Server, Socket } from 'socket.io'
import type { RandomSource } from '../../src/game/engine/random'
import { createGame } from '../../src/game/engine/setup'
import { drawForTurn } from '../../src/game/engine/turns'
import type { GameState } from '../../src/game/engine/types'
import { tradeCards } from '../../src/game/engine/trading'
import { createTradeGateway } from '../trade/tradeGateway'
import { TRADE_INVITE_BURST } from '../trade/rateLimiter'
import { TRADE_INVITE_EXPIRY_MS } from '../../src/game/trade/types'
import type { RoomService } from '../rooms/roomService'
import type { Room } from '../rooms/types'
import type { GameCommand } from '../game/commands'

class SeededRandom implements RandomSource {
  private state: number
  constructor(seed: number) {
    this.state = seed
  }
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0
    return this.state / 2 ** 32
  }
}

function createPlayableGame(): GameState {
  const game = createGame(['Ada', 'Ben'], {
    rng: new SeededRandom(10),
    playerIds: ['ada', 'ben'],
  })
  return drawForTurn(game, game.currentPlayerId, { rng: new SeededRandom(20) })
}

interface EmittedToTarget {
  target: string
  event: string
  payload: unknown
}

function createFakeIo() {
  const emitted: EmittedToTarget[] = []
  const io = {
    to: (target: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ target, event, payload })
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
    trigger: (event: string, payload?: unknown) => handlers.get(event)?.(payload),
  }
}

function createRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'ROOM1',
    hostPlayerId: 'ada',
    players: [
      { id: 'ada', displayName: 'Ada', connected: true, socketId: 'socket-ada' },
      { id: 'ben', displayName: 'Ben', connected: true, socketId: 'socket-ben' },
      { id: 'cara', displayName: 'Cara', connected: true, socketId: 'socket-cara' },
    ],
    status: 'playing',
    gameState: createPlayableGame(),
    gameLog: [],
    sessionTokenHashes: {},
    ...overrides,
  } as Room
}

function createFakeRooms(
  room: Room,
  executeCommand?: RoomService['executeCommand'],
) {
  const defaultExecute = (
    _roomId: string,
    _playerId: string,
    command: GameCommand,
  ): GameState => {
    if (command.type !== 'tradeCards')
      throw new Error('Fake RoomService only supports tradeCards in this suite.')
    const next = tradeCards(room.gameState!, command)
    room.gameState = next
    return next
  }
  return {
    getRoom: (roomId: string) => (roomId === room.id ? room : undefined),
    executeCommand: executeCommand ?? defaultExecute,
  } as unknown as RoomService
}

function attachAll(
  gateway: ReturnType<typeof createTradeGateway>,
  players: Record<string, string>,
) {
  const sockets: Record<string, ReturnType<typeof createFakeSocket>> = {}
  for (const [playerId, socketId] of Object.entries(players)) {
    const fake = createFakeSocket(socketId)
    sockets[playerId] = fake
    gateway.attach(
      fake.socket,
      () => ({ roomId: 'ROOM1', playerId }),
      (error) => {
        throw error
      },
    )
  }
  return sockets
}

describe('trade gateway — invite flow', () => {
  it('emits trade:state to both sides on a successful invite', () => {
    const room = createRoom()
    const { io, emitted } = createFakeIo()
    const gateway = createTradeGateway({ io, rooms: createFakeRooms(room), now: () => 1_000 })
    const sockets = attachAll(gateway, { ada: 'socket-ada', ben: 'socket-ben' })

    sockets.ada.trigger('trade:invite', { targetPlayerId: 'ben' })

    const toAda = emitted.find((e) => e.target === 'socket-ada' && e.event === 'trade:state')
    const toBen = emitted.find((e) => e.target === 'socket-ben' && e.event === 'trade:state')
    expect(toAda?.payload).toMatchObject({
      withPlayerId: 'ben',
      yourRole: 'initiator',
      phase: 'pending',
      yourCardId: null,
      theyPlaced: false,
      expiresAt: 1_000 + TRADE_INVITE_EXPIRY_MS,
    })
    expect(toBen?.payload).toMatchObject({
      withPlayerId: 'ada',
      yourRole: 'partner',
      phase: 'pending',
    })
  })

  it('the inviter always comes from the session, not the payload', () => {
    const room = createRoom()
    const { io } = createFakeIo()
    const gateway = createTradeGateway({ io, rooms: createFakeRooms(room) })
    const failures: unknown[] = []
    const { socket, trigger } = createFakeSocket('socket-ada')
    gateway.attach(socket, () => ({ roomId: 'ROOM1', playerId: 'ada' }), (e) => failures.push(e))

    // A payload trying to forge a different initiator has no field to land
    // in: parseTradeInvitePayload only ever reads targetPlayerId.
    trigger('trade:invite', { targetPlayerId: 'ben', initiatorPlayerId: 'cara' })
    expect(failures).toHaveLength(0)

    // If the forged id had been honored, the real caller (ada) would still
    // be free, and this second invite from the same ada socket would
    // succeed instead of hitting the "already busy" guard.
    trigger('trade:invite', { targetPlayerId: 'cara' })
    expect(String((failures[0] as Error)?.message)).toMatch(/đang bận/)
  })

  it('rejects inviting a player who is already in a session', () => {
    const room = createRoom()
    const { io } = createFakeIo()
    const gateway = createTradeGateway({ io, rooms: createFakeRooms(room) })
    const failures: unknown[] = []
    const sockets = attachAll(gateway, { ada: 'socket-ada', ben: 'socket-ben', cara: 'socket-cara' })
    // Reattach cara with a fail collector instead of the throwing default.
    const caraFake = createFakeSocket('socket-cara')
    gateway.attach(caraFake.socket, () => ({ roomId: 'ROOM1', playerId: 'cara' }), (e) => failures.push(e))

    sockets.ada.trigger('trade:invite', { targetPlayerId: 'ben' })
    caraFake.trigger('trade:invite', { targetPlayerId: 'ben' })

    expect(failures).toHaveLength(1)
    expect(String((failures[0] as Error).message)).toMatch(/đang bận/)
  })

  it('rejects trading when the game is not playing', () => {
    const room = createRoom({ status: 'lobby' })
    const { io } = createFakeIo()
    const gateway = createTradeGateway({ io, rooms: createFakeRooms(room) })
    const failures: unknown[] = []
    const { socket, trigger } = createFakeSocket('socket-ada')
    gateway.attach(socket, () => ({ roomId: 'ROOM1', playerId: 'ada' }), (e) => failures.push(e))

    trigger('trade:invite', { targetPlayerId: 'ben' })

    expect(String((failures[0] as Error).message)).toMatch(/ván đang diễn ra/)
  })

  it('rejects trading while the running turn is still in the draw phase', () => {
    const rawGame = createGame(['Ada', 'Ben'], { rng: new SeededRandom(1), playerIds: ['ada', 'ben'] })
    expect(rawGame.turn.phase).toBe('draw')
    const room = createRoom({ gameState: rawGame })
    const { io } = createFakeIo()
    const gateway = createTradeGateway({ io, rooms: createFakeRooms(room) })
    const failures: unknown[] = []
    const { socket, trigger } = createFakeSocket('socket-ada')
    gateway.attach(socket, () => ({ roomId: 'ROOM1', playerId: 'ada' }), (e) => failures.push(e))

    trigger('trade:invite', { targetPlayerId: 'ben' })

    expect(String((failures[0] as Error).message)).toMatch(/rút bài/)
  })

  it('rejects trading while a pending Episode decision is outstanding', () => {
    const room = createRoom({
      pendingDecision: {
        id: 'decision-1',
        kind: 'anxiety',
        chooserPlayerId: 'ada',
        command: { type: 'playEpisode' } as never,
        choiceMap: {},
      },
    })
    const { io } = createFakeIo()
    const gateway = createTradeGateway({ io, rooms: createFakeRooms(room) })
    const failures: unknown[] = []
    const { socket, trigger } = createFakeSocket('socket-ada')
    gateway.attach(socket, () => ({ roomId: 'ROOM1', playerId: 'ada' }), (e) => failures.push(e))

    trigger('trade:invite', { targetPlayerId: 'ben' })

    expect(String((failures[0] as Error).message)).toMatch(/quyết định đang chờ/)
  })

  it('rate-limits trade:invite, emitting game:error only to the sender', () => {
    const room = createRoom()
    const { io } = createFakeIo()
    const gateway = createTradeGateway({ io, rooms: createFakeRooms(room), now: () => 0 })
    const { socket, trigger, emitted } = createFakeSocket('socket-ada')
    gateway.attach(socket, () => ({ roomId: 'ROOM1', playerId: 'ada' }), (e) => {
      throw e
    })

    for (let i = 0; i < TRADE_INVITE_BURST; i++) {
      trigger('trade:invite', { targetPlayerId: 'ben' })
      trigger('trade:cancel')
    }
    trigger('trade:invite', { targetPlayerId: 'ben' })

    expect(emitted.at(-1)).toEqual({
      event: 'game:error',
      payload: 'Bạn đang mời trao đổi quá nhanh, thử lại sau.',
    })
  })
})

describe('trade gateway — open negotiation', () => {
  it('a place from one side resets both ready flags, even after the other side already confirmed', () => {
    // Deliberately stops short of both-ready: reaching bothReady triggers an
    // immediate commit (tested separately below), which would close the
    // session before we get to observe the reset. This test only needs one
    // side confirmed to prove the rule.
    const room = createRoom()
    const { io, emitted } = createFakeIo()
    const gateway = createTradeGateway({ io, rooms: createFakeRooms(room) })
    const sockets = attachAll(gateway, { ada: 'socket-ada', ben: 'socket-ben' })

    sockets.ada.trigger('trade:invite', { targetPlayerId: 'ben' })
    sockets.ben.trigger('trade:accept')
    sockets.ada.trigger('trade:place', { cardInstanceId: 'card-ada-1' })
    sockets.ben.trigger('trade:place', { cardInstanceId: 'card-ben-1' })
    sockets.ada.trigger('trade:confirm')

    const afterAdaConfirm = emitted
      .filter((e) => e.target === 'socket-ada' && e.event === 'trade:state')
      .at(-1)
    expect(afterAdaConfirm?.payload).toMatchObject({ yourReady: true, theyReady: false })

    emitted.length = 0
    sockets.ben.trigger('trade:place', { cardInstanceId: 'card-ben-2' })

    const toAdaAfter = emitted.find((e) => e.target === 'socket-ada' && e.event === 'trade:state')
    const toBenAfter = emitted.find((e) => e.target === 'socket-ben' && e.event === 'trade:state')
    expect(toAdaAfter?.payload).toMatchObject({ yourReady: false, theyReady: false })
    expect(toBenAfter?.payload).toMatchObject({ yourReady: false, theyReady: false })
  })

  it('trade:state never carries the opponent card id, even mid-negotiation', () => {
    const room = createRoom()
    const { io, emitted } = createFakeIo()
    const gateway = createTradeGateway({ io, rooms: createFakeRooms(room) })
    const sockets = attachAll(gateway, { ada: 'socket-ada', ben: 'socket-ben' })

    sockets.ada.trigger('trade:invite', { targetPlayerId: 'ben' })
    sockets.ben.trigger('trade:accept')
    sockets.ada.trigger('trade:place', { cardInstanceId: 'ada-secret-card' })
    sockets.ben.trigger('trade:place', { cardInstanceId: 'ben-secret-card' })

    for (const entry of emitted) {
      if (entry.event !== 'trade:state') continue
      const serialized = JSON.stringify(entry.payload)
      if (entry.target === 'socket-ada') expect(serialized).not.toContain('ben-secret-card')
      if (entry.target === 'socket-ben') expect(serialized).not.toContain('ada-secret-card')
      expect(typeof (entry.payload as { theyPlaced: unknown }).theyPlaced).toBe('boolean')
    }
  })

  it('locks a placed card and frees it on clear', () => {
    const room = createRoom()
    const { io } = createFakeIo()
    const gateway = createTradeGateway({ io, rooms: createFakeRooms(room) })
    const sockets = attachAll(gateway, { ada: 'socket-ada', ben: 'socket-ben' })

    sockets.ada.trigger('trade:invite', { targetPlayerId: 'ben' })
    sockets.ben.trigger('trade:accept')
    sockets.ada.trigger('trade:place', { cardInstanceId: 'card-ada-1' })

    expect(gateway.isCardLocked('ada', 'card-ada-1')).toBe(true)
    sockets.ada.trigger('trade:clear')
    expect(gateway.isCardLocked('ada', 'card-ada-1')).toBe(false)
  })
})

describe('trade gateway — commit', () => {
  it('on both-ready, commits via rooms.executeCommand using session-derived ids and closes with reason committed', () => {
    const room = createRoom()
    const { io, emitted } = createFakeIo()
    const commandsSeen: GameCommand[] = []
    const rooms = createFakeRooms(room, (roomId, playerId, command) => {
      commandsSeen.push(command)
      if (command.type !== 'tradeCards') throw new Error('unexpected command')
      const next = tradeCards(room.gameState!, command)
      room.gameState = next
      return next
    })
    const gateway = createTradeGateway({ io, rooms })
    const sockets = attachAll(gateway, { ada: 'socket-ada', ben: 'socket-ben' })

    const adaCardBefore = room.gameState!.players.find((p) => p.id === 'ada')!.hand[0].instanceId
    const benCardBefore = room.gameState!.players.find((p) => p.id === 'ben')!.hand[0].instanceId

    sockets.ada.trigger('trade:invite', { targetPlayerId: 'ben' })
    sockets.ben.trigger('trade:accept')
    sockets.ada.trigger('trade:place', { cardInstanceId: adaCardBefore })
    sockets.ben.trigger('trade:place', { cardInstanceId: benCardBefore })
    sockets.ada.trigger('trade:confirm')
    // Attempt to smuggle forged identity through the (payload-less) confirm event.
    sockets.ben.trigger('trade:confirm', {
      initiatorPlayerId: 'ghost',
      initiatorCardId: 'ghost-card',
      partnerPlayerId: 'ghost2',
      partnerCardId: 'ghost-card-2',
    })

    expect(commandsSeen).toEqual([
      {
        type: 'tradeCards',
        initiatorPlayerId: 'ada',
        initiatorCardId: adaCardBefore,
        partnerPlayerId: 'ben',
        partnerCardId: benCardBefore,
      },
    ])

    const adaHandAfter = room.gameState!.players.find((p) => p.id === 'ada')!.hand
    expect(adaHandAfter.some((c) => c.instanceId === benCardBefore)).toBe(true)

    const closedEvents = emitted.filter((e) => e.event === 'trade:closed')
    expect(closedEvents).toEqual(
      expect.arrayContaining([
        { target: 'socket-ada', event: 'trade:closed', payload: { reason: 'committed' } },
        { target: 'socket-ben', event: 'trade:closed', payload: { reason: 'committed' } },
      ]),
    )
    expect(emitted.some((e) => e.event === 'game:state' && e.target === 'socket-ada')).toBe(true)
    expect(gateway.isCardLocked('ada', adaCardBefore)).toBe(false)
  })

  it('closes cleanly with an error to both sides when the engine rejects the commit', () => {
    const room = createRoom()
    const { io, emitted } = createFakeIo()
    const rooms = createFakeRooms(room, () => {
      throw new Error('Lá bài đã không còn trong tay.')
    })
    const gateway = createTradeGateway({ io, rooms })
    const sockets = attachAll(gateway, { ada: 'socket-ada', ben: 'socket-ben' })

    sockets.ada.trigger('trade:invite', { targetPlayerId: 'ben' })
    sockets.ben.trigger('trade:accept')
    sockets.ada.trigger('trade:place', { cardInstanceId: 'card-ada-1' })
    sockets.ben.trigger('trade:place', { cardInstanceId: 'card-ben-1' })
    sockets.ada.trigger('trade:confirm')
    sockets.ben.trigger('trade:confirm')

    expect(emitted).toEqual(
      expect.arrayContaining([
        { target: 'socket-ada', event: 'game:error', payload: 'Lá bài đã không còn trong tay.' },
        { target: 'socket-ben', event: 'game:error', payload: 'Lá bài đã không còn trong tay.' },
        { target: 'socket-ada', event: 'trade:closed', payload: { reason: 'cancelled' } },
        { target: 'socket-ben', event: 'trade:closed', payload: { reason: 'cancelled' } },
      ]),
    )
    expect(gateway.isCardLocked('ada', 'card-ada-1')).toBe(false)

    // The session is fully freed, so a fresh invite works again.
    const failures: unknown[] = []
    const adaFake = createFakeSocket('socket-ada')
    gateway.attach(adaFake.socket, () => ({ roomId: 'ROOM1', playerId: 'ada' }), (e) => failures.push(e))
    adaFake.trigger('trade:invite', { targetPlayerId: 'ben' })
    expect(failures).toHaveLength(0)
  })
})

describe('trade gateway — teardown paths', () => {
  it('expires a stale pending invite and notifies both sides', () => {
    const room = createRoom()
    const { io, emitted } = createFakeIo()
    let currentTime = 0
    const gateway = createTradeGateway({ io, rooms: createFakeRooms(room), now: () => currentTime })
    const sockets = attachAll(gateway, { ada: 'socket-ada', ben: 'socket-ben' })

    sockets.ada.trigger('trade:invite', { targetPlayerId: 'ben' })
    currentTime += TRADE_INVITE_EXPIRY_MS
    gateway.sweepExpiredInvites()

    expect(emitted).toEqual(
      expect.arrayContaining([
        { target: 'socket-ada', event: 'trade:closed', payload: { reason: 'expired' } },
        { target: 'socket-ben', event: 'trade:closed', payload: { reason: 'expired' } },
      ]),
    )

    const failures: unknown[] = []
    const adaFake = createFakeSocket('socket-ada')
    gateway.attach(adaFake.socket, () => ({ roomId: 'ROOM1', playerId: 'ada' }), (e) => failures.push(e))
    adaFake.trigger('trade:invite', { targetPlayerId: 'ben' })
    expect(failures).toHaveLength(0)
  })

  it('release() on disconnect closes the session and frees the lock', () => {
    const room = createRoom()
    const { io, emitted } = createFakeIo()
    const gateway = createTradeGateway({ io, rooms: createFakeRooms(room) })
    const sockets = attachAll(gateway, { ada: 'socket-ada', ben: 'socket-ben' })

    sockets.ada.trigger('trade:invite', { targetPlayerId: 'ben' })
    sockets.ben.trigger('trade:accept')
    sockets.ada.trigger('trade:place', { cardInstanceId: 'card-ada-1' })

    gateway.release('socket-ada')

    expect(emitted).toEqual(
      expect.arrayContaining([
        { target: 'socket-ada', event: 'trade:closed', payload: { reason: 'disconnected' } },
        { target: 'socket-ben', event: 'trade:closed', payload: { reason: 'disconnected' } },
      ]),
    )
    expect(gateway.isCardLocked('ada', 'card-ada-1')).toBe(false)
  })

  it('closeRoomSessions closes and frees every session for that room', () => {
    const room = createRoom()
    const { io, emitted } = createFakeIo()
    const gateway = createTradeGateway({ io, rooms: createFakeRooms(room) })
    const sockets = attachAll(gateway, { ada: 'socket-ada', ben: 'socket-ben' })

    sockets.ada.trigger('trade:invite', { targetPlayerId: 'ben' })
    gateway.closeRoomSessions('ROOM1', 'cancelled')

    expect(emitted).toEqual(
      expect.arrayContaining([
        { target: 'socket-ada', event: 'trade:closed', payload: { reason: 'cancelled' } },
        { target: 'socket-ben', event: 'trade:closed', payload: { reason: 'cancelled' } },
      ]),
    )

    const failures: unknown[] = []
    const adaFake = createFakeSocket('socket-ada')
    gateway.attach(adaFake.socket, () => ({ roomId: 'ROOM1', playerId: 'ada' }), (e) => failures.push(e))
    adaFake.trigger('trade:invite', { targetPlayerId: 'ben' })
    expect(failures).toHaveLength(0)
  })
})
