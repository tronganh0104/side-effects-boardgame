import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import type { GameCardData } from './GameCard'

interface CardHoverContextValue {
  /** The last card a real GameCard reported hover/focus for. Stays set after
   *  the pointer leaves or focus moves away (see onCardHover below), so the
   *  sidebar preview (CardInfoPanel) never flickers back to its placeholder
   *  mid-game — the player has time to move their eyes to the sidebar. */
  hoveredCard: GameCardData | null
  /** Called with the real card on mouseenter/focus, and with null on
   *  mouseleave/blur. A null call is intentionally a no-op — it never clears
   *  hoveredCard, it only means "not currently pointed at". The panel keeps
   *  showing the last real card until a *different* card reports hover. */
  onCardHover: (card: GameCardData | null) => void
}

// Default (no-provider) value is an inert no-op, not a thrown error: GameCard
// and Psyche are both rendered standalone in existing tests
// (gameCard.test.ts, psycheTableau.test.ts via renderToStaticMarkup, outside
// any CardHoverProvider) and must keep working there — reporting hover is
// pure side-channel UI state, so quietly doing nothing outside a provider is
// safe, unlike the state those tests actually assert on.
const noopContextValue: CardHoverContextValue = {
  hoveredCard: null,
  onCardHover: () => {},
}

const CardHoverContext = createContext<CardHoverContextValue>(noopContextValue)

/**
 * Security note (see AGENTS.md: "keep secret or room-specific data on the
 * server until it is intentionally sent to the correct player"): the only
 * caller of onCardHover is GameCard (mouseenter/mouseleave) plus the hand's
 * card button (focus/blur, GameBoard.tsx) — both only ever hold a
 * definitionId the viewer is already allowed to see. CardBack (draw pile,
 * discard pile, opponent hands, un-revealed trade slots) never imports this
 * context and never calls onCardHover, so a face-down card cannot leak into
 * the preview through this mechanism, structurally.
 */
export function CardHoverProvider({ children }: PropsWithChildren) {
  const [hoveredCard, setHoveredCard] = useState<GameCardData | null>(null)
  const onCardHover = useCallback((card: GameCardData | null) => {
    if (card) setHoveredCard(card)
  }, [])
  const value = useMemo(() => ({ hoveredCard, onCardHover }), [hoveredCard, onCardHover])
  return <CardHoverContext.Provider value={value}>{children}</CardHoverContext.Provider>
}

export function useCardHover(): CardHoverContextValue {
  return useContext(CardHoverContext)
}
