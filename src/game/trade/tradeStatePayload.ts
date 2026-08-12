import { TRADE_INVITE_EXPIRY_MS } from './types'
import type { TradeSession, TradeStatePayload } from './types'

/**
 * Builds the per-recipient `trade:state` payload. The opponent's card id has
 * no field on `TradeStatePayload` it could be assigned to — `theyPlaced` is
 * derived into a boolean right here — so leaking it would require adding a
 * new field, not forgetting to strip one.
 */
export function toStatePayload(
  session: TradeSession,
  forPlayerId: string,
): TradeStatePayload {
  const isInitiator = session.initiatorPlayerId === forPlayerId
  const yourCardId = isInitiator ? session.initiatorCardId : session.partnerCardId
  const theirCardId = isInitiator ? session.partnerCardId : session.initiatorCardId
  const payload: TradeStatePayload = {
    sessionId: session.id,
    withPlayerId: isInitiator ? session.partnerPlayerId : session.initiatorPlayerId,
    phase: session.phase,
    yourRole: isInitiator ? 'initiator' : 'partner',
    yourCardId: yourCardId ?? null,
    theyPlaced: theirCardId !== undefined,
    yourReady: isInitiator ? session.initiatorReady : session.partnerReady,
    theyReady: isInitiator ? session.partnerReady : session.initiatorReady,
  }
  if (session.phase === 'pending')
    payload.expiresAt = session.invitedAt + TRADE_INVITE_EXPIRY_MS
  return payload
}
