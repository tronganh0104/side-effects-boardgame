import type { PlayerState } from '../../game/engine/types'
import type { PlayerView } from '../../../server/game/playerView'
import { CardInfoPanel } from './CardInfoPanel'
import { SelfStatusPanel } from './SelfStatusPanel'
import { StatusBar } from './StatusBar'

type BoardPlayer = PlayerState | PlayerView

interface PlayerSidebarProps {
  player: BoardPlayer
  isViewerTurn: boolean
  currentPlayerName: string
  phase: 'draw' | 'play' | 'discard'
  cardsPlayedThisTurn: number
  turnNumber: number
  /** gameLog is no longer rendered here — it moves to the 📜 GameLogDrawer
   *  (still accessible via the toolbar button) and the chat timeline
   *  (system messages). Kept in props to avoid a cascade of callers changing
   *  at once; remove it in a follow-up cleanup after the PR lands. */
  gameLog?: string[]
}

export function PlayerSidebar({
  player,
  isViewerTurn,
  currentPlayerName,
  phase,
  cardsPlayedThisTurn,
  turnNumber,
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
      {/* Đề xuất 2: StatusBar replaces the old "Nhật ký ván chơi" section.
          Game log is still available via the 📜 drawer button in the toolbar,
          and log lines now also appear inline in the chat timeline as system
          messages (Đề xuất 3). */}
      <StatusBar player={player} />
    </aside>
  )
}
