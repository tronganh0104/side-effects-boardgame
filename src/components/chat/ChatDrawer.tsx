import { t } from '../../i18n'
import { ChatPanel } from './ChatPanel'

interface ChatDrawerProps {
  show: boolean
  onClose: () => void
  onSend: (text: string) => void
  viewerPlayerId?: string
}

/** Mobile wrapper, reusing GameLogDrawer's slide-up mechanism: a plain conditional mount, no animation library. */
export function ChatDrawer({ show, onClose, onSend, viewerPlayerId }: ChatDrawerProps) {
  if (!show) return null

  return (
    <section className="chat-drawer panel" role="dialog" aria-modal="false">
      <header>
        <h2>{t('chat')}</h2>
        <button type="button" onClick={onClose}>{t('chatClose')}</button>
      </header>
      <ChatPanel onSend={onSend} viewerPlayerId={viewerPlayerId} />
    </section>
  )
}
