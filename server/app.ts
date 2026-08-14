import { createServer } from 'node:http'
import { Server } from 'socket.io'
import type { ServerConfig } from './config'
import { InMemoryRoomRepository } from './persistence/inMemoryRoomRepository'
import { SupabaseRoomRepository } from './persistence/supabaseRoomRepository'
import { RoomService } from './rooms/roomService'
import { registerSocketHandlers } from './socket/registerSocketHandlers'
import {
  createSupabaseTokenVerifier,
  type AccessTokenVerifier,
} from './auth/supabaseTokenVerifier'

export function createGameServer(
  config: ServerConfig,
  dependencies: { authVerifier?: AccessTokenVerifier } = {},
) {
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
  registerSocketHandlers(
    io,
    rooms,
    dependencies.authVerifier ??
      (config.supabaseAuthUrl
        ? createSupabaseTokenVerifier(config.supabaseAuthUrl)
        : undefined),
  )
  httpServer.on('close', () => rooms.dispose())
  return {
    httpServer,
    io,
    rooms,
    restore: () => rooms.restoreFromRepository(),
  }
}
