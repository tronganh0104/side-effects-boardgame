import { useEffect } from 'react'
import { useChatStore } from '../../store/chatStore'
import { t } from '../../i18n'
import { ChatMessageList } from './ChatMessageList'
import { ChatComposer } from './ChatComposer'

interface ChatPanelProps {
  onSend: (text: string) => void
  viewerPlayerId?: string
}

/**
 * Shared by the desktop sidebar and the mobile drawer — written once. The
 * collapsed state only changes appearance (see chat.css's `.chat-collapsed`
 * rules, scoped to `.game-board`): this component always renders its full
 * content, so a stale isCollapsed=true left over from the desktop sidebar
 * never hides messages inside the mobile drawer, which has no such CSS scope.
 */
export function ChatPanel({ onSend, viewerPlayerId }: ChatPanelProps) {
  const isCollapsed = useChatStore((state) => state.isCollapsed)
  const unreadCount = useChatStore((state) => state.unreadCount)
  const messageCount = useChatStore((state) => state.messages.length)
  const toggleCollapsed = useChatStore((state) => state.toggleCollapsed)
  const markRead = useChatStore((state) => state.markRead)

  useEffect(() => {
    // Whenever this panel is actually visible (not collapsed into the rail),
    // its mount/messages count double as "the player has seen the thread".
    if (!isCollapsed) markRead()
  }, [isCollapsed, messageCount, markRead])

  return (
    <section className="chat-panel">
      <header className="chat-panel-heading">
        <h3 className="sidebar-heading chat-panel-title">{t('chat')}</h3>
        {unreadCount > 0 && (
          <span className="chat-unread-badge" aria-label={t('chatUnread', { count: unreadCount })}>
            {unreadCount}
          </span>
        )}
        <button
          type="button"
          className="chat-collapse-btn"
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? t('chatExpand') : t('chatCollapse')}
        >
          {isCollapsed ? '«' : '»'}
        </button>
      </header>
      <ChatMessageList viewerPlayerId={viewerPlayerId} />
      <ChatComposer onSend={onSend} />
    </section>
  )
}
