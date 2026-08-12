import type { CardType } from '../../game/cards/types'
import { GameCard } from '../cards/GameCard'

export interface TradeSlotCard {
  instanceId: string
  definitionId: string
  cardType: CardType
  displayName: string
}

interface TradeSlotProps {
  label: string
  /** Only ever set for the viewer's own slot — the opponent's identity never
   *  reaches this component, see `faceDown` below. */
  card?: TradeSlotCard
  /** The opponent's slot passes this boolean instead of a card. There is no
   *  prop here that could carry their card's id/name, so devtools on this
   *  slot can only ever show a labelled empty box, never a definitionId. */
  faceDown?: boolean
  placeholder: string
  onClick?: () => void
  clickable?: boolean
}

/** One half of the trade panel: a card face-up, a card back, or an empty slot. */
export function TradeSlot({ label, card, faceDown, placeholder, onClick, clickable }: TradeSlotProps) {
  const isInteractive = Boolean(clickable && onClick)

  return (
    <div className="trade-slot">
      <span className="trade-slot-label">{label}</span>
      {card ? (
        isInteractive ? (
          <button type="button" className="trade-slot-card" onClick={onClick}>
            <GameCard card={card} />
          </button>
        ) : (
          <div className="trade-slot-card">
            <GameCard card={card} />
          </div>
        )
      ) : faceDown ? (
        <div className="trade-slot-back" aria-label={placeholder} />
      ) : isInteractive ? (
        <button type="button" className="trade-slot-empty" onClick={onClick}>
          {placeholder}
        </button>
      ) : (
        <div className="trade-slot-empty" aria-live="polite">
          {placeholder}
        </div>
      )}
    </div>
  )
}
