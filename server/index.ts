import 'dotenv/config'
import { createGameServer } from './app'
import { getServerConfig } from './config'

async function main(): Promise<void> {
  const config = getServerConfig()
  const { httpServer, restore } = createGameServer(config)
  await restore()
  httpServer.listen(config.port, () =>
    console.log(`Side Effects server listening on :${config.port}`),
  )
}

void main().catch(() => {
  console.error('Server startup failed.')
  process.exitCode = 1
})
