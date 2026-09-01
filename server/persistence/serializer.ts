import { ROOM_SNAPSHOT_SCHEMA_VERSION, type PersistedRoomSnapshot } from './types'
import type { Room } from '../rooms/types'

export function serializeRoom(room: Room): PersistedRoomSnapshot {
  return {
    schemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
    room: {
      ...room,
      players: room.players.map((player) => ({
        id: player.id,
        displayName: player.displayName,
        connected: player.connected,
        ...(player.graceExpiresAt !== undefined
          ? { graceExpiresAt: player.graceExpiresAt }
          : {}),
      })),
    },
  }
}

export function deserializeRoom(snapshot: PersistedRoomSnapshot): Room {
  if (![2, 3, 4, ROOM_SNAPSHOT_SCHEMA_VERSION].includes(snapshot.schemaVersion))
    throw new Error(`Unsupported room snapshot schema: ${snapshot.schemaVersion}`)
  const room = snapshot.room
  if (
    !room.id ||
    !room.hostPlayerId ||
    !Array.isArray(room.players) ||
    !room.sessionTokenHashes
  )
    throw new Error('Invalid room snapshot.')
  const pendingDecision = room.pendingDecision
  const migratedPendingDecision =
    snapshot.schemaVersion === 2 && pendingDecision?.kind === 'tremors'
      ? { ...pendingDecision, expiresAt: 0 }
      : pendingDecision
  if (
    snapshot.schemaVersion === ROOM_SNAPSHOT_SCHEMA_VERSION &&
    migratedPendingDecision?.kind === 'tremors' &&
    !Number.isFinite(migratedPendingDecision.expiresAt)
  )
    throw new Error('Invalid Tremors deadline in room snapshot.')
  return {
    ...room,
    pendingDecision: migratedPendingDecision,
    players: room.players.map((player) => ({
      ...player,
      connected: false,
      socketId: undefined,
    })),
    gameState: room.gameState
      ? {
          ...room.gameState,
          players: room.gameState.players.map((player) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { tradeUsedThisTurn: _dropped, ...rest } = player as typeof player & { tradeUsedThisTurn?: unknown }
            return rest
          }),
        }
      : room.gameState,
  }
}