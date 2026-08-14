import { createRemoteJWKSet, jwtVerify } from 'jose'

export interface AccessTokenVerifier {
  verify(accessToken: string): Promise<string>
}

export function createSupabaseTokenVerifier(supabaseUrl: string): AccessTokenVerifier {
  const issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`
  const keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
  return {
    async verify(accessToken: string): Promise<string> {
      const { payload } = await jwtVerify(accessToken, keys, {
        issuer,
        audience: 'authenticated',
      })
      if (typeof payload.sub !== 'string' || !payload.sub)
        throw new Error('Invalid authentication token.')
      return payload.sub
    },
  }
}
