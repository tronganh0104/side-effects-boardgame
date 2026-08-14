import type { GameState } from '../../src/game/engine/types'
import type { GameCommand } from '../game/commands'

export interface RoomPlayer {
  id: string
  /** Verified Supabase subject. Never projected in room or game views. */
  userId?: string
  displayName: string
  connected: boolean
  socketId?: string
  graceExpiresAt?: number
}

export interface Room {
  id: string
  hostPlayerId: string
  players: RoomPlayer[]
  gameState?: GameState
  status: 'lobby' | 'playing' | 'finished'
  pendingDecision?: PendingDecision
  gameLog: string[]
  /** SHA-256 hashes only. Raw bearer tokens never enter the room state. */
  sessionTokenHashes: Record<string, string>
}

interface PendingDecisionBase {
  id: string
  chooserPlayerId: string
  command: Extract<GameCommand, { type: 'playEpisode' }>
  choiceMap: Record<string, string>
}

export type PendingDecision =
  | (PendingDecisionBase & { kind: 'anxiety'; expiresAt?: never })
  | (PendingDecisionBase & { kind: 'tremors'; expiresAt: number })
