import { describe, expect, it } from 'vitest'
import { hasCardConservation } from '../../src/game/engine/invariants'
import { InMemoryRoomRepository } from '../persistence/inMemoryRoomRepository'
import { serializeRoom } from '../persistence/serializer'
import type { Clock, TimeoutScheduler } from '../rooms/roomService'
import { RoomService } from '../rooms/roomService'

class FakeTime implements Clock, TimeoutScheduler {
  constructor(public value = 1_000) {}
  now(): number { return this.value }
  set(): number { return 1 }
  clear(): void {}
}

describe('account-linked room recovery', () => {
  it('binds only an authenticated creator or joiner to userId while guests stay legacy', () => {
    const service = new RoomService()
    const { room, player: ada } = service.createRoom('Ada', 'socket-ada', 'user-ada')
    const { player: ben } = service.joinRoom(room.id, 'Ben', 'socket-ben')

    expect(ada.userId).toBe('user-ada')
    expect(ben.userId).toBeUndefined()
  })

  it('recovers a disconnected authenticated 2P seat before grace expiry without a browser credential', () => {
    const time = new FakeTime()
    const service = new RoomService(undefined, () => undefined, { clock: time, scheduler: time })
    const { room, player: ada } = service.createRoom('Ada', 'socket-ada', 'user-ada')
    const { player: ben, session: oldSession } = service.joinRoom(room.id, 'Ben', 'socket-ben', 'user-ben')
    service.startRoom(room.id, ada.id)
    const before = service.getRoom(room.id)!.gameState
    service.markDisconnected(room.id, ben.id, 'socket-ben')

    const found = service.findAccountRecovery('user-ben')
    expect(found).toMatchObject({ room: { id: room.id }, player: { id: ben.id }, status: 'recoverable' })
    const recovered = service.recoverAccountSession('user-ben', 'socket-ben-new')

    expect(recovered.session).toMatchObject({ roomId: room.id, playerId: ben.id })
    expect(recovered.session.sessionToken).not.toBe(oldSession.sessionToken)
    expect(service.getRoom(room.id)?.gameState).toBe(before)
    expect(service.isActiveSocket(room.id, ben.id, 'socket-ben-new')).toBe(true)
    expect(() => service.resumeSession(room.id, ben.id, oldSession.sessionToken, 'old')).toThrow('Unable to restore')
    expect(hasCardConservation(service.getRoom(room.id)!.gameState!, 89)).toBe(true)
  })

  it('requires explicit takeover for another socket and leaves the old socket stale', () => {
    const service = new RoomService()
    const { room, player } = service.createRoom('Ada', 'socket-a', 'user-ada')
    expect(service.findAccountRecovery('user-ada')?.status).toBe('already-connected')
    expect(() => service.recoverAccountSession('user-ada', 'socket-b')).toThrow('active elsewhere')

    const recovered = service.recoverAccountSession('user-ada', 'socket-b', true)
    expect(recovered.replacedSocketId).toBe('socket-a')
    expect(service.isActiveSocket(room.id, player.id, 'socket-a')).toBe(false)
    expect(service.isActiveSocket(room.id, player.id, 'socket-b')).toBe(true)
    service.markDisconnected(room.id, player.id, 'socket-a')
    expect(service.isActiveSocket(room.id, player.id, 'socket-b')).toBe(true)
  })

  it('prevents a second active playing room and never exposes another account seat', () => {
    const service = new RoomService()
    const { room, player: ada } = service.createRoom('Ada', 'socket-a', 'user-ada')
    service.joinRoom(room.id, 'Ben', 'socket-b', 'user-ben')
    service.startRoom(room.id, ada.id)
    expect(() => service.createRoom('Again', 'socket-new', 'user-ada')).toThrow('active game')
    expect(service.findAccountRecovery('user-other')).toBeUndefined()
  })

  it('does not duplicate an authenticated lobby seat and lets abandonment win at the exact grace deadline', () => {
    const time = new FakeTime()
    const service = new RoomService(undefined, () => undefined, { clock: time, scheduler: time })
    const { room, player: ada } = service.createRoom('Ada', 'socket-a', 'user-ada')
    expect(() => service.joinRoom(room.id, 'Ada again', 'socket-a2', 'user-ada')).toThrow('already has a seat')
    const { player: ben } = service.joinRoom(room.id, 'Ben', 'socket-b', 'user-ben')
    service.startRoom(room.id, ada.id)
    service.markDisconnected(room.id, ben.id, 'socket-b')
    time.value = 31_000
    expect(service.findAccountRecovery('user-ben')).toBeUndefined()
    expect(room.status).toBe('finished')
    expect(hasCardConservation(room.gameState!, 89)).toBe(true)
  })

  it('persists v5 user IDs, accepts v4 as legacy, and grants restored connected 2P seats one restart deadline', async () => {
    const repository = new InMemoryRoomRepository()
    const time = new FakeTime(10_000)
    const source = new RoomService(repository, () => undefined, { clock: time, scheduler: time })
    const { room, player: ada } = source.createRoom('Ada', 'socket-a', 'user-ada')
    source.joinRoom(room.id, 'Ben', 'socket-b', 'user-ben')
    source.startRoom(room.id, ada.id)
    await source.flushPersistence(room.id)
    const v5 = serializeRoom(room)
    expect(v5.schemaVersion).toBe(5)
    expect(v5.room.players.map((player) => player.userId)).toEqual(['user-ada', 'user-ben'])
    expect(JSON.stringify(v5)).not.toContain('socket-a')

    const restarted = new RoomService(repository, () => undefined, { clock: time, scheduler: time })
    await restarted.restoreFromRepository()
    expect(restarted.findAccountRecovery('user-ada')).toMatchObject({
      room: { id: room.id }, player: { id: ada.id, userId: 'user-ada' }, status: 'recoverable',
    })

    const v4 = structuredClone(v5)
    v4.schemaVersion = 4
    for (const player of v4.room.players) delete player.userId
    const legacyRepository = { save: async () => undefined, deleteRoom: async () => undefined, loadActive: async () => [v4] }
    const restored = new RoomService(legacyRepository, () => undefined, { clock: time, scheduler: time })
    await restored.restoreFromRepository()
    const restoredRoom = restored.getRoom(room.id)!
    expect(restoredRoom.players.every((player) => player.userId === undefined)).toBe(true)
    expect(restoredRoom.players.every((player) => player.graceExpiresAt === 40_000)).toBe(true)
  })
})
