import { phaseName, t } from '../../i18n'
import type { PlayerState } from '../../game/engine/types'
import type { PlayerView } from '../../../server/game/playerView'

type BoardPlayer = PlayerState | PlayerView

interface SelfStatusPanelProps {
  player: BoardPlayer
  isViewerTurn: boolean
  currentPlayerName: string
  phase: 'draw' | 'play' | 'discard'
  cardsPlayedThisTurn: number
  turnNumber: number
}

export function SelfStatusPanel({
  player,
  isViewerTurn,
  currentPlayerName,
  phase,
  cardsPlayedThisTurn,
  turnNumber,
}: SelfStatusPanelProps) {
  const handCount = 'handCount' in player ? player.handCount : player.hand.length
  const effects = player.effects

  const episodeEffects = [
    { key: 'skipTurns', icon: '🚫', label: t('skipTurn'), count: effects.skipTurns },
    { key: 'cannotPlayTurns', icon: '🔒', label: t('cannotPlay'), count: effects.cannotPlayTurns },
    { key: 'skipDrawTurns', icon: '🛑', label: t('cannotDraw'), count: effects.skipDrawTurns },
  ].filter((effect) => effect.count > 0)

  return (
    <section className="sidebar-self">
      <h3 className="sidebar-heading">{t('yourInfo')}</h3>
      <header className="self-head">
        <span className="self-avatar">{player.name.slice(0, 1).toUpperCase()}</span>
        <div className="self-identity">
          <strong>{player.name}</strong>
          <small>{t('hand')}: {handCount}</small>
        </div>
      </header>

      <div className={`self-turn ${isViewerTurn ? 'is-active' : 'is-idle'}`}>
        <strong className="self-turn-label">
          {isViewerTurn ? t('yourTurn') : t('waitingFor', { player: currentPlayerName })}
        </strong>
        <span className="self-turn-meta">
          {phaseName(phase)} ·{' '}
          <span className="self-turn-meta-unit">
            {cardsPlayedThisTurn}/2 thẻ
          </span>{' '}
          · <span className="self-turn-meta-unit">{t('turn')} {turnNumber}</span>
        </span>
      </div>

      <div className="self-episodes">
        <h3 className="sidebar-heading">{t('activeEpisodes')}</h3>
        {episodeEffects.length > 0 ? (
          <ul className="episode-effects">
            {episodeEffects.map((effect) => (
              <li key={effect.key} className="episode-effect">
                <span className="episode-effect-icon">{effect.icon}</span>
                <span className="episode-effect-name">{effect.label}</span>
                <span className="episode-effect-count">×{effect.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="episode-empty">{t('noActiveEpisodes')}</p>
        )}
      </div>
    </section>
  )
}
