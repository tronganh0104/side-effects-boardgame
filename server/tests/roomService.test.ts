import { describe, expect, it } from 'vitest'
import { hasCardConservation } from '../../src/game/engine/invariants'
import { createPlayerView } from '../game/playerView'
import { RoomService, type Clock, type TimeoutScheduler } from '../rooms/roomService'

class FakeTime implements Clock, TimeoutScheduler {
  private readonly timers = new Map<number, { callback: () => void; dueAt: number }>()
  private readonly callbacks = new Map<number, () => void>()
  private nextId = 1

  constructor(public value = 1_000) {}
  now(): number { return this.value }
  set(callback: () => void, delayMs: number): number {
    const id = this.nextId++
    this.timers.set(id, { callback, dueAt: this.value + delayMs })
    this.callbacks.set(id, callback)
    return id
  }
  clear(handle: unknown): void { this.timers.delete(handle as number) }
  get lastScheduledHandle(): number { return this.nextId - 1 }
  runStale(handle: number): void { this.callbacks.get(handle)?.() }
  advanceTo(value: number): void {
    this.value = value
    while (true) {
      const due = [...this.timers.entries()].find(([, timer]) => timer.dueAt <= this.value)
      if (!due) return
      this.timers.delete(due[0])
      due[1].callback()
    }
  }
}

function startedRoom() {
  const service = new RoomService()
  const { room, player: host, session: hostSession } = service.createRoom('Ada')
  const { player: ben, session: benSession } = service.joinRoom(room.id, 'Ben')
  return {
    service,
    room: service.startRoom(room.id, host.id),
    host,
    ben,
    hostSession,
    benSession,
  }
}

describe('authoritative rooms', () => {
  it('creates a 30-second active two-player grace and forfeits off-turn abandonment', () => {
    const time = new FakeTime(10_000)
    const service = new RoomService(undefined, () => undefined, { clock: time, scheduler: time })
    const { room, player: host } = service.createRoom('Ada')
    const { player: ben } = service.joinRoom(room.id, 'Ben')
    service.startRoom(room.id, host.id)
    const currentGame = room.gameState!
    const offTurnId = currentGame.players.find((player) => player.id !== currentGame.currentPlayerId)!.id

    service.markDisconnected(room.id, offTurnId, undefined)
    expect(room.players.find((player) => player.id === offTurnId)).toMatchObject({
      connected: false,
      graceExpiresAt: 40_000,
    })
    expect(room.gameState).toBe(currentGame)

    time.advanceTo(39_999)
    expect(room.status).toBe('playing')
    time.advanceTo(40_000)
    expect(room.status).toBe('finished')
    expect(room.gameState?.winnerPlayerId).toBe(currentGame.players.find((player) => player.id !== offTurnId)?.id)
    expect(room.gameState?.players.find((player) => player.id === ben.id)?.hand).toBeDefined()
  })

  it('does not revive an expired deadline and gives a fresh deadline after reconnect', () => {
    const time = new FakeTime(1_000)
    const service = new RoomService(undefined, () => undefined, { clock: time, scheduler: time })
    const { room, player: host } = service.createRoom('Ada')
    const { player: ben, session: benSession } = service.joinRoom(room.id, 'Ben')
    service.startRoom(room.id, host.id)
    const exactState = room.gameState

    service.markDisconnected(room.id, ben.id)
    time.advanceTo(10_000)
    service.resumeSession(room.id, ben.id, benSession.sessionToken, 'replacement')
    expect(room.players.find((player) => player.id === ben.id)).toMatchObject({ connected: true })
    expect(room.players.find((player) => player.id === ben.id)?.graceExpiresAt).toBeUndefined()
    expect(room.gameState).toBe(exactState)

    service.markDisconnected(room.id, ben.id, 'replacement')
    expect(room.players.find((player) => player.id === ben.id)?.graceExpiresAt).toBe(40_000)
    time.advanceTo(40_000)
    expect(room.status).toBe('finished')
  })

  it('resolves abandonment before an exact-deadline resume can reactivate the seat', () => {
    const time = new FakeTime(1_000)
    const service = new RoomService(undefined, () => undefined, { clock: time, scheduler: time })
    const { room, player: host } = service.createRoom('Ada')
    const { player: ben, session: benSession } = service.joinRoom(room.id, 'Ben')
    service.startRoom(room.id, host.id)
    service.markDisconnected(room.id, ben.id)

    time.value = 31_000
    expect(() => service.resumeSession(room.id, ben.id, benSession.sessionToken, 'late-socket'))
      .toThrow('Unable to restore session')
    expect(room.status).toBe('finished')
    expect(room.gameState?.winnerPlayerId).toBe(host.id)
    expect(service.isActiveSocket(room.id, ben.id, 'late-socket')).toBe(false)
    expect(hasCardConservation(room.gameState!, 89)).toBe(true)
  })

  it('makes an invalidated grace callback harmless after reconnect and a second disconnect', () => {
    const time = new FakeTime(1_000)
    const service = new RoomService(undefined, () => undefined, { clock: time, scheduler: time })
    const { room, player: host } = service.createRoom('Ada')
    const { player: ben, session: benSession } = service.joinRoom(room.id, 'Ben')
    service.startRoom(room.id, host.id)

    service.markDisconnected(room.id, ben.id)
    const oldTimer = time.lastScheduledHandle
    time.value = 10_000
    service.resumeSession(room.id, ben.id, benSession.sessionToken, 'replacement')
    service.markDisconnected(room.id, ben.id, 'replacement')

    expect(room.players.find((player) => player.id === ben.id)?.graceExpiresAt).toBe(40_000)
    time.value = 31_000
    time.runStale(oldTimer)
    expect(room.status).toBe('playing')
    expect(room.players.find((player) => player.id === ben.id)?.graceExpiresAt).toBe(40_000)
    expect(hasCardConservation(room.gameState!, 89)).toBe(true)

    time.advanceTo(40_000)
    expect(room.status).toBe('finished')
    expect(room.gameState?.winnerPlayerId).toBe(host.id)
    expect(hasCardConservation(room.gameState!, 89)).toBe(true)
  })

  it('supports immediate authenticated active two-player leave', () => {
    const service = new RoomService()
    const { room, player: host } = service.createRoom('Ada')
    const { player: ben } = service.joinRoom(room.id, 'Ben')
    service.startRoom(room.id, host.id)

    service.leaveRoom(room.id, ben.id)
    expect(room.status).toBe('finished')
    expect(room.gameState?.winnerPlayerId).toBe(host.id)
    expect(room.players.find((player) => player.id === ben.id)?.graceExpiresAt).toBeUndefined()
  })
  it('creates a room and joins distinct players', () => {
    const service = new RoomService()
    const { room, player, session: hostSession } = service.createRoom('Ada')
    const joined = service.joinRoom(room.id, 'Ben')

    expect(joined.room.hostPlayerId).toBe(player.id)
    expect(joined.room.players.map((candidate) => candidate.displayName)).toEqual([
      'Ada',
      'Ben',
    ])
    expect(room.id).toMatch(/^[A-Z0-9]{6}$/)
    expect(hostSession.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(joined.session.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(joined.session.sessionToken).not.toBe(hostSession.sessionToken)
    expect(JSON.stringify(room)).not.toContain(hostSession.sessionToken)
  })

  it('assigns unique short room codes', () => {
    const service = new RoomService()
    const first = service.createRoom('Ada').room
    const second = service.createRoom('Ben').room

    expect(first.id).not.toBe(second.id)
  })

  it('rejects invalid and duplicate joins', () => {
    const service = new RoomService()
    const { room } = service.createRoom('Ada')

    expect(() => service.joinRoom(room.id, '')).toThrow(
      'Display name',
    )
    service.joinRoom(room.id, 'Ben')
    expect(() => service.joinRoom(room.id, 'Ben')).toThrow('unique')
    expect(() => service.joinRoom('MISSING', 'Cam')).toThrow(
      'Room not found',
    )
  })

  it('keeps disconnected players in their slot and restores the same player on resume', () => {
    const { service, room, host, ben, benSession } = startedRoom()
    const afterDisconnect = service.markDisconnected(room.id, ben.id)

    expect(afterDisconnect.players).toHaveLength(2)
    expect(
      afterDisconnect.players.find((player) => player.id === ben.id)
        ?.connected,
    ).toBe(false)
    expect(() =>
      service.executeCommand(room.id, ben.id, { type: 'draw' }),
    ).toThrow('Disconnected')

    const restored = service.resumeSession(
      room.id,
      ben.id,
      benSession.sessionToken,
      'new-socket',
    )
    expect(restored.players).toHaveLength(2)
    expect(
      restored.players.find((player) => player.id === ben.id),
    ).toMatchObject({ connected: true, socketId: 'new-socket' })
    expect(restored.gameState).toBe(room.gameState)
    expect(restored.hostPlayerId).toBe(host.id)
  })

  it('ignores a stale socket disconnect after the player has reconnected', () => {
    const { service, room, ben, benSession } = startedRoom()
    service.resumeSession(
      room.id,
      ben.id,
      benSession.sessionToken,
      'replacement-socket',
    )

    const afterStaleDisconnect = service.markDisconnected(
      room.id,
      ben.id,
      'old-socket',
    )

    expect(
      afterStaleDisconnect.players.find((player) => player.id === ben.id),
    ).toMatchObject({ connected: true, socketId: 'replacement-socket' })
    expect(
      service.isActiveSocket(room.id, ben.id, 'replacement-socket'),
    ).toBe(true)
    expect(service.isActiveSocket(room.id, ben.id, 'old-socket')).toBe(false)
  })

  it('requires the matching bearer token without evicting a legitimate socket', () => {
    const { service, room, host, ben, hostSession, benSession } = startedRoom()
    service.resumeSession(
      room.id,
      host.id,
      hostSession.sessionToken,
      'legitimate-socket',
    )
    const beforeAttempt = structuredClone(room.players)

    expect(() =>
      service.resumeSession(
        room.id,
        host.id,
        'wrong-token',
        'attacker-socket',
      ),
    ).toThrow('Unable to restore session')
    expect(room.players).toEqual(beforeAttempt)
    expect(service.isActiveSocket(room.id, host.id, 'legitimate-socket')).toBe(
      true,
    )

    expect(() =>
      service.resumeSession(
        room.id,
        host.id,
        benSession.sessionToken,
        'attacker-socket',
      ),
    ).toThrow('Unable to restore session')
    expect(room.players).toEqual(beforeAttempt)

    service.resumeSession(
      room.id,
      host.id,
      hostSession.sessionToken,
      'replacement-socket',
    )
    expect(service.isActiveSocket(room.id, host.id, 'replacement-socket')).toBe(
      true,
    )
    expect(service.isActiveSocket(room.id, host.id, 'old-socket')).toBe(false)
    expect(ben.id).not.toBe(host.id)
  })

  it('does not confuse credentials across rooms', () => {
    const service = new RoomService()
    const first = service.createRoom('Ada')
    const second = service.createRoom('Ben')

    expect(() =>
      service.resumeSession(
        first.room.id,
        second.player.id,
        second.session.sessionToken,
        'cross-room-socket',
      ),
    ).toThrow('Unable to restore session')
    expect(
      service.isActiveSocket(first.room.id, first.player.id, 'cross-room-socket'),
    ).toBe(false)
  })

  it('allows only the host to start a valid player-count room', () => {
    const service = new RoomService()
    const { room, player: host } = service.createRoom('Ada')
    expect(() => service.startRoom(room.id, host.id)).toThrow('At least two')
    const { player: ben } = service.joinRoom(room.id, 'Ben')
    expect(() => service.startRoom(room.id, ben.id)).toThrow('Only the host')

    const started = service.startRoom(room.id, host.id)
    expect(started.status).toBe('playing')
    expect(started.gameState?.players.map((player) => player.id)).toEqual([
      host.id,
      ben.id,
    ])
  })

  it('does not allow the host to start while a lobby player is disconnected', () => {
    const service = new RoomService()
    const { room, player: host } = service.createRoom('Ada')
    const { player: ben } = service.joinRoom(room.id, 'Ben')
    service.markDisconnected(room.id, ben.id)

    expect(() => service.startRoom(room.id, host.id)).toThrow(
      'All players must be connected',
    )
  })

  it('validates commands through the authoritative engine without mutating on error', () => {
    const { service, room } = startedRoom()
    const game = room.gameState!
    const beforeInvalid = structuredClone(game)
    const nonCurrent = game.players.find(
      (player) => player.id !== game.currentPlayerId,
    )!

    expect(() =>
      service.executeCommand(room.id, nonCurrent.id, { type: 'draw' }),
    ).toThrow('current player')
    expect(room.gameState).toEqual(beforeInvalid)

    const result = service.executeCommand(room.id, game.currentPlayerId, {
      type: 'draw',
    })
    expect(result.turn.phase).toBe('play')
    expect(
      result.players.find((player) => player.id === game.currentPlayerId)?.hand,
    ).toHaveLength(6)
  })

  it('validates manual discard authoritatively and consumes one action', () => {
    const { service, room } = startedRoom()
    const game = room.gameState!
    const afterDraw = service.executeCommand(room.id, game.currentPlayerId, {
      type: 'draw',
    })
    const card = afterDraw.players[afterDraw.currentPlayerIndex].hand[0]

    const afterDiscard = service.executeCommand(room.id, afterDraw.currentPlayerId, {
      type: 'discardManual',
      cardInstanceId: card.instanceId,
    })
    expect(afterDiscard.turn.cardsPlayedThisTurn).toBe(1)
    expect(afterDiscard.discardPile).toContainEqual(card)

    const beforeInvalid = structuredClone(afterDiscard)
    expect(() =>
      service.executeCommand(room.id, afterDraw.currentPlayerId, {
        type: 'discardManual',
        cardInstanceId: card.instanceId,
      }),
    ).toThrow('not in the current player hand')
    expect(room.gameState).toEqual(beforeInvalid)
  })

  it('rejects duplicate or stale commands without changing the authoritative game', () => {
    const { service, room } = startedRoom()
    const currentPlayerId = room.gameState!.currentPlayerId
    service.executeCommand(room.id, currentPlayerId, { type: 'draw' })
    const afterDraw = structuredClone(room.gameState)

    expect(() =>
      service.executeCommand(room.id, currentPlayerId, { type: 'draw' }),
    ).toThrow('draw phase')
    expect(room.gameState).toEqual(afterDraw)
    expect(room.gameLog).toHaveLength(2)
  })

  it('waits for a disconnected current player without allowing another player to act', () => {
    const { service, room, hostSession, benSession } = startedRoom()
    const currentPlayerId = room.gameState!.currentPlayerId
    const otherPlayerId = room.gameState!.players.find(
      (player) => player.id !== currentPlayerId,
    )!.id
    service.markDisconnected(room.id, currentPlayerId)
    const beforeAttempt = structuredClone(room.gameState)

    expect(() =>
      service.executeCommand(room.id, otherPlayerId, { type: 'draw' }),
    ).toThrow('current player')
    expect(room.gameState).toEqual(beforeAttempt)

    service.resumeSession(
      room.id,
      currentPlayerId,
      hostSession.playerId === currentPlayerId
        ? hostSession.sessionToken
        : benSession.sessionToken,
      'returning-socket',
    )
    expect(
      service.executeCommand(room.id, currentPlayerId, { type: 'draw' }).turn
        .phase,
    ).toBe('play')
  })

  it('projects private hands differently for each viewer while sharing public state', () => {
    const { service, room, benSession } = startedRoom()
    const game = room.gameState!
    const firstPlayer = game.players[0]
    const secondPlayer = game.players[1]
    const firstView = createPlayerView(game, firstPlayer.id)
    const secondView = createPlayerView(game, secondPlayer.id)
    const firstSelf = firstView.players.find(
      (player) => player.id === firstPlayer.id,
    )!
    const firstOpponent = firstView.players.find(
      (player) => player.id === secondPlayer.id,
    )!
    const secondSelf = secondView.players.find(
      (player) => player.id === secondPlayer.id,
    )!

    expect(firstSelf.hand).toHaveLength(firstPlayer.hand.length)
    expect(firstOpponent.hand).toBeUndefined()
    expect(firstOpponent.handCount).toBe(secondPlayer.hand.length)
    expect(secondSelf.hand).toHaveLength(secondPlayer.hand.length)
    expect(firstView.currentPlayerId).toBe(secondView.currentPlayerId)
    expect(firstView.players.map((player) => player.psyche)).toEqual(
      secondView.players.map((player) => player.psyche),
    )

    const reconnectedRoom = service.resumeSession(
      room.id,
      secondPlayer.id,
      benSession.sessionToken,
      'second-new-socket',
    )
    const afterReconnectView = createPlayerView(
      reconnectedRoom.gameState!,
      firstPlayer.id,
    )
    expect(
      afterReconnectView.players.find((player) => player.id === secondPlayer.id)
        ?.hand,
    ).toBeUndefined()
  })

  it('does not leak Anxiety pending hand choices to non-choosers', () => {
    const { room } = startedRoom()
    const game = room.gameState!
    const attacker = game.players[game.currentPlayerIndex]
    const target = game.players.find((player) => player.id !== attacker.id)!
    const pending = {
      id: 'decision-1',
      kind: 'anxiety' as const,
      chooserPlayerId: attacker.id,
      command: {
        type: 'playEpisode' as const,
        episodeCardId: 'episode-01',
        targetPlayerId: target.id,
        targetDisorderCardId: target.psyche.slots[0].disorder.instanceId,
      },
      choiceMap: Object.fromEntries(
        target.hand.map((card, index) => [
          `choice-${index + 1}`,
          card.instanceId,
        ]),
      ),
    }

    const attackerView = createPlayerView(game, attacker.id, pending)
    const targetView = createPlayerView(game, target.id, pending)
    expect(
      attackerView.pendingDecision?.choices?.map((choice) => choice.label),
    ).toEqual(target.hand.map((_, index) => `Lá bài ${index + 1}`))
    expect(targetView.pendingDecision?.choices).toBeUndefined()
    expect(JSON.stringify(attackerView.pendingDecision)).not.toContain(
      target.hand[0].instanceId,
    )
  })

  it('does not let a disconnected pending chooser resolve an Episode', () => {
    const { service, room } = startedRoom()
    const game = room.gameState!
    const attacker = game.players[game.currentPlayerIndex]
    const target = game.players.find((player) => player.id !== attacker.id)!
    room.pendingDecision = {
      id: 'decision-disconnected',
      kind: 'anxiety',
      chooserPlayerId: attacker.id,
      command: {
        type: 'playEpisode',
        episodeCardId: 'episode-01',
        targetPlayerId: target.id,
        targetDisorderCardId: target.psyche.slots[0].disorder.instanceId,
      },
      choiceMap: { 'choice-1': target.hand[0].instanceId },
    }
    service.markDisconnected(room.id, attacker.id)

    expect(() =>
      service.resolveDecision(
        room.id,
        attacker.id,
        'decision-disconnected',
        ['choice-1'],
      ),
    ).toThrow('Disconnected')
    expect(room.pendingDecision?.id).toBe('decision-disconnected')
  })
})
