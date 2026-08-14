import { describe, expect, it, vi } from 'vitest'
import type { Socket } from 'socket.io'
import { createSocketAuthMiddleware } from '../auth/socketAuth'
import type { AccessTokenVerifier } from '../auth/supabaseTokenVerifier'

function socketWith(auth: unknown): Socket {
  return {
    handshake: { auth },
    data: {},
  } as unknown as Socket
}

describe('Socket.IO Auth middleware', () => {
  it('allows guests and ignores a forged userId payload', async () => {
    const socket = socketWith({ userId: 'victim-user-id' })
    const next = vi.fn()

    await createSocketAuthMiddleware()(socket, next)

    expect(next).toHaveBeenCalledWith()
    expect(socket.data.authUserId).toBeUndefined()
  })

  it('attaches only the user ID returned by verified token validation', async () => {
    const verifier: AccessTokenVerifier = { verify: vi.fn().mockResolvedValue('verified-user-id') }
    const socket = socketWith({ accessToken: 'valid-token', userId: 'victim-user-id' })
    const next = vi.fn()

    await createSocketAuthMiddleware(verifier)(socket, next)

    expect(verifier.verify).toHaveBeenCalledWith('valid-token')
    expect(socket.data.authUserId).toBe('verified-user-id')
    expect(next).toHaveBeenCalledWith()
  })

  it.each(['malformed-token', 'expired-token'])('rejects an invalid supplied token without identity leakage: %s', async (accessToken) => {
    const verifier: AccessTokenVerifier = { verify: vi.fn().mockRejectedValue(new Error('verification details')) }
    const socket = socketWith({ accessToken })
    const next = vi.fn()

    await createSocketAuthMiddleware(verifier)(socket, next)

    expect(socket.data.authUserId).toBeUndefined()
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Authentication failed.' }))
  })
})
