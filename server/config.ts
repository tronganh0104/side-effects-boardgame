export interface ServerConfig {
  port: number
  clientOrigins: string[]
  supabase?: { url: string; secretKey: string }
}

const developmentClientOrigin = 'http://localhost:5173'

export function getServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 3001)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be a valid TCP port.')

  const clientOrigins = (env.CLIENT_ORIGIN ?? developmentClientOrigin)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  if (clientOrigins.length === 0)
    throw new Error('CLIENT_ORIGIN must contain at least one origin.')

  const url = env.SUPABASE_URL
  const secretKey = env.SUPABASE_SECRET_KEY
  const persistenceEnabled = env.SUPABASE_ROOM_PERSISTENCE === 'true'
  if (persistenceEnabled && Boolean(url) !== Boolean(secretKey))
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set together.')

  return {
    port,
    clientOrigins,
    ...(persistenceEnabled && url && secretKey ? { supabase: { url, secretKey } } : {}),
  }
}
