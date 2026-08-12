import type { RandomSource } from '../../game/engine/random'
import type { ChatAuthor } from '../../../server/chat/types'

/** Anything with an id and a display name — a full PlayerState is one, so is the light `{id, name}` shape GameBoard passes in. */
export interface LocalChatPlayer {
  id: string
  name: string
}

/** Pure and deterministic: the caller injects `rng`, this never touches Math.random(). */
export function pickBotLine(lines: readonly string[], rng: RandomSource): string {
  if (lines.length === 0) return ''
  const index = Math.floor(rng.next() * lines.length)
  return lines[Math.min(index, lines.length - 1)]
}

/**
 * Picks a local player other than `excludeId` (the hot-seat player currently
 * "speaking" as themself) to author a bot line. Returns undefined for a
 * one-player local game — there is no one else at the table to fake as, and
 * the caller must not post anything in that case rather than crash.
 */
export function pickBotAuthor(
  players: readonly LocalChatPlayer[],
  excludeId: string,
  rng: RandomSource,
): ChatAuthor | undefined {
  const others = players.filter((player) => player.id !== excludeId)
  if (others.length === 0) return undefined

  const index = Math.floor(rng.next() * others.length)
  const chosen = others[Math.min(index, others.length - 1)]
  return { playerId: chosen.id, displayName: chosen.name }
}
