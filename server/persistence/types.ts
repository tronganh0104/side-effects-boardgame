import type { Room } from '../rooms/types'

export const ROOM_SNAPSHOT_SCHEMA_VERSION = 4

export interface PersistedRoomSnapshot {
  schemaVersion: number
  room: Omit<Room, 'players'> & {
    players: Array<Omit<Room['players'][number], 'socketId'>>
  }
}

export interface RoomRepository {
  save(snapshot: PersistedRoomSnapshot): Promise<void>
  deleteRoom(roomId: string): Promise<void>
  loadActive(): Promise<PersistedRoomSnapshot[]>
}
