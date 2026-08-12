import { TRADE_INVITE_EXPIRY_MS } from './types'
import type { TradeRole, TradeSession } from './types'

export interface TradeConfirmResult {
  session: TradeSession
  bothReady: boolean
}

export interface TradeSessionStore {
  invite(
    roomId: string,
    initiatorPlayerId: string,
    partnerPlayerId: string,
  ): TradeSession
  accept(sessionId: string, actingPlayerId: string): TradeSession
  decline(sessionId: string, actingPlayerId: string): TradeSession
  cancel(sessionId: string, actingPlayerId: string): TradeSession
  place(
    sessionId: string,
    actingPlayerId: string,
    cardInstanceId: string,
  ): TradeSession
  clear(sessionId: string, actingPlayerId: string): TradeSession
  confirm(sessionId: string, actingPlayerId: string): TradeConfirmResult
  getById(sessionId: string): TradeSession | undefined
  getByPlayer(playerId: string): TradeSession | undefined
  isBusy(playerId: string): boolean
  /** Closes every `pending` invite older than 45s and returns the closed sessions. */
  sweepExpired(): TradeSession[]
  closeSession(sessionId: string): TradeSession | undefined
  closeForPlayer(playerId: string): TradeSession | undefined
  closeAllInRoom(roomId: string): TradeSession[]
}

/**
 * Pure, socket-free negotiation state machine. Invariant: a playerId is a
 * key in `playerSessionIds` for at most one session at a time, from the
 * moment an invite is sent (not just once accepted) until the session
 * closes — that is what makes "invite someone already busy" rejectable.
 */
export function createTradeSessionStore(deps: {
  now: () => number
  createId?: () => string
}): TradeSessionStore {
  const now = deps.now
  const createId =
    deps.createId ?? (() => `trade-${Math.random().toString(36).slice(2)}`)

  const sessions = new Map<string, TradeSession>()
  const playerSessionIds = new Map<string, string>()

  const requireSession = (sessionId: string): TradeSession => {
    const session = sessions.get(sessionId)
    if (!session) throw new Error('Phiên trao đổi không tồn tại.')
    return session
  }

  const roleOf = (session: TradeSession, playerId: string): TradeRole => {
    if (session.initiatorPlayerId === playerId) return 'initiator'
    if (session.partnerPlayerId === playerId) return 'partner'
    throw new Error('Bạn không tham gia phiên trao đổi này.')
  }

  const requireOpen = (sessionId: string, actingPlayerId: string): TradeSession => {
    const session = requireSession(sessionId)
    roleOf(session, actingPlayerId)
    if (session.phase !== 'open') throw new Error('Phiên trao đổi chưa mở.')
    return session
  }

  const close = (sessionId: string): TradeSession => {
    const session = requireSession(sessionId)
    sessions.delete(sessionId)
    playerSessionIds.delete(session.initiatorPlayerId)
    playerSessionIds.delete(session.partnerPlayerId)
    return session
  }

  return {
    invite(roomId, initiatorPlayerId, partnerPlayerId) {
      if (initiatorPlayerId === partnerPlayerId)
        throw new Error('Không thể tự mời chính mình trao đổi.')
      if (
        playerSessionIds.has(initiatorPlayerId) ||
        playerSessionIds.has(partnerPlayerId)
      )
        throw new Error('Người chơi này đang bận.')

      const session: TradeSession = {
        id: createId(),
        roomId,
        initiatorPlayerId,
        partnerPlayerId,
        phase: 'pending',
        initiatorReady: false,
        partnerReady: false,
        invitedAt: now(),
      }
      sessions.set(session.id, session)
      playerSessionIds.set(initiatorPlayerId, session.id)
      playerSessionIds.set(partnerPlayerId, session.id)
      return session
    },

    accept(sessionId, actingPlayerId) {
      const session = requireSession(sessionId)
      if (roleOf(session, actingPlayerId) !== 'partner')
        throw new Error('Chỉ người được mời mới có thể đồng ý.')
      if (session.phase !== 'pending')
        throw new Error('Lời mời không còn hiệu lực.')
      const updated: TradeSession = { ...session, phase: 'open' }
      sessions.set(sessionId, updated)
      return updated
    },

    decline(sessionId, actingPlayerId) {
      const session = requireSession(sessionId)
      if (roleOf(session, actingPlayerId) !== 'partner')
        throw new Error('Chỉ người được mời mới có thể từ chối.')
      if (session.phase !== 'pending')
        throw new Error('Lời mời không còn hiệu lực.')
      return close(sessionId)
    },

    cancel(sessionId, actingPlayerId) {
      const session = requireSession(sessionId)
      roleOf(session, actingPlayerId)
      return close(sessionId)
    },

    place(sessionId, actingPlayerId, cardInstanceId) {
      const session = requireOpen(sessionId, actingPlayerId)
      const role = roleOf(session, actingPlayerId)
      const updated: TradeSession = {
        ...session,
        initiatorCardId:
          role === 'initiator' ? cardInstanceId : session.initiatorCardId,
        partnerCardId: role === 'partner' ? cardInstanceId : session.partnerCardId,
        // Any place clears both ready flags (spec 6.2): a card swapped under
        // someone who already confirmed must not silently stay "agreed".
        initiatorReady: false,
        partnerReady: false,
      }
      sessions.set(sessionId, updated)
      return updated
    },

    clear(sessionId, actingPlayerId) {
      const session = requireOpen(sessionId, actingPlayerId)
      const role = roleOf(session, actingPlayerId)
      const updated: TradeSession = {
        ...session,
        initiatorCardId: role === 'initiator' ? undefined : session.initiatorCardId,
        partnerCardId: role === 'partner' ? undefined : session.partnerCardId,
        initiatorReady: false,
        partnerReady: false,
      }
      sessions.set(sessionId, updated)
      return updated
    },

    confirm(sessionId, actingPlayerId) {
      const session = requireOpen(sessionId, actingPlayerId)
      const role = roleOf(session, actingPlayerId)
      const ownCardId =
        role === 'initiator' ? session.initiatorCardId : session.partnerCardId
      if (!ownCardId) throw new Error('Hãy đặt một lá bài trước khi trao đổi.')
      const updated: TradeSession = {
        ...session,
        initiatorReady: role === 'initiator' ? true : session.initiatorReady,
        partnerReady: role === 'partner' ? true : session.partnerReady,
      }
      sessions.set(sessionId, updated)
      return {
        session: updated,
        bothReady: updated.initiatorReady && updated.partnerReady,
      }
    },

    getById(sessionId) {
      return sessions.get(sessionId)
    },

    getByPlayer(playerId) {
      const sessionId = playerSessionIds.get(playerId)
      return sessionId ? sessions.get(sessionId) : undefined
    },

    isBusy(playerId) {
      return playerSessionIds.has(playerId)
    },

    sweepExpired() {
      const cutoff = now() - TRADE_INVITE_EXPIRY_MS
      const expiredIds = Array.from(sessions.values())
        .filter((session) => session.phase === 'pending' && session.invitedAt <= cutoff)
        .map((session) => session.id)
      return expiredIds.map((id) => close(id))
    },

    closeSession(sessionId) {
      return sessions.has(sessionId) ? close(sessionId) : undefined
    },

    closeForPlayer(playerId) {
      const sessionId = playerSessionIds.get(playerId)
      return sessionId ? close(sessionId) : undefined
    },

    closeAllInRoom(roomId) {
      const ids = Array.from(sessions.values())
        .filter((session) => session.roomId === roomId)
        .map((session) => session.id)
      return ids.map((id) => close(id))
    },
  }
}
