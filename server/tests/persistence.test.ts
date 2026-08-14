import { describe, expect, it, vi } from 'vitest'
import { hasCardConservation } from '../../src/game/engine/invariants'
import { InMemoryRoomRepository } from '../persistence/inMemoryRoomRepository'
import { deserializeRoom, serializeRoom } from '../persistence/serializer'
import type { PersistedRoomSnapshot, RoomRepository } from '../persistence/types'
import { RoomService } from '../rooms/roomService'
import type { Clock, TimeoutScheduler } from '../rooms/roomService'

class FakeTime implements Clock, TimeoutScheduler {
  private readonly timers = new Map<number, { callback: () => void; dueAt: number }>()
  private nextId = 1

  constructor(public value: number) {}
  now(): number { return this.value }
  set(callback: () => void, delayMs: number): number {
    const id = this.nextId++
    this.timers.set(id, { callback, dueAt: this.value + delayMs })
    return id
  }
  clear(handle: unknown): void { this.timers.delete(handle as number) }
  get nextDueAt(): number | undefined {
    const due = [...this.timers.values()].map((timer) => timer.dueAt)
    return due.length > 0 ? Math.min(...due) : undefined
  }
  advanceTo(value: number): void {
    this.value = value
    while (true) {
      const due = [...this.timers.entries()].find(([, timer]) => timer.dueAt <= value)
      if (!due) return
      this.timers.delete(due[0])
      due[1].callback()
    }
  }
}

function startedService(repository = new InMemoryRoomRepository()) {
  const service = new RoomService(repository, () => undefined)
  const { room, player: host, session: hostSession } = service.createRoom('Ada')
  const { player: ben, session: benSession } = service.joinRoom(room.id, 'Ben')
  service.startRoom(room.id, host.id)
  return { service, repository, room, host, ben, hostSession, benSession }
}

describe('room persistence', () => {
  it('persists create, join, start, and only valid commands', async () => {
    const repository = new InMemoryRoomRepository()
    const service = new RoomService(repository, () => undefined)
    const { room, player: host } = service.createRoom('Ada')
    await service.flushPersistence(room.id)
    expect(repository.saveCount).toBe(1)

    service.joinRoom(room.id, 'Ben')
    await service.flushPersistence(room.id)
    expect(repository.saveCount).toBe(2)
    service.startRoom(room.id, host.id)
    await service.flushPersistence(room.id)
    expect(repository.saveCount).toBe(3)

    const game = service.getRoom(room.id)!.gameState!
    const nonCurrentPlayerId = game.players.find(
      (player) => player.id !== game.currentPlayerId,
    )!.id
    expect(() =>
      service.executeCommand(room.id, nonCurrentPlayerId, { type: 'draw' }),
    ).toThrow()
    await service.flushPersistence(room.id)
    expect(repository.saveCount).toBe(3)

    service.executeCommand(room.id, game.currentPlayerId, { type: 'draw' })
    await service.flushPersistence(room.id)
    expect(repository.saveCount).toBe(4)
  })

  it('deletes an empty lobby snapshot so it cannot restore after restart', async () => {
    const repository = new InMemoryRoomRepository()
    const service = new RoomService(repository, () => undefined)
    const { room, player } = service.createRoom('Ada')
    await service.flushPersistence(room.id)
    expect(repository.readRoom(room.id)).toBeDefined()

    service.leaveRoom(room.id, player.id)
    await service.flushPersistence(room.id)
    expect(repository.readRoom(room.id)).toBeUndefined()

    const restartedService = new RoomService(repository, () => undefined)
    await restartedService.restoreFromRepository()
    expect(restartedService.getRoom(room.id)).toBeUndefined()
  })

  it('round-trips and restores active rooms with disconnected players', async () => {
    const repository = new InMemoryRoomRepository()
    const { service, room, host, ben, hostSession, benSession } =
      startedService(repository)
    await service.flushPersistence(room.id)
    const beforeRestart = service.getRoom(room.id)!
    const snapshot = serializeRoom(beforeRestart)

    expect(deserializeRoom(snapshot).gameState).toEqual(beforeRestart.gameState)
    expect(JSON.stringify(snapshot)).not.toContain(hostSession.sessionToken)
    expect(snapshot.room.sessionTokenHashes[host.id]).toEqual(
      expect.any(String),
    )
    const restoredService = new RoomService(repository, () => undefined)
    await restoredService.restoreFromRepository()
    const restored = restoredService.getRoom(room.id)!

    expect(restored.players.every((player) => !player.connected)).toBe(true)
    expect(restored.players.every((player) => !player.socketId)).toBe(true)
    expect(hasCardConservation(restored.gameState!)).toBe(true)

    restoredService.resumeSession(
      room.id,
      host.id,
      hostSession.sessionToken,
      'new-ada-socket',
    )
    restoredService.resumeSession(
      room.id,
      ben.id,
      benSession.sessionToken,
      'new-ben-socket',
    )
    expect(restoredService.getRoom(room.id)!.players[0]).toMatchObject({
      id: host.id,
      connected: true,
      socketId: 'new-ada-socket',
    })
    const restoredGame = restoredService.getRoom(room.id)!.gameState!
    expect(
      restoredService.executeCommand(room.id, restoredGame.currentPlayerId, {
        type: 'draw',
      }).turn.phase,
    ).toBe('play')
  })

  it('preserves pending Anxiety and Tremors decisions across restart', async () => {
    for (const kind of ['anxiety', 'tremors'] as const) {
      const repository = new InMemoryRoomRepository()
      const { service, room, hostSession, benSession } = startedService(repository)
      const current = room.gameState!.players[room.gameState!.currentPlayerIndex]
      const target = room.gameState!.players.find(
        (player) => player.id !== current.id,
      )!
      room.pendingDecision = {
        id: `decision-${kind}`,
        kind,
        chooserPlayerId: kind === 'anxiety' ? current.id : target.id,
        command: {
          type: 'playEpisode',
          episodeCardId: 'episode-01',
          targetPlayerId: target.id,
          targetDisorderCardId: target.psyche.slots[0].disorder.instanceId,
        },
        choiceMap:
          kind === 'anxiety'
            ? { 'choice-1': target.hand[0].instanceId }
            : Object.fromEntries(
                target.hand.slice(0, 3).map((card) => [
                  card.instanceId,
                  card.instanceId,
                ]),
              ),
        ...(kind === 'tremors' ? { expiresAt: Date.now() + 60_000 } : {}),
      }
      // Resume triggers a persistence mutation without exposing socket IDs.
      service.resumeSession(
        room.id,
        current.id,
        current.id === hostSession.playerId
          ? hostSession.sessionToken
          : benSession.sessionToken,
        'temporary-socket',
      )
      await service.flushPersistence(room.id)

      const restoredService = new RoomService(repository, () => undefined)
      await restoredService.restoreFromRepository()
      expect(restoredService.getRoom(room.id)?.pendingDecision).toMatchObject({
        id: `decision-${kind}`,
        kind,
      })
      restoredService.dispose()
    }
  })

  it('migrates v3 disconnects once and preserves the v4 deadline across restarts', async () => {
    const repository = new InMemoryRoomRepository()
    const source = startedService(repository)
    const disconnected = source.room.players[1]
    source.service.markDisconnected(source.room.id, disconnected.id)
    await source.service.flushPersistence(source.room.id)

    const legacy = serializeRoom(source.room)
    legacy.schemaVersion = 3
    for (const player of legacy.room.players) delete player.graceExpiresAt
    const legacyRepository: RoomRepository = {
      save: async (snapshot) => repository.save(snapshot),
      deleteRoom: async (roomId) => repository.deleteRoom(roomId),
      loadActive: async () => [structuredClone(legacy)],
    }
    const firstTime = new FakeTime(10_000)
    const first = new RoomService(legacyRepository, () => undefined, {
      clock: firstTime,
      scheduler: firstTime,
    })
    await first.restoreFromRepository()
    const firstRoom = first.getRoom(source.room.id)!
    const firstDeadline = firstRoom.players.map((player) => player.graceExpiresAt)
    expect(firstDeadline).toEqual([40_000, 40_000])
    await first.flushPersistence(source.room.id)

    const persisted = (await repository.loadActive()).find((snapshot) => snapshot.room.id === source.room.id)!
    expect(persisted.schemaVersion).toBe(4)
    expect(persisted.room.players.map((player) => player.graceExpiresAt)).toEqual(firstDeadline)
    first.dispose()

    const secondTime = new FakeTime(15_000)
    const second = new RoomService(repository, () => undefined, {
      clock: secondTime,
      scheduler: secondTime,
    })
    await second.restoreFromRepository()
    expect(second.getRoom(source.room.id)!.players.map((player) => player.graceExpiresAt)).toEqual(firstDeadline)
    expect(second.getRoom(source.room.id)!.players.every((player) => player.graceExpiresAt === 40_000)).toBe(true)
    second.dispose()

    const expiredTime = new FakeTime(40_000)
    const expired = new RoomService(repository, () => undefined, {
      clock: expiredTime,
      scheduler: expiredTime,
    })
    await expired.restoreFromRepository()
    expect(expired.getRoom(source.room.id)!.status).toBe('finished')
    expect(expired.getRoom(source.room.id)!.pendingDecision).toBeUndefined()
    expect(hasCardConservation(expired.getRoom(source.room.id)!.gameState!, 89)).toBe(true)
    expired.dispose()
  })

  it('persists terminal 2P abandonment without an active lifecycle deadline', async () => {
    const repository = new InMemoryRoomRepository()
    const time = new FakeTime(1_000)
    const service = new RoomService(repository, () => undefined, {
      clock: time,
      scheduler: time,
    })
    const { room, player: host } = service.createRoom('Ada')
    const { player: ben } = service.joinRoom(room.id, 'Ben')
    service.startRoom(room.id, host.id)
    service.markDisconnected(room.id, ben.id)
    time.advanceTo(31_000)
    await service.flushPersistence(room.id)

    const snapshot = repository.readRoom(room.id)!
    expect(snapshot.status).toBe('finished')
    expect(snapshot.players.every((player) => player.graceExpiresAt === undefined)).toBe(true)
    expect(snapshot.pendingDecision).toBeUndefined()
    expect(hasCardConservation(room.gameState!, 89)).toBe(true)
    expect((await repository.loadActive()).some((candidate) => candidate.room.id === room.id)).toBe(false)
    service.dispose()
  })

  it('serializes saves per room so an older async save cannot overwrite a newer one', async () => {
    class DelayedRepository implements RoomRepository {
      saved: PersistedRoomSnapshot[] = []
      async save(snapshot: PersistedRoomSnapshot): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 5))
        this.saved.push(structuredClone(snapshot))
      }
      async loadActive(): Promise<PersistedRoomSnapshot[]> {
        return []
      }
      async deleteRoom(): Promise<void> {}
    }
    const repository = new DelayedRepository()
    const service = new RoomService(repository, () => undefined)
    const { room } = service.createRoom('Ada')
    service.joinRoom(room.id, 'Ben')
    await service.flushPersistence(room.id)

    expect(repository.saved).toHaveLength(2)
    expect(repository.saved.at(-1)?.room.players).toHaveLength(2)
  })

  it('keeps the in-memory room live after a failed save and retries later mutations', async () => {
    class FlakyRepository implements RoomRepository {
      attempts = 0
      saved: PersistedRoomSnapshot[] = []

      async save(snapshot: PersistedRoomSnapshot): Promise<void> {
        this.attempts += 1
        if (this.attempts === 1) throw new Error('temporary persistence outage')
        this.saved.push(structuredClone(snapshot))
      }

      async loadActive(): Promise<PersistedRoomSnapshot[]> {
        return []
      }
      async deleteRoom(): Promise<void> {}
    }

    const repository = new FlakyRepository()
    const logError = vi.fn()
    const service = new RoomService(repository, logError)
    const { room } = service.createRoom('Ada')
    await service.flushPersistence(room.id)

    expect(service.getRoom(room.id)?.players).toHaveLength(1)
    expect(logError).toHaveBeenCalledWith(
      'Room persistence failed; the in-memory game remains active.',
    )

    service.joinRoom(room.id, 'Ben')
    await service.flushPersistence(room.id)

    expect(repository.saved).toHaveLength(1)
    expect(repository.saved[0].room.players).toHaveLength(2)
  })

  it('skips legacy snapshots rather than restoring playerId-only sessions', async () => {
    const repository: RoomRepository = {
      save: async () => undefined,
      deleteRoom: async () => undefined,
      loadActive: async () =>
        [
          {
            schemaVersion: 1,
            room: {
              id: 'LEGACY',
              hostPlayerId: 'legacy-player',
              players: [],
              status: 'lobby',
              gameLog: [],
            },
          },
        ] as unknown as PersistedRoomSnapshot[],
    }
    const logError = vi.fn()
    const service = new RoomService(repository, logError)

    await service.restoreFromRepository()

    expect(service.getRoom('LEGACY')).toBeUndefined()
    expect(logError).toHaveBeenCalledWith(
      'Skipped an unsupported persisted room snapshot.',
    )
  })
})
