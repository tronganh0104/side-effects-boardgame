import { getCardDefinition } from '../../game/cards/catalog'
import type { CardType } from '../../game/cards/types'
import { cardName, disorderName, locale, t } from '../../i18n'
import { CardFrame } from './CardFrame'
import { useCardHover } from './cardHoverContext'

export interface GameCardData {
  definitionId: string
  cardType: CardType
  displayName: string
}

export function GameCard({
  card,
  expanded = false,
}: {
  card: GameCardData
  expanded?: boolean
}) {
  const definition = getCardDefinition(card.definitionId)
  const name = cardName(card.definitionId, card.displayName)
  const { onCardHover } = useCardHover()
  return (
    <CardFrame type={card.cardType} definitionId={card.definitionId}>
      {/* Hit-target for the left-sidebar card-info preview (CardInfoPanel,
          cardHoverContext.tsx). Absolutely fills CardFrame's box
          (cards.css: .card-frame is position:relative; overflow:hidden), so
          hovering anywhere on the visible art reports this card. GameCard is
          the ONLY place in the app that ever calls onCardHover on
          mouseenter/leave — it only ever receives a definitionId the viewer
          is already allowed to see, so a face-down card cannot leak through
          here (CardBack never renders this element or imports the hover
          context — see its own file). Keyboard focus for hand cards is
          wired separately, on the hand's own <button> in GameBoard.tsx,
          since a button's focus event never reaches a descendant like this
          span. aria-hidden: purely a hit-target, the existing
          .visually-hidden block below already carries the accessible text. */}
      <span
        className="card-hover-target"
        aria-hidden="true"
        onMouseEnter={() => onCardHover(card)}
        onMouseLeave={() => onCardHover(null)}
      />
      {/* The card's name, effect text, side-effect list and per-disorder
          glyph are all baked into the art now (cardArt.ts) — nothing here
          paints on top of it any more. This block stays in the DOM, visually
          hidden, purely so a screen reader (which never sees the baked
          pixels) still gets the card's full identity and rules; sighted
          players read it straight off the image. */}
      <div className={`game-card-content ${expanded ? 'expanded-card' : ''}`}>
        <span className="visually-hidden">
          <strong className="card-title">{name}</strong>
          <span className="card-description">
            {definition?.cardType === 'disorder' && (
              <>
                <small className="card-label">{t('episodeEffect')}</small>
                <span className="card-summary">
                  {locale.episodeDescriptions[definition.definitionId]}
                </span>
              </>
            )}
            {definition?.cardType === 'drug' && (
              <>
                <small className="card-label">{t('treatLabel')}</small>
                <span className="card-summary">{disorderName(definition.treats)}</span>
              </>
            )}
            {definition?.cardType === 'episode' && (
              <span className="card-summary">{t('episodeInstructions')}</span>
            )}
            {definition?.cardType === 'therapy' && (
              <span className="card-summary">{t('therapyInstructions')}</span>
            )}
            {expanded && definition?.cardType === 'therapy' && (
              <small className="card-note">{t('therapyRestriction')}</small>
            )}
          </span>
          {definition?.cardType === 'drug' && (
            <span className="side-effect-zone">
              <small className="card-label">{t('sideEffects')}</small>
              <span className="side-effect-list">
                {definition.sideEffects.map((effect) => (
                  <span className="side-effect-chip" key={effect}>
                    {disorderName(effect)}
                  </span>
                ))}
              </span>
            </span>
          )}
        </span>
      </div>
    </CardFrame>
  )
}
