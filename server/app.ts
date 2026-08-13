import { createServer } from 'node:http'
import { Server } from 'socket.io'
import type { ServerConfig } from './config'
import { InMemoryRoomRepository } from './persistence/inMemoryRoomRepository'
import { SupabaseRoomRepository } from './persistence/supabaseRoomRepository'
import { RoomService } from './rooms/roomService'
import { registerSocketHandlers } from './socket/registerSocketHandlers'

export function createGameServer(config: ServerConfig) {
  const httpServer = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ status: 'ok' }))
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'Not found' }))
  })
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientOrigins,
      methods: ['GET', 'POST'],
    },
  })
  const repository = config.supabase
    ? new SupabaseRoomRepository(config.supabase)
    : new InMemoryRoomRepository()
  const rooms = new RoomService(repository)
  registerSocketHandlers(io, rooms)
  httpServer.on('close', () => rooms.dispose())
  return {
    httpServer,
    io,
    rooms,
    restore: () => rooms.restoreFromRepository(),
  }
}
