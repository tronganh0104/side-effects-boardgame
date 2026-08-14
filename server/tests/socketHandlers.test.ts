import { afterEach, describe, expect, it } from 'vitest'
import { io as createClient, type Socket } from 'socket.io-client'
import { createGameServer } from '../app'

function once<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve))
}

function waitForTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('socket command boundary', () => {
  const servers: ReturnType<typeof createGameServer>[] = []
  const clients: Socket[] = []

  afterEach(async () => {
    clients.splice(0).forEach((client) => client.disconnect())
    await Promise.all(
      servers.splice(0).map(
        ({ httpServer, io }) =>
          new Promise<void>((resolve) => {
            io.close()
            httpServer.close(() => resolve())
          }),
      ),
    )
  })

  async function connect(server: ReturnType<typeof createGameServer>): Promise<Socket> {
    const address = server.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('No test port')
    const client = createClient(`http://127.0.0.1:${address.port}`, {
      transports: ['websocket'],
    })
    clients.push(client)
    await once(client, 'connect')
    return client
  }

  it('rejects malformed payloads without dropping an otherwise usable socket', async () => {
    const server = createGameServer({
      port: 0,
      clientOrigins: ['http://localhost:5173'],
    })
    servers.push(server)
    await new Promise<void>((resolve) =>
      server.httpServer.listen(0, '127.0.0.1', resolve),
    )
    const client = await connect(server)

    const malformedError = once<string>(client, 'game:error')
    client.emit('room:create', null)
    await expect(malformedError).resolves.toContain('Invalid request payload')

    const restored = once<{
      roomId: string
      playerId: string
      sessionToken: string
    }>(
      client,
      'session:restored',
    )
    const roomState = once<unknown>(client, 'room:state')
    client.emit('room:create', { displayName: 'Ada' })
    const session = await restored
    expect(session).toEqual({
      roomId: expect.stringMatching(/^[A-Z0-9]{6}$/),
      playerId: expect.stringMatching(/^player-/),
      sessionToken: expect.any(String),
    })
    expect(JSON.stringify(await roomState)).not.toContain(session.sessionToken)
  })

  it('rejects a replaced socket and ignores its later disconnect', async () => {
    const server = createGameServer({
      port: 0,
      clientOrigins: ['http://localhost:5173'],
    })
    servers.push(server)
    await new Promise<void>((resolve) =>
      server.httpServer.listen(0, '127.0.0.1', resolve),
    )
    const original = await connect(server)
    const created = once<{
      roomId: string
      playerId: string
      sessionToken: string
    }>(
      original,
      'session:restored',
    )
    original.emit('room:create', { displayName: 'Ada' })
    const session = await created

    const replacement = await connect(server)
    const resumed = once<{
      roomId: string
      playerId: string
      sessionToken: string
    }>(
      replacement,
      'session:restored',
    )
    replacement.emit('session:resume', session)
    await resumed

    const staleError = once<string>(original, 'game:error')
    original.emit('game:command', { type: 'draw' })
    await expect(staleError).resolves.toContain('no longer active')

    original.disconnect()
    await waitForTick()
    expect(
      server.rooms.isActiveSocket(
        session.roomId,
        session.playerId,
        replacement.id,
      ),
    ).toBe(true)
  })

  it('does not let an invalid resume credential evict the active player', async () => {
    const server = createGameServer({
      port: 0,
      clientOrigins: ['http://localhost:5173'],
    })
    servers.push(server)
    await new Promise<void>((resolve) =>
      server.httpServer.listen(0, '127.0.0.1', resolve),
    )
    const legitimate = await connect(server)
    const created = once<{
      roomId: string
      playerId: string
      sessionToken: string
    }>(legitimate, 'session:restored')
    legitimate.emit('room:create', { displayName: 'Ada' })
    const session = await created

    const attacker = await connect(server)
    const denied = once<string>(attacker, 'game:error')
    attacker.emit('session:resume', { ...session, sessionToken: 'wrong-token' })
    await expect(denied).resolves.toBe('Unable to restore session.')
    expect(
      server.rooms.isActiveSocket(session.roomId, session.playerId, legitimate.id),
    ).toBe(true)
  })

  it('accepts active 2P leave and rejects active 3P leave', async () => {
    const server = createGameServer({ port: 0, clientOrigins: ['http://localhost:5173'] })
    servers.push(server)
    await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve))

    const ada = await connect(server)
    const adaSessionWait = once<{ roomId: string; playerId: string; sessionToken: string }>(ada, 'session:restored')
    ada.emit('room:create', { displayName: 'Ada' })
    const adaSession = await adaSessionWait
    const ben = await connect(server)
    const benSessionWait = once<{ roomId: string; playerId: string; sessionToken: string }>(ben, 'session:restored')
    ben.emit('room:join', { roomId: adaSession.roomId, displayName: 'Ben' })
    await benSessionWait
    ada.emit('room:start')
    await once(ada, 'game:state')
    await once(ben, 'game:state')
    const finished = once<{ status: string; players: unknown[] }>(ben, 'room:state')
    const left = once<void>(ada, 'room:left')
    ada.emit('room:leave')
    await left
    expect((await finished).status).toBe('finished')
    expect(server.rooms.getRoom(adaSession.roomId)?.gameState?.winnerPlayerId).toBe(
      server.rooms.getRoom(adaSession.roomId)?.players.find((player) => player.id !== adaSession.playerId)?.id,
    )

    const three = createGameServer({ port: 0, clientOrigins: ['http://localhost:5173'] })
    servers.push(three)
    await new Promise<void>((resolve) => three.httpServer.listen(0, '127.0.0.1', resolve))
    const first = await connect(three)
    const firstSessionWait = once<{ roomId: string; playerId: string; sessionToken: string }>(first, 'session:restored')
    first.emit('room:create', { displayName: 'A' })
    const firstSession = await firstSessionWait
    const extraSockets: Socket[] = []
    for (const name of ['B', 'C']) {
      const socket = await connect(three)
      extraSockets.push(socket)
      const sessionWait = once<unknown>(socket, 'session:restored')
      socket.emit('room:join', { roomId: firstSession.roomId, displayName: name })
      await sessionWait
    }
    const started = once(first, 'game:state')
    first.emit('room:start')
    await started
    const rejected = once<string>(first, 'game:error')
    first.emit('room:leave')
    await expect(rejected).resolves.toContain('not supported')
    expect(three.rooms.getRoom(firstSession.roomId)?.status).toBe('playing')
  })
})
