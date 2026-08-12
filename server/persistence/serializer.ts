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
      })),
    },
  }
}

export function deserializeRoom(snapshot: PersistedRoomSnapshot): Room {
  if (snapshot.schemaVersion !== ROOM_SNAPSHOT_SCHEMA_VERSION)
    throw new Error(`Unsupported room snapshot schema: ${snapshot.schemaVersion}`)
  const room = snapshot.room
  if (
    !room.id ||
    !room.hostPlayerId ||
    !Array.isArray(room.players) ||
    !room.sessionTokenHashes
  )
    throw new Error('Invalid room snapshot.')
  return {
    ...room,
    players: room.players.map((player) => ({
      ...player,
      connected: false,
      socketId: undefined,
    })),
    gameState: room.gameState
      ? {
          ...room.gameState,
          players: room.gameState.players.map((player) => ({
            ...player,
            // Rows persisted before trading was added lack this field.
            tradeUsedThisTurn: player.tradeUsedThisTurn ?? false,
          })),
        }
      : room.gameState,
  }
}
