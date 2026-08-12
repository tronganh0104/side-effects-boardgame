import { useEffect, useState } from 'react'
import { useTradeStore } from '../../store/tradeStore'

interface TradeButtonProps {
  players: { id: string; name: string }[]
  onCancelInvite: () => void
}

/** Ticks once a second only while an expiry exists, so idle renders never restart a timer. */
function useCountdownSeconds(expiresAt?: number): number | undefined {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (expiresAt === undefined) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [expiresAt])
  return expiresAt === undefined ? undefined : Math.max(0, Math.ceil((expiresAt - now) / 1000))
}

/**
 * Controls-bar entry point. Opens the partner picker when idle. While an
 * invite you sent is still pending it turns into a "waiting" readout with a
 * cancel action instead; once the partner accepts (phase 'open') or you are
 * the invited side, this renders nothing — the panel and the sidebar badge
 * own the UI at that point.
 */
export function TradeButton({ players, onCancelInvite }: TradeButtonProps) {
  const session = useTradeStore((state) => state.session)
  const openPartnerPicker = useTradeStore((state) => state.openPartnerPicker)
  const isWaitingOnOwnInvite =
    session?.phase === 'pending' && session.yourRole === 'initiator'
  const remaining = useCountdownSeconds(isWaitingOnOwnInvite ? session.expiresAt : undefined)

  if (session) {
    if (!isWaitingOnOwnInvite) return null
    const partnerName = players.find((player) => player.id === session.withPlayerId)?.name ?? '...'
    return (
      <div className="trade-waiting">
        <span className="trade-waiting-label">
          Đang chờ {partnerName}
          {remaining !== undefined ? ` (${remaining}s)` : ''}…
        </span>
        <button type="button" className="btn-danger utility-btn" onClick={onCancelInvite}>
          Huỷ
        </button>
      </div>
    )
  }

  return (
    <button type="button" className="utility-btn trade-open-btn" onClick={openPartnerPicker}>
      🔁 Trao đổi
    </button>
  )
}
