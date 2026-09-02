import { useEffect, useRef, useState } from 'react'
import type { PlayerGameView } from '../../../server/game/playerView'

interface YourTurnToastProps {
  game: PlayerGameView
  viewerPlayerId: string
}

const DISPLAY_DURATION_MS = 2200
const FADE_DURATION_MS = 400
// Lazily captured on first render (not at module scope) so this module
// imports cleanly in Node.js test environments where `document` is absent.
let originalTitle: string | undefined

/**
 * YourTurnToast — Đề xuất: Thông báo đến lượt
 *
 * Hiển thị toast trung tâm tự fade out sau ~2s khi lượt chuyển sang người
 * chơi hiện tại. Không yêu cầu người chơi ấn gì (phân biệt với NoticeModal
 * buộc xác nhận). Đồng thời đổi title tab khi window không được focus.
 *
 * Implementation notes:
 * - visible/fading state tách biệt để CSS transition fade-out mượt trước
 *   khi unmount khỏi DOM.
 * - Title tab reset về originalTitle! khi: (a) toast đóng, hoặc (b) window
 *   được focus lại — cả hai đều quan trọng để tab không bị stuck.
 * - Skip on mount (mountedRef): không toast khi lần đầu load trang, vì đó
 *   không phải "lượt vừa chuyển sang mình".
 */
export function YourTurnToast({ game, viewerPlayerId }: YourTurnToastProps) {
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)

  const prevPlayerIdRef = useRef<string | undefined>(undefined)
  const mountedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Detect turn-to-viewer transition
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      prevPlayerIdRef.current = game.currentPlayerId
      return
    }

    // Capture the original title on first real turn-change detection, which
    // always runs in a browser context where document is defined.
    if (originalTitle === undefined) originalTitle = document.title

    const prev = prevPlayerIdRef.current
    const curr = game.currentPlayerId
    prevPlayerIdRef.current = curr

    if (prev !== curr && curr === viewerPlayerId) {
      // Clear any running timers from a prior turn (shouldn't happen normally
      // but handles edge cases like two rapid state updates).
      clearTimeout(timerRef.current)
      clearTimeout(fadeTimerRef.current)

      setFading(false)
      setVisible(true)

      // Change tab title when blurred
      if (document.hidden || !document.hasFocus()) {
        document.title = `(Đến lượt bạn!) ${originalTitle!}`
      }

      timerRef.current = setTimeout(() => {
        setFading(true)
        fadeTimerRef.current = setTimeout(() => {
          setVisible(false)
          setFading(false)
          document.title = originalTitle!
        }, FADE_DURATION_MS)
      }, DISPLAY_DURATION_MS)
    }
  }, [game.currentPlayerId, viewerPlayerId])

  // Reset title when the user focuses the window while toast is active
  useEffect(() => {
    const handleFocus = () => {
      document.title = originalTitle!
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // Cleanup timers and title on unmount (e.g. game ends mid-toast)
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current)
      clearTimeout(fadeTimerRef.current)
      document.title = originalTitle!
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className={`your-turn-toast${fading ? ' your-turn-toast-fading' : ''}`}
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="your-turn-toast-icon" aria-hidden="true">🎴</span>
      <span className="your-turn-toast-text">Đến lượt bạn!</span>
    </div>
  )
}
