import type { CSSProperties, PropsWithChildren } from 'react'
import type { CardType } from '../../game/cards/types'
import { cardArtFor } from './cardArt'

// Art is keyed by definitionId now (17 baked per-card faces, cardArt.ts),
// not by type — `type` still drives the `card-frame-{type}` class, which
// other stylesheets key off for reasons unrelated to art (psyche.css's
// target-highlight ring) and which cardArtFor falls back to when a
// definitionId has no dedicated face. The resolved image-set() is handed to
// cards.css as a custom property rather than 17 hand-written background-image
// rules; `data-definition-id` exists purely so the rendered art can be
// cross-checked against game state from outside React (tests/Playwright).
export function CardFrame({
  type,
  definitionId,
  children,
}: PropsWithChildren<{ type: CardType; definitionId: string }>) {
  const art = cardArtFor(definitionId, type)
  const style = { '--card-art': art.imageSet } as CSSProperties
  return (
    <div
      className={`card-frame card-frame-${type}`}
      style={style}
      data-definition-id={definitionId}
      data-art-fallback={art.isFallback ? 'true' : undefined}
    >
      {children}
    </div>
  )
}
