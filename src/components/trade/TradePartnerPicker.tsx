import { useTradeStore } from '../../store/tradeStore'

export interface TradePartnerOption {
  id: string
  name: string
  /** Vietnamese reason the player can't be invited, or absent if eligible. */
  reason?: string
}

interface TradePartnerPickerProps {
  partners: TradePartnerOption[]
  onInvite: (targetPlayerId: string) => void
}

/**
 * Opened by TradeButton, closed by picking someone or by dismissing it —
 * either way nothing is remembered: reopening always starts from this same
 * full list. No card selection happens here; that only exists once the
 * invite is accepted and the trade panel opens.
 */
export function TradePartnerPicker({ partners, onInvite }: TradePartnerPickerProps) {
  const isOpen = useTradeStore((state) => state.isPartnerPickerOpen)
  const close = useTradeStore((state) => state.closePartnerPicker)
  if (!isOpen) return null

  return (
    <div className="trade-overlay" role="dialog" aria-modal="true" onClick={close}>
      <div
        className="trade-modal trade-partner-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="trade-modal-header">
          <h2>Chọn người để trao đổi</h2>
          <button type="button" className="trade-modal-close" onClick={close} aria-label="Đóng">
            ✖
          </button>
        </header>
        {partners.length === 0 ? (
          <p className="trade-empty">Không có người chơi nào khác.</p>
        ) : (
          <ul className="trade-partner-list">
            {partners.map((partner) => (
              <li key={partner.id}>
                <button
                  type="button"
                  className="trade-partner-option"
                  disabled={Boolean(partner.reason)}
                  onClick={() => {
                    onInvite(partner.id)
                    close()
                  }}
                >
                  <span className="trade-partner-name">{partner.name}</span>
                  {partner.reason && <span className="trade-partner-reason">{partner.reason}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
