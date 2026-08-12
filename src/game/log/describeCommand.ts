import type { GameCommand } from '../../../server/game/commands'
import { cardName, disorderName, t } from '../../i18n'
import type { GameState, PlayerState } from '../engine/types'

/**
 * Emphasis convention: log lines travel through the app as plain `string[]`
 * (over the socket protocol and into Supabase room snapshots), so they must
 * stay serialisable rather than being restructured into rich objects. To let
 * a player scan "who did what with which card" at a glance, values worth
 * highlighting — card names, disorder names, the targeted player's name —
 * are wrapped in a cheap `**…**` marker. `GameLogList` (src/components/GameLogList.tsx)
 * is the only consumer that interprets these markers, rendering the spans as
 * `<strong>`; every other consumer just sees plain text with asterisks.
 */

/** Marks a span for bold rendering. See the emphasis note at the top of this file. */
const em = (value: string) => `**${value}**`

/** Resolves the current player's public display name, or a generic fallback. */
function actorName(state: GameState): string {
  return (
    state.players.find((player) => player.id === state.currentPlayerId)
      ?.name ?? t('unknownPlayer')
  )
}

/** Resolves any player's public display name, or a generic fallback. */
function playerName(state: GameState, playerId: string): string {
  return (
    state.players.find((player) => player.id === playerId)?.name ??
    t('unknownPlayer')
  )
}

/** Names a card that is (or was, before this command) in the given player's hand. */
function handCardName(
  player: PlayerState | undefined,
  instanceId: string,
): string {
  const card = player?.hand.find(
    (candidate) => candidate.instanceId === instanceId,
  )
  return card ? cardName(card.definitionId, card.displayName) : t('aCard')
}

/** Names a Disorder sitting in the given player's Psyche (public information). */
function psycheDisorderName(
  player: PlayerState | undefined,
  instanceId: string,
): string {
  const slot = player?.psyche.slots.find(
    (candidate) => candidate.disorder.instanceId === instanceId,
  )
  return slot ? disorderName(slot.disorder.definitionId) : t('aDisorder')
}

/**
 * Turns a validated gameplay command into a detailed, public-safe log line.
 * Shared by the local game store and the multiplayer server so both surfaces
 * report identical, non-leaking detail. `before` resolves every name (cards
 * have already moved by the time `after` exists); `after` is only used for
 * the drawn-card count, which is reported as a count only — never by name.
 */
export function describeCommand(
  before: GameState,
  command: GameCommand,
  after: GameState,
): string {
  const actorPlayerName = actorName(before)
  const actor = before.players.find(
    (candidate) => candidate.id === before.currentPlayerId,
  )

  switch (command.type) {
    case 'draw': {
      const count =
        after.turn.cardsDrawnThisTurn - before.turn.cardsDrawnThisTurn
      return t('logDrew', { player: actorPlayerName, count })
    }
    case 'forfeit':
      return t('logForfeit', { player: actorPlayerName })
    case 'playDrug':
      return t('logDrug', {
        player: actorPlayerName,
        drug: em(handCardName(actor, command.drugCardId)),
        disorder: em(psycheDisorderName(actor, command.disorderCardId)),
      })
    case 'playDisorder':
      return t('logDisorder', {
        player: actorPlayerName,
        disorder: em(handCardName(actor, command.disorderCardId)),
        target: em(playerName(before, command.targetPlayerId)),
      })
    case 'playEpisode': {
      const target = before.players.find(
        (candidate) => candidate.id === command.targetPlayerId,
      )
      return t('logEpisode', {
        player: actorPlayerName,
        card: em(handCardName(actor, command.episodeCardId)),
        disorder: em(psycheDisorderName(target, command.targetDisorderCardId)),
        target: em(target?.name ?? t('unknownPlayer')),
      })
    }
    case 'playTherapy':
      return t('logTherapy', {
        player: actorPlayerName,
        card: em(handCardName(actor, command.therapyCardId)),
        disorder: em(psycheDisorderName(actor, command.disorderCardId)),
      })
    case 'discard':
      return t('logDiscard', {
        player: actorPlayerName,
        card: em(handCardName(actor, command.cardInstanceId)),
      })
    case 'discardManual':
      return t('logDiscardManual', {
        player: actorPlayerName,
        card: em(handCardName(actor, command.cardInstanceId)),
      })
    case 'endTurn':
      return t('logEndTurn', { player: actorPlayerName })
    case 'tradeCards':
      return t('logTrade', {
        player: em(playerName(before, command.initiatorPlayerId)),
        target: em(playerName(before, command.partnerPlayerId)),
      })
  }
}
