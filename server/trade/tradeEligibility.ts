import type { Room } from '../rooms/types'

/**
 * Rules from spec section 9, checked once at `trade:invite` time. Pure and
 * socket-free like the rest of this file, so the gateway only has to call
 * it, not re-derive it.
 */
export function assertRoomCanTrade(room: Room): void {
  if (!room.gameState || room.status !== 'playing')
    throw new Error('Chỉ có thể trao đổi khi ván đang diễn ra.')
  if (room.gameState.turn.phase === 'draw')
    throw new Error('Chưa thể trao đổi trước khi rút bài trong lượt này.')
  if (room.pendingDecision)
    throw new Error('Phải xử lý quyết định đang chờ trước khi trao đổi.')
}
