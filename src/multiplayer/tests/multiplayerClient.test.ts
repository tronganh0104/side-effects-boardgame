import { afterEach, describe, expect, it, vi } from 'vitest'

type Listener = (...args: unknown[]) => void

const mock = vi.hoisted(() => {
  const listeners = new Map<string, Listener[]>()
  const emitted: Array<{ event: string; payload: unknown }> = []
  const socket = {
    id: 'socket-1',
    on: (event: string, listener: Listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
      return socket
    },
    emit: (event: string, payload?: unknown) => {
      emitted.push({ event, payload })
      return socket
    },
    connect: () => socket,
    disconnect: () => socket,
  }
  return {
    emitted,
    reset: () => {
      listeners.clear()
      emitted.length = 0
      socket.id = 'socket-1'
    },
    serverEmit: (event: string, ...args: unknown[]) =>
      (listeners.get(event) ?? []).forEach((listener) => listener(...args)),
    socket,
  }
})

vi.mock('socket.io-client', () => ({
  io: () => mock.socket,
}))

import {
  SESSION_KEY,
  createMultiplayerClient,
  getSavedSession,
  resolveMultiplayerServerUrl,
} from '../multiplayerClient'
import {
  exitFinishedLocalGame,
  exitFinishedOnlineGame,
  resetMultiplayerRoomUi,
} from '../recoveryCleanup'
import { useChatStore } from '../../store/chatStore'
import { useTradeStore } from '../../store/tradeStore'
import { useGameStore } from '../../store/gameStore'
import { useLocalTradeDriver } from '../../store/localTradeDriver'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

const savedSession = {
  roomId: 'ABC123',
  playerId: 'player-1',
  sessionToken: 'test-session-token',
}

describe('multiplayer client reconnect lifecycle', () => {
  let sessionStorage: MemoryStorage

  afterEach(() => {
    useGameStore.getState().resetGame()
    useLocalTradeDriver.getState().reset()
    useChatStore.getState().reset()
    useTradeStore.getState().reset()
    vi.unstubAllGlobals()
    mock.reset()
  })

  function installStorage(session = savedSession): void {
    sessionStorage = new MemoryStorage()
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    vi.stubGlobal('window', { sessionStorage })
  }

  it('uses the configured local backend URL and treats missing or blank configuration as localhost:3001', () => {
    expect(resolveMultiplayerServerUrl(' http://localhost:4100 ')).toBe('http://localhost:4100')
    expect(resolveMultiplayerServerUrl(undefined)).toBe('http://localhost:3001')
    expect(resolveMultiplayerServerUrl('   ')).toBe('http://localhost:3001')
  })

  it('emits one automatic resume with the saved credential per socket connection', () => {
    installStorage()
    createMultiplayerClient('http://example.test')

    mock.serverEmit('connect')
    mock.serverEmit('connect')

    expect(mock.emitted.filter((entry) => entry.event === 'session:resume')).toEqual([
      { event: 'session:resume', payload: savedSession },
    ])
  })

  it('does not emit resume when no saved room credential exists', () => {
    installStorage()
    sessionStorage.clear()
    createMultiplayerClient('http://example.test')

    mock.serverEmit('connect')

    expect(mock.emitted).not.toContainEqual(
      expect.objectContaining({ event: 'session:resume' }),
    )
  })

  it('looks up account recovery when no legacy room credential exists', () => {
    installStorage()
    sessionStorage.clear()
    const recoveries: unknown[] = []
    createMultiplayerClient('http://example.test', { onAccountRecovery: (recovery) => recoveries.push(recovery) })

    mock.serverEmit('connect')
    expect(mock.emitted).toContainEqual({ event: 'session:recover', payload: undefined })
    mock.serverEmit('session:recovery', { status: 'recoverable', roomId: 'ABC123', playerId: 'player-1', displayName: 'Ada' })
    expect(recoveries).toEqual([{ status: 'recoverable', roomId: 'ABC123', playerId: 'player-1', displayName: 'Ada' }])
  })

  it('keeps legacy resume preferred and only claims account recovery after an explicit action', () => {
    installStorage()
    const client = createMultiplayerClient('http://example.test')
    mock.serverEmit('connect')
    expect(mock.emitted.filter((entry) => entry.event === 'session:recover')).toEqual([])

    client.recoverAccountSession(true)
    expect(mock.emitted).toContainEqual({ event: 'session:recover:claim', payload: { takeover: true } })
  })

  it('clears the old room credential when another device replaces this socket', () => {
    installStorage()
    const replaced = vi.fn()
    createMultiplayerClient('http://example.test', { onSessionReplaced: replaced })

    mock.serverEmit('session:replaced')
    expect(getSavedSession()).toBeUndefined()
    expect(replaced).toHaveBeenCalledOnce()
  })

  it('allows exactly one fresh resume after a later disconnect and reconnect', () => {
    installStorage()
    createMultiplayerClient('http://example.test')

    mock.serverEmit('connect')
    mock.serverEmit('session:restored', savedSession)
    mock.serverEmit('disconnect', 'transport close')
    mock.socket.id = 'socket-2'
    mock.serverEmit('connect')
    mock.serverEmit('connect')

    expect(mock.emitted.filter((entry) => entry.event === 'session:resume')).toEqual([
      { event: 'session:resume', payload: savedSession },
      { event: 'session:resume', payload: savedSession },
    ])
  })

  it('cleans saved recovery data and notifies the owner after an authoritative resume rejection', () => {
    installStorage()
    const recoveryFailed = vi.fn()
    const states: string[] = []
    const errors: string[] = []
    createMultiplayerClient('http://example.test', {
      onRecoveryFailed: recoveryFailed,
      onConnectionState: (state) => states.push(state),
      onError: (message) => errors.push(message),
    })

    mock.serverEmit('connect')
    mock.serverEmit('game:error', 'Unable to restore session.')

    expect(getSavedSession()).toBeUndefined()
    expect(recoveryFailed).toHaveBeenCalledOnce()
    expect(states).toEqual(['resuming', 'failed'])
    expect(errors).toEqual([])
  })

  it('does not clear a restored session when a later non-resume error arrives', () => {
    installStorage()
    const recoveryFailed = vi.fn()
    createMultiplayerClient('http://example.test', { onRecoveryFailed: recoveryFailed })

    mock.serverEmit('connect')
    mock.serverEmit('session:restored', savedSession)
    mock.serverEmit('game:error', 'Only the current player may take this action.')

    expect(getSavedSession()).toEqual(savedSession)
    expect(recoveryFailed).not.toHaveBeenCalled()
  })

  it('resets room-owned UI data after recovery failure while leaving no stale trade or chat', () => {
    useChatStore.getState().append({
      id: 'message-1',
      kind: 'text',
      author: { playerId: 'player-1', displayName: 'Ada' },
      text: 'hello',
      sentAt: 1,
    })
    useTradeStore.getState().applyState({
      sessionId: 'trade-1',
      withPlayerId: 'player-2',
      yourRole: 'initiator',
      phase: 'open',
      yourCardId: 'card-1',
      theyPlaced: false,
      yourReady: false,
      theyReady: false,
    })
    const clears = {
      room: vi.fn(), game: vi.fn(), session: vi.fn(), gameLog: vi.fn(),
    }

    resetMultiplayerRoomUi({
      clearRoom: clears.room,
      clearGame: clears.game,
      clearSession: clears.session,
      clearGameLog: clears.gameLog,
    })

    expect(clears.room).toHaveBeenCalledOnce()
    expect(clears.game).toHaveBeenCalledOnce()
    expect(clears.session).toHaveBeenCalledOnce()
    expect(clears.gameLog).toHaveBeenCalledOnce()
    expect(useChatStore.getState().messages).toEqual([])
    expect(useTradeStore.getState().session).toBeNull()
  })

  it('exits a finished online game by clearing its credential and all room-owned UI before navigation', () => {
    installStorage()
    useChatStore.getState().append({
      id: 'message-finished', kind: 'text', author: { playerId: 'player-1', displayName: 'Ada' }, text: 'done', sentAt: 1,
    })
    useTradeStore.getState().applyState({
      sessionId: 'trade-finished', withPlayerId: 'player-2', phase: 'open', yourRole: 'initiator', yourCardId: 'card-1', theyPlaced: false, yourReady: false, theyReady: false,
    })
    const clears = {
      room: vi.fn(), game: vi.fn(), session: vi.fn(), gameLog: vi.fn(), back: vi.fn(),
    }

    exitFinishedOnlineGame({
      clearRoom: clears.room,
      clearGame: clears.game,
      clearSession: clears.session,
      clearGameLog: clears.gameLog,
    }, clears.back)

    expect(getSavedSession()).toBeUndefined()
    expect(clears.room).toHaveBeenCalledBefore(clears.back)
    expect(clears.game).toHaveBeenCalledBefore(clears.back)
    expect(clears.session).toHaveBeenCalledBefore(clears.back)
    expect(clears.gameLog).toHaveBeenCalledBefore(clears.back)
    expect(useChatStore.getState().messages).toEqual([])
    expect(useTradeStore.getState().session).toBeNull()

    createMultiplayerClient('http://example.test')
    mock.serverEmit('connect')
    expect(mock.emitted).not.toContainEqual(
      expect.objectContaining({ event: 'session:resume' }),
    )
  })

  it('exits a finished local game before returning to a fresh mode', () => {
    useGameStore.getState().createLocalGame(['Ada', 'Ben'])
    useGameStore.getState().forfeit()
    expect(useGameStore.getState().gameState?.status).toBe('finished')
    const back = vi.fn()

    exitFinishedLocalGame(
      useGameStore.getState().resetGame,
      useLocalTradeDriver.getState().reset,
      back,
    )

    expect(useGameStore.getState().gameState).toBeUndefined()
    expect(useGameStore.getState().pendingDecision).toBeUndefined()
    expect(useGameStore.getState().gameLog).toEqual([])
    expect(useTradeStore.getState().session).toBeNull()
    expect(back).toHaveBeenCalledOnce()
  })
})
