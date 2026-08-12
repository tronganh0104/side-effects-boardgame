import { getCardDefinition } from '../../game/cards/catalog'
import { useCardHover } from '../cards/cardHoverContext'
import { cardName, disorderName, locale, t } from '../../i18n'

/**
 * Left-sidebar readable preview of whichever card GameCard last reported
 * hover/focus for (cardHoverContext.tsx). This panel shows the same data as
 * real DOM text, sourced from i18n exactly like GameCard's own
 * (visually-hidden) accessibility block, at a legible size.
 *
 * No thumbnail: baked card art rendered at this panel's available width
 * (~51px, bound by the 154px sidebar floor minus the name/label column) is
 * too small for its own baked-in text to read, duplicates the art already
 * visible on the actual card in hand/board, and was costing vertical space
 * in a panel whose only job is legible text.
 *
 * Desktop-only: responsive.css sets `.player-sidebar { display: none }`
 * under 801px, so this panel simply doesn't exist on phones — no mobile
 * path is built for it.
 *
 * Always renders inside the same fixed-height `.card-info-panel` shell
 * (card-preview.css) whether or not a card has ever been hovered, so mounting
 * real content never shifts SelfStatusPanel or the log below it in
 * `.player-sidebar` (a flex column, sidebar.css).
 */
export function CardInfoPanel() {
  const { hoveredCard } = useCardHover()

  if (!hoveredCard) {
    return (
      <section className="card-info-panel card-info-panel--empty">
        <h3 className="sidebar-heading">{t('cardInfoHeading')}</h3>
        <p className="card-info-placeholder">{t('cardInfoPlaceholder')}</p>
      </section>
    )
  }

  const definition = getCardDefinition(hoveredCard.definitionId)
  const name = cardName(hoveredCard.definitionId, hoveredCard.displayName)

  return (
    <section className="card-info-panel" aria-live="polite">
      <h3 className="sidebar-heading">{t('cardInfoHeading')}</h3>
      <div className="card-info-body">
        <strong className="card-info-name">{name}</strong>
        {definition?.cardType === 'disorder' && (
          <div className="card-info-field">
            <small className="card-info-label">{t('episodeEffect')}</small>
            <p className="card-info-text">
              {locale.episodeDescriptions[definition.definitionId]}
            </p>
          </div>
        )}
        {definition?.cardType === 'drug' && (
          <>
            <div className="card-info-field">
              <small className="card-info-label">{t('treatLabel')}</small>
              <p className="card-info-text">{disorderName(definition.treats)}</p>
            </div>
            <div className="card-info-field">
              <small className="card-info-label">{t('sideEffects')}</small>
              <ul className="card-info-side-effects">
                {definition.sideEffects.map((effect) => (
                  <li key={effect}>{disorderName(effect)}</li>
                ))}
              </ul>
            </div>
          </>
        )}
        {definition?.cardType === 'episode' && (
          <div className="card-info-field">
            <p className="card-info-text">{t('episodeInstructions')}</p>
          </div>
        )}
        {definition?.cardType === 'therapy' && (
          <div className="card-info-field">
            <p className="card-info-text">{t('therapyInstructions')}</p>
            <p className="card-info-note">{t('therapyRestriction')}</p>
          </div>
        )}
      </div>
    </section>
  )
}
