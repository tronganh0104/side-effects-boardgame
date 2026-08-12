export const TRADE_INVITE_EXPIRY_MS = 45_000

export type TradePhase = 'pending' | 'open'

export type TradeRole = 'initiator' | 'partner'

export type TradeCloseReason =
  | 'committed'
  | 'declined'
  | 'cancelled'
  | 'expired'
  | 'disconnected'

/**
 * Ephemeral negotiation state for one card trade. This is never part of
 * `GameState`, never persisted: it lives only in server memory and
 * disappears when the turn ends, either side disconnects, or the trade
 * commits or is called off. `src/game/engine/trading.ts` (Block 1) is the
 * only thing that ever touches real game state.
 */
export interface TradeSession {
  id: string
  roomId: string
  initiatorPlayerId: string
  partnerPlayerId: string
  phase: TradePhase
  initiatorCardId?: string
  partnerCardId?: string
  initiatorReady: boolean
  partnerReady: boolean
  invitedAt: number
}

/**
 * What each side is told over the wire. `theyPlaced` is a boolean, never the
 * opponent's card id: face-down is enforced by this shape having no field
 * the opponent's card id could be assigned to, not by a redaction step a
 * future edit could forget. Same shape-not-strip principle as
 * `server/chat/chatGateway.ts:33-35` — trade does not import from there,
 * this is convergent structure, not a dependency.
 */
export interface TradeStatePayload {
  sessionId: string
  withPlayerId: string
  phase: TradePhase
  yourRole: TradeRole
  yourCardId: string | null
  theyPlaced: boolean
  yourReady: boolean
  theyReady: boolean
  expiresAt?: number
}

export interface TradeClosedPayload {
  reason: TradeCloseReason
}
