import type { TradeSessionView } from '../../store/tradeStore'

export type TradeHandClickAction = 'clear' | 'place' | 'select'

/**
 * Decides what a click on a real hand card should do while a trade session
 * may be open. This is the entire scope boundary between "trade placement
 * mode" and GameBoard's normal card-selection mode, so normal play is
 * provably unaffected outside it:
 *
 * - No session, or a session that isn't `open` yet (still `pending`) → the
 *   click always falls through to normal selection.
 * - Session `open` and this card is the one already offered → clicking it
 *   again takes it back out (`clear`), regardless of anything else.
 * - Session `open`, nothing offered yet → any hand card click places it
 *   (`place`) instead of selecting it for play.
 * - Session `open` and a *different* card is already offered → trading has
 *   nothing left to intercept, so play continues normally (`select`); the
 *   only way back to the trade slot is clicking the offered card itself,
 *   the branch above.
 */
export function resolveTradeHandClick(
  session: TradeSessionView | null,
  cardInstanceId: string,
): TradeHandClickAction {
  if (session?.phase === 'open') {
    if (session.yourCardId === cardInstanceId) return 'clear'
    if (!session.yourCardId) return 'place'
  }
  return 'select'
}

/** True while the viewer has an open session but hasn't offered a card yet —
 *  the window in which every hand click places instead of selects. */
export function isAwaitingTradeCard(session: TradeSessionView | null): boolean {
  return session?.phase === 'open' && !session.yourCardId
}
