import { useEffect, useState } from 'react'
import { useTradeStore } from '../../store/tradeStore'

interface TradeInviteBadgeProps {
  players: { id: string; name: string }[]
  onAccept: () => void
  onDecline: () => void
}

/**
 * Lives in the left sidebar (never a modal): the invited player's current
 * interaction must not be blocked. Ticks its own countdown from
 * `expiresAt` — the server closes the session on expiry regardless, this
 * only drives the on-screen number.
 */
export function TradeInviteBadge({ players, onAccept, onDecline }: TradeInviteBadgeProps) {
  const session = useTradeStore((state) => state.session)
  const isPendingInvite = session?.phase === 'pending' && session.yourRole === 'partner'
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!isPendingInvite) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isPendingInvite])

  if (!session || !isPendingInvite) return null

  const inviterName = players.find((player) => player.id === session.withPlayerId)?.name ?? 'Một người chơi'
  const remaining =
    session.expiresAt !== undefined ? Math.max(0, Math.ceil((session.expiresAt - now) / 1000)) : undefined

  return (
    <div className="trade-invite-badge" role="alert">
      <p className="trade-invite-text">
        <strong>{inviterName}</strong> muốn trao đổi bài{remaining !== undefined ? ` (${remaining}s)` : ''}
      </p>
      <div className="trade-invite-actions">
        <button type="button" className="primary utility-btn" onClick={onAccept}>
          Đồng ý
        </button>
        <button type="button" className="btn-danger utility-btn" onClick={onDecline}>
          Từ chối
        </button>
      </div>
    </div>
  )
}
