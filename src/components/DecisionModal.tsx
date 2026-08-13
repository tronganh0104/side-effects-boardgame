import { useEffect, useState } from 'react'
import type { PendingDecisionView, PublicCardView } from '../../server/game/playerView'
import { t } from '../i18n'
import { GameCard } from './cards/GameCard'

interface DecisionModalProps {
  decision: PendingDecisionView
  viewerPlayerId: string
  playerHand?: PublicCardView[]
  onResolve: (decisionId: string, choiceIds: string[]) => void
}

const cardTypeLabel: Record<string, string> = {
  drug: 'Thuốc',
  disorder: 'Rối loạn',
  therapy: 'Trị liệu',
  episode: 'Cơn khủng hoảng',
}

export function DecisionModal({ decision, viewerPlayerId, playerHand, onResolve }: DecisionModalProps) {
  const isChooser = decision.chooserPlayerId === viewerPlayerId
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setSelectedIds([])
    setNow(Date.now())
  }, [decision.id])

  useEffect(() => {
    if (decision.kind !== 'tremors' || decision.expiresAt === undefined) return
    const interval = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(interval)
  }, [decision.kind, decision.expiresAt])

  if (!isChooser) {
    return (
      <div className="decision-overlay">
        <div className="decision-modal">
          <span className="decision-tag">{t('waitingTag')}</span>
          <h2>{t('waitingForDecision')}</h2>
          <p>{t('waitingForOpponentToResolve', { kind: decision.kind })}</p>
        </div>
      </div>
    )
  }

  const isAnxiety = decision.kind === 'anxiety'
  const isTremors = decision.kind === 'tremors'
  const choices = decision.choices ?? []
  const remainingMs =
    isTremors && decision.expiresAt !== undefined
      ? Math.max(0, decision.expiresAt - now)
      : undefined
  const isExpired = remainingMs === 0

  const handleToggle = (id: string) => {
    if (isAnxiety) {
      setSelectedIds([id])
    } else if (isTremors) {
      setSelectedIds((current) => {
        if (current.includes(id)) {
          return current.filter((x) => x !== id)
        }
        if (current.length >= 3) {
          return current // Max 3 for Tremors
        }
        return [...current, id]
      })
    }
  }

  const handleReset = () => {
    setSelectedIds([])
  }

  const requiredCount = Math.min(3, choices.length)
  const isValid =
    (isAnxiety && selectedIds.length === 1) ||
    (isTremors && selectedIds.length === requiredCount)

  const episodeLabel = t(
    isAnxiety ? 'episodeAnxietyLabel' : 'episodeTremorsLabel',
  )

  let confirmText = t('confirm')
  if (isTremors) {
    const remaining = requiredCount - selectedIds.length
    if (selectedIds.length === 0) {
      confirmText = t('tremorsChooseCards', { count: requiredCount })
    } else if (remaining > 0) {
      confirmText = t('tremorsChooseMore', { count: remaining })
    } else {
      confirmText = t('tremorsDiscardSelected', { count: requiredCount })
    }
  }
  if (isExpired) confirmText = t('tremorsResolving')

  return (
    <div className="decision-overlay">
      <div className={`decision-modal ${isTremors ? 'decision-modal-tremors' : ''}`}>
        <span className="decision-tag">{episodeLabel}</span>
        <h2>{t(isAnxiety ? 'anxietyDecision' : 'tremorsDecision')}</h2>
        <p>{t(isAnxiety ? 'anxietyPrompt' : 'tremorsPrompt')}</p>

        {isTremors && (
          <div className="tremors-status" aria-live="polite">
            <div className="tremors-counter">
              {t('tremorsSelectedCount', {
                selected: selectedIds.length,
                required: requiredCount,
              })}
            </div>
            {remainingMs !== undefined && (
              <div className="tremors-countdown">
                {isExpired
                  ? t('tremorsResolving')
                  : t('tremorsCountdown', {
                      seconds: (remainingMs / 1000).toFixed(1),
                    })}
              </div>
            )}
          </div>
        )}

        <div className={isTremors ? 'tremors-card-list' : 'decision-choices'}>
          {choices.map((choice) => {
            if (isTremors) {
              const cardData = playerHand?.find((c) => c.instanceId === choice.id)
              if (!cardData) return null

              const isSelected = selectedIds.includes(choice.id)
              const isMaxReached = selectedIds.length >= requiredCount
              const isDisabled = isExpired || (!isSelected && isMaxReached)
              
              return (
                <button
                  key={choice.id}
                  className={`tremors-card-wrapper ${isSelected ? 'tremors-card-selected' : ''} ${isDisabled ? 'tremors-card-unselected' : ''}`}
                  onClick={() => handleToggle(choice.id)}
                  aria-pressed={isSelected}
                  disabled={isDisabled}
                >
                  <GameCard card={cardData} />
                  {isSelected && (
                    <div className="tremors-card-badge">
                      ✓ {t('tremorsSelected')}
                    </div>
                  )}
                </button>
              )
            }

            const cardType = (choice as { cardType?: string }).cardType
            return (
              <label key={choice.id} className="decision-choice">
                <input
                  type="radio"
                  name="decision_choice"
                  value={choice.id}
                  checked={selectedIds.includes(choice.id)}
                  onChange={() => handleToggle(choice.id)}
                />
                <span className="c-name">{choice.label}</span>
                {cardType && (
                  <span className={`c-type type-${cardType}`}>
                    {cardTypeLabel[cardType] ?? cardType}
                  </span>
                )}
              </label>
            )
          })}
        </div>

        <div className="decision-actions">
          {isTremors && (
            <button
              type="button"
              className="secondary reset-btn"
              onClick={handleReset}
              disabled={selectedIds.length === 0 || isExpired}
            >
              {t('cancelSelection')}
            </button>
          )}
          <button
            type="button"
            className="primary confirm-btn"
            disabled={!isValid || isExpired}
            onClick={() => onResolve(decision.id, selectedIds)}
          >
            {isValid ? '✓ ' : ''}{confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
