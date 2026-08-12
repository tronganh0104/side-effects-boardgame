import { t } from '../../i18n'
import type { PlayerState } from '../../game/engine/types'
import type { PlayerView } from '../../../server/game/playerView'
import { CardInfoPanel } from './CardInfoPanel'
import { SelfStatusPanel } from './SelfStatusPanel'
import { GameLogList } from '../GameLogList'

type BoardPlayer = PlayerState | PlayerView

interface PlayerSidebarProps {
  player: BoardPlayer
  isViewerTurn: boolean
  currentPlayerName: string
  phase: 'draw' | 'play' | 'discard'
  cardsPlayedThisTurn: number
  turnNumber: number
  gameLog: string[]
}

export function PlayerSidebar({
  player,
  isViewerTurn,
  currentPlayerName,
  phase,
  cardsPlayedThisTurn,
  turnNumber,
  gameLog,
}: PlayerSidebarProps) {
  return (
    <aside className="player-sidebar panel-surface panel-surface--framed">
      <CardInfoPanel />
      <SelfStatusPanel
        player={player}
        isViewerTurn={isViewerTurn}
        currentPlayerName={currentPlayerName}
        phase={phase}
        cardsPlayedThisTurn={cardsPlayedThisTurn}
        turnNumber={turnNumber}
      />
      <section className="sidebar-log">
        <h3 className="sidebar-heading">{t('gameLog')}</h3>
        <GameLogList entries={gameLog} />
      </section>
    </aside>
  )
}
