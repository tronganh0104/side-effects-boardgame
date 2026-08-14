import type { Socket } from 'socket.io'
import type { AccessTokenVerifier } from './supabaseTokenVerifier'

export interface AuthenticatedSocketData {
  authUserId?: string
}

export function createSocketAuthMiddleware(verifier?: AccessTokenVerifier) {
  return async (
    socket: Socket,
    next: (error?: Error) => void,
  ): Promise<void> => {
    const accessToken = socket.handshake.auth?.accessToken
    if (accessToken === undefined) {
      ;(socket.data as AuthenticatedSocketData).authUserId = undefined
      next()
      return
    }
    if (typeof accessToken !== 'string' || !accessToken || !verifier) {
      next(new Error('Authentication failed.'))
      return
    }
    try {
      ;(socket.data as AuthenticatedSocketData).authUserId =
        await verifier.verify(accessToken)
      next()
    } catch {
      next(new Error('Authentication failed.'))
    }
  }
}
