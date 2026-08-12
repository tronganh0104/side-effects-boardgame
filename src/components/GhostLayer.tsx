import { useEffect, useState } from 'react'
import { GameCard } from './cards/GameCard'
import { CardBack } from './cards/CardBack'
import type { CardInstance } from '../game/cards/types'
import type { PublicCardView } from '../../server/game/playerView'

export type GhostCardType = Pick<CardInstance, 'instanceId' | 'definitionId' | 'cardType' | 'displayName'> | PublicCardView

export interface GhostItem {
  id: string
  startRect: DOMRect
  endRect: DOMRect
  card?: GhostCardType
  type: 'card' | 'cardback'
  onLand?: () => void
}

let nextId = 0

// Singleton event emitter for ghosts to avoid heavy context
export type GhostListener = (ghost: GhostItem) => void
const listeners = new Set<GhostListener>()
export const __test_listeners = listeners

export function triggerGhost(startId: string, endId: string, card?: GhostCardType, type: 'card' | 'cardback' = 'card', onLand?: () => void) {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    console.debug('Ghost animation skipped due to prefers-reduced-motion')
    onLand?.()
    return
  }

  const startEl = document.getElementById(startId)
  const endEl = document.getElementById(endId)

  if (!startEl || !endEl) {
    console.debug(`Ghost animation skipped due to missing DOM element: ${!startEl ? startId : ''} ${!endEl ? endId : ''}`)
    onLand?.()
    return
  }

  const startRect = startEl.getBoundingClientRect()
  const endRect = endEl.getBoundingClientRect()

  const id = `ghost-${nextId++}`
  const ghost = { id, startRect, endRect, card, type, onLand }
  listeners.forEach(fn => fn(ghost))
}

function GhostElement({ ghost, onComplete }: { ghost: GhostItem, onComplete: (id: string) => void }) {
  // The box geometry (top/left/width/height) is fixed at the start rect for the
  // whole animation. Only transform and opacity ever change, because those are
  // the only two properties the browser can hand off to the compositor -
  // animating top/left/width/height instead would force layout and paint on
  // every frame.
  const [style, setStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    top: ghost.startRect.top,
    left: ghost.startRect.left,
    width: ghost.startRect.width,
    height: ghost.startRect.height,
    zIndex: 1000,
    pointerEvents: 'none',
    opacity: 1,
    transition: 'none',
    transform: 'translate3d(0, 0, 0) scale(1, 1)',
    willChange: 'transform, opacity',
  })

  useEffect(() => {
    let frame2: number

    // Express the whole journey - travel and resize - as a single transform
    // applied to the fixed start-rect box. This relies on .ghost-card setting
    // transform-origin: center (see overlays.css), so that scaling grows the
    // box from its own centre, matching the centre-to-centre delta below.
    //
    // A destination can be a container rather than a card-shaped element (the
    // draw pile flies to the whole hand row), so scale uniformly and land on
    // the destination's centre. Per-axis scaling would stretch the card to fill it.
    const safe = (value: number, fallback = 1) =>
      Number.isFinite(value) && value > 0 ? value : fallback
    const scale = Math.min(
      safe(ghost.endRect.width / ghost.startRect.width),
      safe(ghost.endRect.height / ghost.startRect.height),
    )
    const dx = ghost.endRect.left + ghost.endRect.width / 2 -
      (ghost.startRect.left + ghost.startRect.width / 2)
    const dy = ghost.endRect.top + ghost.endRect.height / 2 -
      (ghost.startRect.top + ghost.startRect.height / 2)

    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        setStyle({
          position: 'fixed',
          top: ghost.startRect.top,
          left: ghost.startRect.left,
          width: ghost.startRect.width,
          height: ghost.startRect.height,
          zIndex: 1000,
          pointerEvents: 'none',
          opacity: 0,
          transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`,
          willChange: 'transform, opacity',
          transition: 'transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 150ms ease-out 350ms',
        })
      })
    })

    const timerLand = setTimeout(() => {
      ghost.onLand?.()
    }, 350)

    const timer = setTimeout(() => {
      onComplete(ghost.id)
    }, 550)

    return () => {
      cancelAnimationFrame(frame1)
      cancelAnimationFrame(frame2)
      clearTimeout(timerLand)
      clearTimeout(timer)
    }
  }, [ghost, onComplete])

  if (!style) return null

  return (
    <div className="ghost-card" style={style}>
      {ghost.type === 'cardback' ? (
        <CardBack count={1} label="Ghost" />
      ) : ghost.card ? (
        <GameCard card={ghost.card} />
      ) : null}
    </div>
  )
}

export function GhostLayer() {
  const [ghosts, setGhosts] = useState<GhostItem[]>([])

  useEffect(() => {
    const handler = (ghost: GhostItem) => {
      setGhosts(prev => [...prev, ghost])
    }
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])

  const handleComplete = (id: string) => {
    setGhosts(prev => prev.filter(g => g.id !== id))
  }

  return (
    <div className="ghost-layer">
      {ghosts.map(g => (
        <GhostElement key={g.id} ghost={g} onComplete={handleComplete} />
      ))}
    </div>
  )
}
