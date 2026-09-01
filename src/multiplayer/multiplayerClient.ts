import { io, type Socket } from 'socket.io-client'
import type { ChatMessage } from '../../server/chat/types'
import type { GameCommand } from '../../server/game/commands'
import type { PlayerGameView } from '../../server/game/playerView'
import type { TradeClosedPayload, TradeStatePayload } from '../game/trade/types'
import { useTradeStore } from '../store/tradeStore'

export const SESSION_KEY = 'side-effect.room-session'
export const DEFAULT_MULTIPLAYER_SERVER_URL = 'http://localhost:3001'

export function resolveMultiplayerServerUrl(configuredUrl?: string): string {
  return configuredUrl?.trim() || DEFAULT_MULTIPLAYER_SERVER_URL
}

export const multiplayerServerUrl = resolveMultiplayerServerUrl(
  import.meta.env.VITE_MULTIPLAYER_SERVER_URL,
)

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'resuming'
  | 'failed'
  | 'unavailable'

export interface RoomView {
  id: string
  hostPlayerId: string
  status: 'lobby' | 'playing' | 'finished'
  players: { id: string; displayName: string; connected: boolean; graceExpiresAt?: number }[]
}

export interface MultiplayerSession {
  roomId: string
  playerId: string
  sessionToken: string
}

export interface MultiplayerClientHandlers {
  onRoomState?: (room: RoomView) => void
  onGameState?: (game: PlayerGameView) => void
  onError?: (message: string) => void
  onSessionRestored?: (session: MultiplayerSession) => void
  onGameLog?: (entries: string[]) => void
  onConnectionState?: (state: ConnectionState) => void
  onRoomLeft?: () => void
  onRecoveryFailed?: () => void
  onChatMessage?: (message: ChatMessage) => void
}

function logReconnectDiagnostic(message: string): void {
  if (import.meta.env.DEV) console.info(`[multiplayer] ${message}`)
}

function storage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.sessionStorage
}

export function getSavedSession(): MultiplayerSession | undefined {
  const raw = storage()?.getItem(SESSION_KEY)
  if (!raw) return undefined
  try {
    const session = JSON.parse(raw) as Partial<MultiplayerSession>
    if (
      typeof session.roomId !== 'string' ||
      typeof session.playerId !== 'string' ||
      typeof session.sessionToken !== 'string'
    )
      return undefined
    return session as MultiplayerSession
  } catch {
    return undefined
  }
}

export function saveSession(session: MultiplayerSession): void {
  storage()?.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSavedSession(): void {
  storage()?.removeItem(SESSION_KEY)
}

/** Thin transport adapter. The server remains the source of truth for all game state. */
export function createMultiplayerClient(
  url: string,
  handlers: MultiplayerClientHandlers = {},
  options: { autoResume?: boolean } = {},
) {
  const socket: Socket = io(url, { autoConnect: false })
  let resumePendingSocketId: string | undefined
  let resumeAttemptSocketId: string | undefined

  if (handlers.onRoomState) socket.on('room:state', handlers.onRoomState)
  if (handlers.onGameState) socket.on('game:state', handlers.onGameState)
  socket.on('game:error', (message: string) => {
    if (resumePendingSocketId === socket.id) {
      logReconnectDiagnostic('resume failed')
      clearSavedSession()
      resumePendingSocketId = undefined
      handlers.onRecoveryFailed?.()
      handlers.onConnectionState?.('failed')
      return
    }
    handlers.onError?.(message)
  })
  if (handlers.onGameLog) socket.on('game:log', handlers.onGameLog)
  if (handlers.onChatMessage) socket.on('chat:message', handlers.onChatMessage)
  socket.on('trade:state', (payload: TradeStatePayload) =>
    useTradeStore.getState().applyState(payload),
  )
  socket.on('trade:closed', (payload: TradeClosedPayload) =>
    useTradeStore.getState().applyClosed(payload),
  )
  socket.on('session:restored', (session: MultiplayerSession) => {
    saveSession(session)
    if (resumePendingSocketId === socket.id)
      logReconnectDiagnostic('resume restored')
    resumePendingSocketId = undefined
    handlers.onConnectionState?.('connected')
    handlers.onSessionRestored?.(session)
  })
  socket.on('room:left', () => {
    clearSavedSession()
    handlers.onRoomLeft?.()
  })
  socket.on('connect', () => {
    logReconnectDiagnostic('socket connected')
    const session = getSavedSession()
    if (!session || options.autoResume === false) {
      handlers.onConnectionState?.('connected')
      return
    }
    if (resumeAttemptSocketId === socket.id) return
    resumeAttemptSocketId = socket.id
    resumePendingSocketId = socket.id
    handlers.onConnectionState?.('resuming')
    logReconnectDiagnostic('resume attempt')
    socket.emit('session:resume', session)
  })
  socket.on('disconnect', (reason: string) => {
    logReconnectDiagnostic(`socket disconnected: ${reason}`)
    resumePendingSocketId = undefined
    resumeAttemptSocketId = undefined
    handlers.onConnectionState?.('reconnecting')
  })
  socket.on('connect_error', () => handlers.onConnectionState?.('unavailable'))

  return {
    connect: () => {
      handlers.onConnectionState?.('connecting')
      socket.connect()
    },
    disconnect: () => socket.disconnect(),
    createRoom: (displayName: string) => socket.emit('room:create', { displayName }),
    joinRoom: (roomId: string, displayName: string) =>
      socket.emit('room:join', {
        roomId: roomId.trim().toUpperCase(),
        displayName,
      }),
    startRoom: () => socket.emit('room:start'),
    leaveRoom: () => socket.emit('room:leave'),
    sendCommand: (command: GameCommand) => socket.emit('game:command', command),
    resolveDecision: (decisionId: string, choiceIds: string[]) =>
      socket.emit('game:decision', { decisionId, choiceIds }),
    sendChat: (text: string) => socket.emit('chat:send', { text }),
    inviteTrade: (targetPlayerId: string) =>
      socket.emit('trade:invite', { targetPlayerId }),
    acceptTrade: () => socket.emit('trade:accept'),
    declineTrade: () => socket.emit('trade:decline'),
    placeTradeCard: (cardInstanceId: string) =>
      socket.emit('trade:place', { cardInstanceId }),
    clearTradeCard: () => socket.emit('trade:clear'),
    confirmTrade: () => socket.emit('trade:confirm'),
    cancelTrade: () => socket.emit('trade:cancel'),
  }
}
