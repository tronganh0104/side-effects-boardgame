import { t } from '../i18n'
import { GameLogList } from './GameLogList'

interface GameLogDrawerProps {
  gameLog: string[]
  showLog: boolean
  setShowLog: (show: boolean) => void
}

export function GameLogDrawer({ gameLog, showLog, setShowLog }: GameLogDrawerProps) {
  if (!showLog) return null

  return (
    <section className="game-log-drawer panel" role="dialog" aria-modal="false">
      <header>
        <h2>{t('gameLog')}</h2>
        <button type="button" onClick={() => setShowLog(false)}>{t('close')}</button>
      </header>
      <GameLogList entries={gameLog} limit={10} />
    </section>
  )
}
