import { useState } from 'react'
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

  if (!isChooser) {
    return (
      <div className="decision-overlay">
        <div className="decision-modal">
          <span className="decision-tag">⏳ Đang chờ</span>
          <h2>{t('waitingForDecision')}</h2>
          <p>{t('waitingForOpponentToResolve', { kind: decision.kind })}</p>
        </div>
      </div>
    )
  }

  const isAnxiety = decision.kind === 'anxiety'
  const isTremors = decision.kind === 'tremors'
  const choices = decision.choices ?? []

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

  const episodeLabel = isAnxiety ? '⚡ Cơn phát bệnh · Lo âu' : '⚡ Cơn phát bệnh · Run rẩy'

  let confirmText = t('confirm')
  if (isTremors) {
    const remaining = requiredCount - selectedIds.length
    if (selectedIds.length === 0) {
      confirmText = `Chọn ${requiredCount} lá`
    } else if (remaining > 0) {
      confirmText = `Chọn thêm ${remaining} lá`
    } else {
      confirmText = `Bỏ ${requiredCount} lá đã chọn`
    }
  }

  return (
    <div className="decision-overlay">
      <div className={`decision-modal ${isTremors ? 'decision-modal-tremors' : ''}`}>
        <span className="decision-tag">{episodeLabel}</span>
        <h2>{t(isAnxiety ? 'anxietyDecision' : 'tremorsDecision')}</h2>
        <p>{t(isAnxiety ? 'anxietyPrompt' : 'tremorsPrompt')}</p>

        {isTremors && (
          <div className="tremors-counter">
            Đã chọn {selectedIds.length} / {requiredCount}
          </div>
        )}

        <div className={isTremors ? 'tremors-card-list' : 'decision-choices'}>
          {choices.map((choice) => {
            if (isTremors) {
              const cardData = playerHand?.find((c) => c.instanceId === choice.id)
              if (!cardData) return null

              const isSelected = selectedIds.includes(choice.id)
              const isMaxReached = selectedIds.length >= requiredCount
              const isDisabled = !isSelected && isMaxReached
              
              return (
                <button
                  key={choice.id}
                  className={`tremors-card-wrapper ${isSelected ? 'tremors-card-selected' : ''} ${isDisabled ? 'tremors-card-unselected' : ''}`}
                  onClick={() => handleToggle(choice.id)}
                  aria-pressed={isSelected}
                  disabled={isDisabled && !isSelected}
                >
                  <GameCard card={cardData} />
                  {isSelected && (
                    <div className="tremors-card-badge">✓ Đã chọn</div>
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
              disabled={selectedIds.length === 0}
            >
              Hủy chọn
            </button>
          )}
          <button
            type="button"
            className="primary confirm-btn"
            disabled={!isValid}
            onClick={() => onResolve(decision.id, selectedIds)}
          >
            {isValid ? '✓ ' : ''}{confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
