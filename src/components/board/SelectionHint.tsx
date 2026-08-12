import { createPortal } from 'react-dom'
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

interface SelectionHintProps {
  /** instanceId of the selected card this hint should anchor above. */
  cardInstanceId: string
  children: ReactNode
}

/** Gap between the hint's bottom edge and the card's top edge. */
const CARD_GAP = 8
/** Minimum distance the hint is allowed to sit from any viewport edge. */
const EDGE_MARGIN = 8
/** Longer than the 0.2s card-lift transition (hand.css), as a safety net for
 *  the (normally unreachable, since a hint only mounts alongside a fresh
 *  selection) case where no `transitionend` ever fires. */
const SETTLE_FALLBACK_MS = 300

/**
 * The yellow "selection hint" pill, positioned above the selected card in
 * the player's own hand rather than centred over the deck.
 *
 * Rendered through a portal into `document.body` with `position: fixed`,
 * NOT as a normal child of `.own-hand`. `.own-hand` has `overflow-x: auto`,
 * which forces `overflow-y` to `auto` too (confirmed via computed style at
 * 1920x1080, 1366x768 and 390x844) — any child positioned above that box's
 * own padding-top edge sits in territory an auto-scrolling axis can never
 * reach (scrollTop cannot go negative), so it would be permanently clipped
 * however tall the box's padding-top reservation is. Portaling out of
 * `.own-hand` entirely sidesteps that: the fixed box is laid out against
 * the viewport, not against `.own-hand`'s scrollable content box, so its
 * overflow rules do not apply to it at all. Checked that `html`/`body`
 * carry no `transform`/`filter`/`perspective`/`backdrop-filter`/
 * `contain: paint`/transform-like `will-change` — any of those would
 * hijack `position: fixed`'s containing block away from the viewport — so
 * `document.body` is a safe portal target here.
 *
 * All positioning math happens here in JS, in viewport coordinates, because
 * that's the coordinate space `position: fixed` resolves in. Doing it in
 * CSS previously broke two ways: (a) a CSS `clamp()` against `.own-hand`'s
 * own width clamped the hint's centre to a box far narrower than the
 * viewport (`.own-hand` sits between two sidebars), landing the hint over
 * 100px off-centre from the card in measured cases; (b) the anchor X was
 * computed as `cardRect.left - handRect.left` — a viewport-relative delta —
 * while CSS `left` on a child of a horizontally-scrolled container resolves
 * in content coordinates, so on narrow viewports (390x844, where `.own-hand`
 * scrolls) the hint landed off-screen by roughly `.own-hand`'s scrollLeft.
 * Measuring `getBoundingClientRect()` on the card and clamping against
 * `window.innerWidth`/`window.innerHeight` avoids both: viewport coordinates
 * are exactly what `getBoundingClientRect()` and `position: fixed` agree on.
 */
export function SelectionHint({ cardInstanceId, children }: SelectionHintProps) {
  const hintRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  // Which cardInstanceId's lift transition has actually finished — gates
  // visibility so the pill never appears at the pre-lift position and then
  // visibly hops up 0.2s later; see the transitionend effect below.
  const [settledFor, setSettledFor] = useState<string | null>(null)

  const measure = () => {
    const cardWrapper = document.getElementById(`hand-card-${cardInstanceId}`)
    const hint = hintRef.current
    if (!cardWrapper || !hint) return
    // The lift transform for a selected card (`.own-hand .card-button.selected`,
    // hand.css) is on the inner <button class="card-button"> rendered by
    // CardButton (GameBoard.tsx), not on this `#hand-card-*` wrapper div — a
    // transform never changes an ancestor's own layout box. Measuring the
    // wrapper instead of the button was the bug in the previous version: it
    // silently ignored the lift, anchoring the hint ~0.26 * card-height below
    // where the visually-lifted card actually sits (confirmed against the
    // card's own measured top: off by 47px at 1920x1080, 32px at 1366x768,
    // 18px at 390x844 — each matching that card's own --card-h * 0.26).
    const card = cardWrapper.querySelector<HTMLElement>('.card-button') ?? cardWrapper
    const cardRect = card.getBoundingClientRect()
    const hintRect = hint.getBoundingClientRect()
    const halfWidth = hintRect.width / 2

    // Clamp the hint's centre so its own box stays inside the viewport
    // (an 8px margin on each side), not inside .own-hand's narrower box —
    // .own-hand sits in the middle grid column between two sidebars, and
    // the hint is allowed to overhang past the hand row into that space.
    const minCenter = EDGE_MARGIN + halfWidth
    const maxCenter = window.innerWidth - EDGE_MARGIN - halfWidth
    let left: number
    if (minCenter > maxCenter) {
      // Hint wider than the viewport allows even with both margins: there's
      // no centre that satisfies both bounds, so pin to the left margin
      // instead of clamping to a nonsense (inverted) range.
      left = EDGE_MARGIN
    } else {
      const desiredCenter = cardRect.left + cardRect.width / 2
      const centerX = Math.min(Math.max(desiredCenter, minCenter), maxCenter)
      left = centerX - halfWidth
    }

    let top = cardRect.top - CARD_GAP - hintRect.height
    if (top < EDGE_MARGIN) top = EDGE_MARGIN

    setPos((prev) =>
      prev && Math.abs(prev.left - left) < 0.5 && Math.abs(prev.top - top) < 0.5 ? prev : { left, top }
    )
  }

  const measureRef = useRef(measure)
  measureRef.current = measure

  // Re-measure after every commit (selection change, hand reorder/sort,
  // hand-count change) — cheap (two getBoundingClientRect calls) and
  // idempotent, so it can't loop: setState is a no-op once the measured
  // value stops changing. useLayoutEffect (not useEffect) so this resolves
  // before the browser paints — no visible jump on first render.
  useLayoutEffect(() => {
    measureRef.current()
  })

  // The card's own lift (`.own-hand .card-button.selected`, hand.css)
  // animates over 0.2s via `transition: transform`. The synchronous
  // useLayoutEffect above fires right after the `selected` class is
  // applied, before that transition has visually moved the button — its
  // getBoundingClientRect() at that instant still reports the pre-lift
  // position, so the first measurement anchors the hint ~0.26 * card-height
  // too low (confirmed by measurement: off by 47px at 1920x1080, 32px at
  // 1366x768, 18px at 390x844, matching --card-h * 0.26 at each size).
  // Rather than show that wrong position and let the fix below visibly hop
  // it into place 0.2s later, the hint stays hidden (settledFor below)
  // until the lift transition actually finishes and a corrected measurement
  // is taken. The timeout is only a safety net for the (normally
  // unreachable) case where transitionend never fires — a hint only mounts
  // alongside a fresh selection, so the transform transition always runs.
  useLayoutEffect(() => {
    setSettledFor(null)
    const cardWrapper = document.getElementById(`hand-card-${cardInstanceId}`)
    const card = cardWrapper?.querySelector<HTMLElement>('.card-button')
    if (!card) {
      setSettledFor(cardInstanceId)
      return
    }
    const settle = () => {
      measureRef.current()
      setSettledFor(cardInstanceId)
    }
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.propertyName === 'transform') settle()
    }
    card.addEventListener('transitionend', onTransitionEnd)
    const timeoutId = window.setTimeout(settle, SETTLE_FALLBACK_MS)
    return () => {
      card.removeEventListener('transitionend', onTransitionEnd)
      window.clearTimeout(timeoutId)
    }
  }, [cardInstanceId])

  // Nothing above re-renders GameBoard on a bare window resize, a
  // `.own-hand` box-size change, or a horizontal scroll within it (card
  // sizing is pure CSS clamp()/media queries, and scrolling doesn't touch
  // React state) — these three listeners are what catch those cases and
  // keep the fixed-position pill tracking the card it's supposed to sit
  // above. `.own-hand` scrolls horizontally on narrow viewports, which
  // moves the card in viewport space without moving `.own-hand` itself.
  useLayoutEffect(() => {
    const hand = document.getElementById('own-hand')
    const onChange = () => measureRef.current()
    const resizeObserver = new ResizeObserver(onChange)
    if (hand) {
      resizeObserver.observe(hand)
      hand.addEventListener('scroll', onChange, { passive: true })
    }
    window.addEventListener('resize', onChange)
    return () => {
      resizeObserver.disconnect()
      hand?.removeEventListener('scroll', onChange)
      window.removeEventListener('resize', onChange)
    }
  }, [])

  // Hidden until both a measurement exists AND that measurement is for the
  // settled (post-lift-transition) position of the currently anchored card
  // — see the transitionend effect above for why the pre-settle value would
  // otherwise be visibly wrong for ~0.2s. left/top default to 0/0 while
  // hidden (arbitrary but harmless — top-left of the viewport).
  const ready = pos !== null && settledFor === cardInstanceId
  const style: CSSProperties = {
    left: pos ? `${pos.left}px` : 0,
    top: pos ? `${pos.top}px` : 0,
    visibility: ready ? 'visible' : 'hidden',
  }

  return createPortal(
    <div ref={hintRef} className="selection-hint hand-selection-hint" style={style}>
      {children}
    </div>,
    document.body
  )
}
