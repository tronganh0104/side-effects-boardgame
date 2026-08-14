import { describe, expect, it, vi } from 'vitest'
import type { CardInstance, DisorderDefinition, DisorderId } from '../../src/game/cards/types'
import { hasCardConservation } from '../../src/game/engine/invariants'
import { createPlayerView } from '../game/playerView'
import { InMemoryRoomRepository } from '../persistence/inMemoryRoomRepository'
import { serializeRoom } from '../persistence/serializer'
import type { PersistedRoomSnapshot, RoomRepository } from '../persistence/types'
import {
  RoomService,
  type Clock,
  type TimeoutScheduler,
} from '../rooms/roomService'

class FakeTime implements Clock, TimeoutScheduler {
  value: number
  private nextId = 1
  private readonly tasks = new Map<
    number,
    { callback: () => void; dueAt: number }
  >()

  constructor(value = 1_000) {
    this.value = value
  }

  now(): number {
    return this.value
  }

  set(callback: () => void, delayMs: number): number {
    const id = this.nextId++
    this.tasks.set(id, { callback, dueAt: this.value + delayMs })
    return id
  }

  clear(handle: unknown): void {
    this.tasks.delete(handle as number)
  }

  advanceTo(value: number): void {
    this.value = value
    while (true) {
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.dueAt <= this.value)
        .sort((left, right) => left[1].dueAt - right[1].dueAt)[0]
      if (!due) return
      this.tasks.delete(due[0])
      due[1].callback()
    }
  }

  get pendingCount(): number {
    return this.tasks.size
  }

  get nextDueAt(): number | undefined {
    return Math.min(...[...this.tasks.values()].map((task) => task.dueAt))
  }
}

function startedRoom(time = new FakeTime(), repository = new InMemoryRoomRepository()) {
  const service = new RoomService(repository, () => undefined, {
    clock: time,
    scheduler: time,
  })
  const { room, player: host, session: hostSession } = service.createRoom('Ada')
  const { session: benSession } = service.joinRoom(room.id, 'Ben')
  service.startRoom(room.id, host.id)
  return { service, repository, room, hostSession, benSession, time }
}

function arrangeEpisode(
  service: RoomService,
  roomId: string,
  disorderId: DisorderId,
) {
  const room = service.getRoom(roomId)!
  const game = room.gameState!
  const attacker = game.players[game.currentPlayerIndex]
  const target = game.players.find((player) => player.id !== attacker.id)!
  const episode = game.drawPile.find((card) => card.cardType === 'episode')!
  const disorder = game.drawPile.find(
    (card): card is CardInstance<DisorderDefinition> =>
      card.cardType === 'disorder' && card.definitionId === disorderId,
  )!
  const replacedHand = attacker.hand[0]
  const replacedDisorder = target.psyche.slots[0].disorder
  room.gameState = {
    ...game,
    turn: {
      ...game.turn,
      phase: 'play',
      cardsDrawnThisTurn: 2,
      cardsPlayedThisTurn: 0,
    },
    players: game.players.map((player) => {
      if (player.id === attacker.id)
        return { ...player, hand: [episode, ...player.hand.slice(1)] }
      if (player.id === target.id)
        return {
          ...player,
          psyche: {
            slots: [{ disorder }, ...player.psyche.slots.slice(1)],
          },
        }
      return player
    }),
    drawPile: [
      replacedHand,
      replacedDisorder,
      ...game.drawPile.filter(
        (card) =>
          card.instanceId !== episode.instanceId &&
          card.instanceId !== disorder.instanceId,
      ),
    ],
  }
  return { room, attacker, target, episode, disorder }
}

function beginDecision(
  service: RoomService,
  roomId: string,
  disorderId: 'tremors' | 'anxiety' = 'tremors',
) {
  const arranged = arrangeEpisode(service, roomId, disorderId)
  service.executeCommand(roomId, arranged.attacker.id, {
    type: 'playEpisode',
    episodeCardId: arranged.episode.instanceId,
    targetPlayerId: arranged.target.id,
    targetDisorderCardId: arranged.disorder.instanceId,
  })
  return arranged
}

describe('authoritative Tremors timeout', () => {
  it('cleans up a pending Anxiety when the chooser abandons during grace', () => {
    const state = startedRoom()
    const prepared = beginDecision(state.service, state.room.id, 'anxiety')
    const before = structuredClone(state.room.gameState!)
    const opponent = prepared.target.id

    state.service.markDisconnected(state.room.id, prepared.attacker.id)
    expect(state.room.pendingDecision?.kind).toBe('anxiety')
    const publicView = createPlayerView(state.room.gameState!, prepared.attacker.id, state.room.pendingDecision)
    expect(JSON.stringify(publicView.pendingDecision)).not.toContain(prepared.target.hand[0].instanceId)
    state.time.advanceTo(31_000)

    expect(state.room.status).toBe('finished')
    expect(state.room.gameState?.winnerPlayerId).toBe(opponent)
    expect(state.room.pendingDecision).toBeUndefined()
    expect(state.room.gameState).not.toEqual(before)
    expect(state.room.gameState?.players.find((player) => player.id === opponent)?.hand).toEqual(
      before.players.find((player) => player.id === opponent)?.hand,
    )
    expect(hasCardConservation(state.room.gameState!, 89)).toBe(true)
  })

  it('applies immediate 2P leave cleanup for a pending Anxiety chooser', () => {
    const state = startedRoom()
    const prepared = beginDecision(state.service, state.room.id, 'anxiety')

    state.service.leaveRoom(state.room.id, prepared.attacker.id)

    expect(state.room.status).toBe('finished')
    expect(state.room.gameState?.winnerPlayerId).toBe(prepared.target.id)
    expect(state.room.pendingDecision).toBeUndefined()
    expect(state.time.pendingCount).toBe(0)
    expect(hasCardConservation(state.room.gameState!, 89)).toBe(true)
  })

  it('resolves Tremors before explicit target leave and keeps the finished state stable', () => {
    const state = startedRoom()
    const prepared = beginDecision(state.service, state.room.id, 'tremors')
    const handBefore = prepared.target.hand.length

    state.service.leaveRoom(state.room.id, prepared.target.id)
    const afterLeave = structuredClone(state.room.gameState!)

    expect(state.room.status).toBe('finished')
    expect(state.room.gameState?.winnerPlayerId).toBe(prepared.attacker.id)
    expect(state.room.pendingDecision).toBeUndefined()
    expect(prepared.target.hand).toHaveLength(handBefore)
    expect(state.room.gameState?.players.find((player) => player.id === prepared.target.id)?.hand).toHaveLength(0)
    expect(state.time.pendingCount).toBe(0)
    expect(hasCardConservation(state.room.gameState!, 89)).toBe(true)

    state.time.advanceTo(10_000)
    expect(state.room.gameState).toEqual(afterLeave)
  })

  it('resolves Tremors at three seconds while disconnected grace remains active', () => {
    const state = startedRoom()
    const prepared = beginDecision(state.service, state.room.id, 'tremors')
    state.service.markDisconnected(state.room.id, prepared.target.id)
    const graceDeadline = state.room.players.find((player) => player.id === prepared.target.id)?.graceExpiresAt

    state.time.advanceTo(4_000)
    expect(state.room.status).toBe('playing')
    expect(state.room.pendingDecision).toBeUndefined()
    expect(state.room.gameState?.players.find((player) => player.id === prepared.target.id)?.hand).toHaveLength(0)
    expect(graceDeadline).toBe(31_000)
    expect(state.room.players.find((player) => player.id === prepared.target.id)?.graceExpiresAt).toBe(31_000)
    expect(hasCardConservation(state.room.gameState!, 89)).toBe(true)

    const targetSession = prepared.target.id === state.room.players[0].id ? state.hostSession : state.benSession
    state.service.resumeSession(state.room.id, prepared.target.id, targetSession.sessionToken, 'replacement')
    expect(state.room.status).toBe('playing')
    expect(state.room.players.find((player) => player.id === prepared.target.id)).toMatchObject({ connected: true })
    expect(hasCardConservation(state.room.gameState!, 89)).toBe(true)
  })
  it('creates one three-second deadline only for Tremors', () => {
    const tremors = startedRoom()
    const prepared = beginDecision(tremors.service, tremors.room.id)

    expect(tremors.room.pendingDecision).toMatchObject({
      kind: 'tremors',
      chooserPlayerId: prepared.target.id,
      expiresAt: 4_000,
    })
    expect(tremors.room.pendingDecision?.id).toMatch(/^decision-/)
    expect(Object.values(tremors.room.pendingDecision!.choiceMap)).toEqual(
      prepared.target.hand.map((card) => card.instanceId),
    )
    expect(tremors.time.pendingCount).toBe(1)

    const anxiety = startedRoom()
    beginDecision(anxiety.service, anxiety.room.id, 'anxiety')
    expect(anxiety.room.pendingDecision).toMatchObject({ kind: 'anxiety' })
    expect(anxiety.room.pendingDecision).not.toHaveProperty('expiresAt')
    expect(anxiety.time.pendingCount).toBe(0)
  })

  it('does not create a pending decision or timer when the target has fewer than three cards', () => {
    const state = startedRoom()
    const prepared = arrangeEpisode(state.service, state.room.id, 'tremors')
    const currentGame = state.room.gameState!
    const targetInGame = currentGame.players.find((player) => player.id === prepared.target.id)!
    const returnedCards = targetInGame.hand.slice(2)
    state.room.gameState = {
      ...currentGame,
      players: currentGame.players.map((player) =>
        player.id === targetInGame.id
          ? { ...player, hand: player.hand.slice(0, 2) }
          : player,
      ),
      drawPile: [...returnedCards, ...currentGame.drawPile],
    }

    state.service.executeCommand(state.room.id, prepared.attacker.id, {
      type: 'playEpisode',
      episodeCardId: prepared.episode.instanceId,
      targetPlayerId: prepared.target.id,
      targetDisorderCardId: prepared.disorder.instanceId,
    })

    expect(state.room.pendingDecision).toBeUndefined()
    expect(state.time.pendingCount).toBe(0)
    expect(state.room.gameState?.players.find((player) => player.id === prepared.target.id)?.hand)
      .toHaveLength(0)
    expect(hasCardConservation(state.room.gameState!, 89)).toBe(true)
  })

  it('clears pending timer handles when the service shuts down', () => {
    const state = startedRoom()
    beginDecision(state.service, state.room.id)
    expect(state.time.pendingCount).toBe(1)

    state.service.dispose()

    expect(state.time.pendingCount).toBe(0)
  })

  it('accepts a valid choice before the deadline and invalidates the old timer', () => {
    const { service, room, time } = startedRoom()
    const prepared = beginDecision(service, room.id)
    const decision = room.pendingDecision!
    const choiceIds = Object.keys(decision.choiceMap).slice(0, 3)

    time.value = 3_999
    const resolved = service.resolveDecision(
      room.id,
      prepared.target.id,
      decision.id,
      choiceIds,
    )
    const snapshot = structuredClone(resolved)
    expect(resolved.players.find((player) => player.id === prepared.target.id)?.hand)
      .toHaveLength(prepared.target.hand.length - 3)
    expect(resolved.turn.cardsPlayedThisTurn).toBe(1)
    expect(hasCardConservation(resolved, 89)).toBe(true)
    expect(time.pendingCount).toBe(0)

    time.advanceTo(4_001)
    expect(room.gameState).toEqual(snapshot)
  })

  it('resolves exactly once at the deadline and rejects the late selection', async () => {
    const { service, repository, room, time } = startedRoom()
    const prepared = beginDecision(service, room.id)
    const decision = room.pendingDecision!
    const choiceIds = Object.keys(decision.choiceMap).slice(0, 3)
    const mutation = vi.fn()
    service.onMutation(mutation)
    await service.flushPersistence(room.id)
    const savesBeforeTimeout = repository.saveCount

    time.advanceTo(4_000)
    const timedOut = room.gameState!
    expect(room.pendingDecision).toBeUndefined()
    expect(timedOut.players.find((player) => player.id === prepared.target.id)?.hand)
      .toHaveLength(0)
    expect(timedOut.discardPile).toContainEqual(prepared.episode)
    expect(timedOut.turn.cardsPlayedThisTurn).toBe(1)
    expect(hasCardConservation(timedOut, 89)).toBe(true)
    expect(mutation).toHaveBeenCalledTimes(1)
    expect(room.gameLog.at(-1)).toContain('không chọn kịp 3 lá')
    expect(room.gameLog.at(-1)).not.toContain(prepared.target.hand[0].displayName)
    await service.flushPersistence(room.id)
    expect(repository.saveCount).toBe(savesBeforeTimeout + 1)

    const afterTimeout = structuredClone(timedOut)
    expect(() =>
      service.resolveDecision(
        room.id,
        prepared.target.id,
        decision.id,
        choiceIds,
      ),
    ).toThrow('no pending decision')
    expect(room.gameState).toEqual(afterTimeout)
  })

  it('enforces now >= expiresAt even if the scheduled callback has not run', () => {
    const { service, room, time } = startedRoom()
    const prepared = beginDecision(service, room.id)
    const decision = room.pendingDecision!
    time.value = decision.kind === 'tremors' ? decision.expiresAt : 0

    expect(() =>
      service.resolveDecision(
        room.id,
        prepared.target.id,
        decision.id,
        Object.keys(decision.choiceMap).slice(0, 3),
      ),
    ).toThrow('expired')
    expect(room.pendingDecision).toBeUndefined()
    expect(room.gameState?.players.find((player) => player.id === prepared.target.id)?.hand)
      .toHaveLength(0)
    expect(hasCardConservation(room.gameState!, 89)).toBe(true)
  })

  it('keeps the same decision and deadline through disconnect and reconnect', () => {
    const { service, room, time, hostSession, benSession } = startedRoom()
    const prepared = beginDecision(service, room.id)
    const before = room.pendingDecision!
    time.value = 2_000
    service.markDisconnected(room.id, prepared.target.id)
    const session = prepared.target.id === hostSession.playerId ? hostSession : benSession
    service.resumeSession(
      room.id,
      prepared.target.id,
      session.sessionToken,
      'replacement-socket',
    )

    expect(room.pendingDecision).toEqual(before)
    expect(time.nextDueAt).toBe(4_000)
    const chooserView = createPlayerView(
      room.gameState!,
      prepared.target.id,
      room.pendingDecision,
    )
    const opponentView = createPlayerView(
      room.gameState!,
      prepared.attacker.id,
      room.pendingDecision,
    )
    expect(chooserView.pendingDecision?.expiresAt).toBe(4_000)
    expect(opponentView.pendingDecision?.expiresAt).toBe(4_000)
    expect(opponentView.pendingDecision?.choices).toBeUndefined()
    expect(JSON.stringify(opponentView)).not.toContain(prepared.target.hand[0].instanceId)
  })

  it('restores the original deadline and resolves immediately after an offline expiry', async () => {
    const firstTime = new FakeTime(1_000)
    const repository = new InMemoryRoomRepository()
    const first = startedRoom(firstTime, repository)
    const prepared = beginDecision(first.service, first.room.id)
    const decisionId = first.room.pendingDecision!.id
    await first.service.flushPersistence(first.room.id)
    first.service.dispose()

    const beforeDeadline = new FakeTime(2_000)
    const restored = new RoomService(repository, () => undefined, {
      clock: beforeDeadline,
      scheduler: beforeDeadline,
    })
    await restored.restoreFromRepository()
    expect(restored.getRoom(first.room.id)?.pendingDecision).toMatchObject({
      id: decisionId,
      expiresAt: 4_000,
    })
    expect(beforeDeadline.nextDueAt).toBe(4_000)
    restored.dispose()

    const afterDeadline = new FakeTime(5_000)
    const expiredRestore = new RoomService(repository, () => undefined, {
      clock: afterDeadline,
      scheduler: afterDeadline,
    })
    await expiredRestore.restoreFromRepository()
    const expiredRoom = expiredRestore.getRoom(first.room.id)!
    expect(expiredRoom.pendingDecision).toBeUndefined()
    expect(expiredRoom.gameState?.players.find((player) => player.id === prepared.target.id)?.hand)
      .toHaveLength(0)
    expect(hasCardConservation(expiredRoom.gameState!, 89)).toBe(true)
  })

  it('migrates a v2 Tremors pending decision as immediately expired', async () => {
    const source = startedRoom()
    const prepared = beginDecision(source.service, source.room.id)
    const snapshot = serializeRoom(source.room) as PersistedRoomSnapshot & {
      room: { pendingDecision?: { expiresAt?: number } }
    }
    snapshot.schemaVersion = 2
    delete snapshot.room.pendingDecision?.expiresAt
    const repository: RoomRepository = {
      save: async () => undefined,
      deleteRoom: async () => undefined,
      loadActive: async () => [snapshot as PersistedRoomSnapshot],
    }
    const restored = new RoomService(repository, () => undefined, {
      clock: new FakeTime(10_000),
      scheduler: new FakeTime(10_000),
    })

    await restored.restoreFromRepository()
    const room = restored.getRoom(source.room.id)!
    expect(room.pendingDecision).toBeUndefined()
    expect(room.gameState?.players.find((player) => player.id === prepared.target.id)?.hand)
      .toHaveLength(0)
    expect(hasCardConservation(room.gameState!, 89)).toBe(true)
  })
})