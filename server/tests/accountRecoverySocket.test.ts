import { afterEach, describe, expect, it } from 'vitest'
import { io as createClient, type Socket } from 'socket.io-client'
import { createGameServer } from '../app'

function once<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve))
}

describe('account recovery socket protocol', () => {
  const servers: ReturnType<typeof createGameServer>[] = []
  const clients: Socket[] = []

  afterEach(async () => {
    clients.splice(0).forEach((client) => client.disconnect())
    await Promise.all(servers.splice(0).map(({ httpServer, io }) => new Promise<void>((resolve) => {
      io.close(); httpServer.close(() => resolve())
    })))
  })

  async function connect(server: ReturnType<typeof createGameServer>, accessToken: string): Promise<Socket> {
    const address = server.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('No test port')
    const socket = createClient(`http://127.0.0.1:${address.port}`, { transports: ['websocket'], auth: { accessToken } })
    clients.push(socket)
    await once(socket, 'connect')
    return socket
  }

  it('recovers by verified account identity, rotates the room token, and makes the prior socket stale', async () => {
    const server = createGameServer(
      { port: 0, clientOrigins: ['http://localhost:5173'] },
      { authVerifier: { verify: async (token) => token === 'token-a' ? 'user-a' : 'user-b' } },
    )
    servers.push(server)
    await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve))
    const first = await connect(server, 'token-a')
    const created = once<{ roomId: string; playerId: string; sessionToken: string }>(first, 'session:restored')
    const ownerRoomState = once<unknown>(first, 'room:state')
    first.emit('room:create', { displayName: 'Ada', userId: 'user-b' })
    const original = await created
    expect(server.rooms.getRoom(original.roomId)?.players[0].userId).toBe('user-a')
    expect(JSON.stringify(await ownerRoomState)).not.toContain('user-a')

    const second = await connect(server, 'token-a')
    const available = once<{ status: string; playerId?: string }>(second, 'session:recovery')
    second.emit('session:recover')
    await expect(available).resolves.toMatchObject({ status: 'already-connected', playerId: original.playerId })

    const replaced = once<void>(first, 'session:replaced')
    const recovered = once<{ roomId: string; playerId: string; sessionToken: string }>(second, 'session:restored')
    second.emit('session:recover:claim', { takeover: true, userId: 'user-b' })
    const replacement = await recovered
    await replaced
    expect(replacement).toMatchObject({ roomId: original.roomId, playerId: original.playerId })
    expect(replacement.sessionToken).not.toBe(original.sessionToken)

    const stale = once<string>(first, 'game:error')
    first.emit('game:command', { type: 'draw' })
    await expect(stale).resolves.toContain('Join a room first')
    expect(JSON.stringify(server.rooms.getRoom(original.roomId))).not.toContain('token-a')
  })

  it('does not reveal or recover another authenticated account seat', async () => {
    const server = createGameServer(
      { port: 0, clientOrigins: ['http://localhost:5173'] },
      { authVerifier: { verify: async (token) => token === 'token-a' ? 'user-a' : 'user-b' } },
    )
    servers.push(server)
    await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve))
    const owner = await connect(server, 'token-a')
    const ownerCreated = once(owner, 'session:restored')
    owner.emit('room:create', { displayName: 'Ada' })
    const ownerSession = await ownerCreated
    const other = await connect(server, 'token-b')
    const denied = once<string>(other, 'game:error')
    other.emit('session:resume', ownerSession)
    await expect(denied).resolves.toBe('Unable to restore session.')
    const none = once<{ status: string }>(other, 'session:recovery')
    other.emit('session:recover')
    await expect(none).resolves.toEqual({ status: 'none' })
  })
})
