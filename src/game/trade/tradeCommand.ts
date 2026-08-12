import type { TradeSession } from './types'

export interface TradeCardsCommand {
  type: 'tradeCards'
  initiatorPlayerId: string
  initiatorCardId: string
  partnerPlayerId: string
  partnerCardId: string
}

/**
 * Builds the `tradeCards` command straight from server-side session state.
 * Both player ids and both card ids come from `session`, which is only ever
 * populated from `activeSession().playerId` and validated payload fields —
 * never from a client-supplied id — so this can never carry a forged actor.
 *
 * Returns a standalone shape rather than `GameCommand` (defined in
 * `server/game/commands.ts`): this file is shared by both `src/` (local
 * play) and `server/` (multiplayer), so it must never import from
 * `server/`. This shape is structurally identical to
 * `Extract<GameCommand, { type: 'tradeCards' }>`, so it satisfies
 * `GameCommand` everywhere a real one is expected.
 */
export function toTradeCommand(session: TradeSession): TradeCardsCommand {
  return {
    type: 'tradeCards',
    initiatorPlayerId: session.initiatorPlayerId,
    initiatorCardId: session.initiatorCardId!,
    partnerPlayerId: session.partnerPlayerId,
    partnerCardId: session.partnerCardId!,
  }
}
