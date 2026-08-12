import type { GameCommand } from '../game/commands'

/**
 * Card id a given game command would play or discard, for the command types
 * that can target a card currently sitting face-down in a trade slot (spec
 * `docs/superpowers/specs/2026-08-11-trading-design.md` section 6.1).
 * Returns undefined for commands that never reference a single hand card
 * (`draw`, `forfeit`, `endTurn`, `tradeCards`), so callers can skip the lock
 * check for those without a special case.
 */
export function lockableCardId(command: GameCommand): string | undefined {
  switch (command.type) {
    case 'playDrug':
      return command.drugCardId
    case 'playDisorder':
      return command.disorderCardId
    case 'playEpisode':
      return command.episodeCardId
    case 'playTherapy':
      return command.therapyCardId
    case 'discard':
    case 'discardManual':
      return command.cardInstanceId
    default:
      return undefined
  }
}
