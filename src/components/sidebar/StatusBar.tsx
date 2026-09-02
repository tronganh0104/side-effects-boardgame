/**
 * StatusBar — Đề xuất 2: Thanh trạng thái
 *
 * Replaces the sidebar "Nhật ký ván chơi" section. Shows the active
 * turn-based effects that are currently constraining the viewer — the
 * things the player needs to know RIGHT NOW, not a history of what already
 * happened (that's the GameLogDrawer, still accessible via the 📜 button).
 *
 * Data comes purely from `player.effects` and `player.psyche`, which are
 * already in the game state the parent receives — no new server fields.
 *
 * Design decisions:
 * - Each active constraint gets one row: icon + human-readable sentence +
 *   source disorder in parens.
 * - Rows disappear automatically when the effect count hits zero.
 * - When no effects are active the bar shows a single "Bình thường" line
 *   so the section never looks broken or missing.
 * - The component is purely presentational; it never writes to any store.
 */

import type { PlayerState } from '../../game/engine/types'
import type { PlayerView } from '../../../server/game/playerView'
import { t } from '../../i18n'

type BoardPlayer = PlayerState | PlayerView

interface StatusBarProps {
  player: BoardPlayer
}

interface StatusRow {
  key: string
  icon: string
  /** Main sentence, e.g. "Lượt này: Không được rút bài" */
  label: string
  /** Disorder responsible, e.g. "Chán ăn tâm thần" */
  source: string
  /** Remaining lượt count — shown as "×N" when > 1 */
  remaining: number
}

function buildRows(player: BoardPlayer): StatusRow[] {
  const effects = player.effects
  const rows: StatusRow[] = []

  if (effects.skipTurns > 0) {
    rows.push({
      key: 'skipTurns',
      icon: '🚫',
      label: t('skipTurnStatus', { count: effects.skipTurns }),
      source: t('disorders.depression') ?? 'Trầm cảm',
      remaining: effects.skipTurns,
    })
  }

  if (effects.cannotPlayTurns > 0) {
    rows.push({
      key: 'cannotPlay',
      icon: '🔒',
      label: t('cannotPlayStatus', { count: effects.cannotPlayTurns }),
      source: t('disorders.impotence') ?? 'Rối loạn cương dương',
      remaining: effects.cannotPlayTurns,
    })
  }

  if (effects.skipDrawTurns > 0) {
    rows.push({
      key: 'skipDraw',
      icon: '🛑',
      label: t('skipDrawStatus', { count: effects.skipDrawTurns }),
      source: t('disorders.anorexia') ?? 'Chán ăn tâm thần',
      remaining: effects.skipDrawTurns,
    })
  }

  return rows
}

export function StatusBar({ player }: StatusBarProps) {
  const rows = buildRows(player)

  return (
    <section className="sidebar-status" aria-label="Trạng thái hiện tại">
      <h3 className="sidebar-heading">Trạng thái</h3>
      {rows.length === 0 ? (
        <p className="status-bar-normal">✓ Bình thường</p>
      ) : (
        <ul className="status-bar-list">
          {rows.map((row) => (
            <li key={row.key} className="status-bar-row">
              <span className="status-bar-icon" aria-hidden="true">{row.icon}</span>
              <span className="status-bar-label">
                {row.label}
                <span className="status-bar-source"> ({row.source})</span>
              </span>
              {row.remaining > 1 && (
                <span className="status-bar-remaining" aria-label={`còn ${row.remaining} lượt`}>
                  ×{row.remaining}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
