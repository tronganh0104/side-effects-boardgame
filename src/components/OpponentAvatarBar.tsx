import { t } from '../i18n'
import type { PlayerState } from '../game/engine/types'
import type { PlayerView } from '../../server/game/playerView'

type BoardPlayer = PlayerState | PlayerView

interface OpponentAvatarBarProps {
  opponents: BoardPlayer[]
  focusedOpponentId?: string
  setFocusedOpponentId: (id: string) => void
  targetPlayerId?: string
  currentPlayerId: string
}

export function OpponentAvatarBar({
  opponents,
  focusedOpponentId,
  setFocusedOpponentId,
  targetPlayerId,
  currentPlayerId,
}: OpponentAvatarBarProps) {
  return (
    <section className="opponent-avatar-bar">
      {opponents.map((opponent) => {
        const isFocused = opponent.id === focusedOpponentId
        const isTargeted = opponent.id === targetPlayerId
        const effects = opponent.effects

        return (
          <button
            key={opponent.id}
            id={`avatar-${opponent.id}`}
            type="button"
            className={`opponent-avatar ${isFocused ? 'focused' : ''} ${isTargeted ? 'targeted' : ''} ${opponent.id === currentPlayerId ? 'current-turn' : ''}`}
            aria-pressed={isFocused}
            title={isFocused ? t('watchingPlayer', { player: opponent.name }) : undefined}
            onClick={() => setFocusedOpponentId(opponent.id)}
          >
            {isFocused && <span className="avatar-watching-dot" aria-hidden="true">👁</span>}
            <div className="avatar-icon">{opponent.name.slice(0, 1).toUpperCase()}</div>
            <div className="avatar-info">
              <strong>{opponent.name}</strong>
              <small>
                {t('hand')}: {'handCount' in opponent ? opponent.handCount : opponent.hand.length}
              </small>
            </div>
            {(effects.skipTurns > 0 ||
              effects.skipDrawTurns > 0 ||
              effects.cannotPlayTurns > 0) && (
              <div className="avatar-effects">
                {effects.skipTurns > 0 && '🚫'}
                {effects.skipDrawTurns > 0 && '🛑'}
                {effects.cannotPlayTurns > 0 && '🔒'}
              </div>
            )}
          </button>
        )
      })}
    </section>
  )
}
