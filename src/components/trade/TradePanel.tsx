import { useEffect, useState } from 'react'
import { useTradeStore } from '../../store/tradeStore'
import { TradeSlot, type TradeSlotCard } from './TradeSlot'

interface TradePanelProps {
  players: { id: string; name: string }[]
  hand: TradeSlotCard[]
  onClear: () => void
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The two-slot negotiation table, mounted once the partner accepts (phase
 * 'open') and identical in shape on both screens. The opponent's slot is
 * driven purely by `session.theyPlaced` — see TradeSlot — so this component
 * never has their card to accidentally render.
 *
 * The offered card is picked from the real hand at the bottom of the board
 * (GameBoard's trade-placement mode, see tradeHandPlacement.ts), not from a
 * copy rendered in here — `hand` is only consulted to look up the face of
 * whichever card `session.yourCardId` already names.
 *
 * `isHidden` is a purely local view flag: it never reaches tradeStore or the
 * server. Hiding swaps this modal for a small reopen chip so the board is
 * visible underneath; the session and any placed card are untouched. It
 * resets to false whenever a new session starts, so a fresh trade never
 * opens already hidden.
 *
 * Deliberately not a full-screen `.trade-overlay` (unlike TradePartnerPicker
 * below it in GameBoard): this panel floats over the upper half of the board
 * so `.own-hand` at the bottom stays reachable and clickable while it is
 * open, which is what change #1 requires.
 */
export function TradePanel({ players, hand, onClear, onConfirm, onCancel }: TradePanelProps) {
  const session = useTradeStore((state) => state.session)
  const [isHidden, setIsHidden] = useState(false)

  useEffect(() => {
    setIsHidden(false)
  }, [session?.sessionId])

  if (!session || session.phase !== 'open') return null

  const partnerName = players.find((player) => player.id === session.withPlayerId)?.name ?? '...'
  const ownCard = hand.find((card) => card.instanceId === session.yourCardId)

  if (isHidden) {
    return (
      <button type="button" className="trade-panel-restore" onClick={() => setIsHidden(false)}>
        🔁 Trao đổi với {partnerName} — Hiện bảng
      </button>
    )
  }

  return (
    <div className="trade-modal trade-panel" role="dialog" aria-label={`Trao đổi với ${partnerName}`}>
      <header className="trade-panel-header">
        <h2 className="trade-panel-title">Trao đổi với {partnerName}</h2>
        <button
          type="button"
          className="trade-modal-close"
          onClick={() => setIsHidden(true)}
          aria-label="Ẩn bảng, xem bàn cờ"
          title="Ẩn bảng, xem bàn cờ"
        >
          ﹀
        </button>
      </header>

      <div className="trade-slots">
        <TradeSlot
          label="Bạn"
          card={ownCard}
          placeholder="Chọn 1 lá trên tay của bạn"
          clickable={Boolean(ownCard)}
          onClick={ownCard ? onClear : undefined}
        />
        <span className="trade-swap-icon" aria-hidden="true">⇄</span>
        <TradeSlot
          label={partnerName}
          faceDown={session.theyPlaced}
          placeholder={session.theyPlaced ? 'Đối phương đã đặt bài' : 'Đang chờ đối phương chọn bài…'}
        />
      </div>

      <p className="trade-status-line">
        {session.yourReady
          ? 'Bạn đã đồng ý trao đổi.'
          : session.yourCardId
            ? 'Đã đặt bài — bấm Trao đổi để đồng ý.'
            : 'Chọn 1 lá trên tay của bạn để đưa vào giao dịch.'}{' '}
        {session.theyReady ? 'Đối phương đã đồng ý.' : ''}
      </p>

      <div className="trade-panel-actions">
        {ownCard && (
          <button type="button" className="btn-danger utility-btn" onClick={onClear}>
            Rút lại
          </button>
        )}
        <button
          type="button"
          className="primary action-btn"
          disabled={!session.yourCardId || session.yourReady}
          onClick={onConfirm}
        >
          {session.yourReady ? 'Đã đồng ý ✓' : 'Trao đổi'}
        </button>
        <button type="button" className="btn-danger action-btn" onClick={onCancel}>
          Huỷ
        </button>
      </div>
    </div>
  )
}
