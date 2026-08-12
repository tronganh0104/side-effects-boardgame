import { useEffect, useRef } from 'react'
import { useChatStore } from '../../store/chatStore'
import { t } from '../../i18n'
import { ChatMessageItem } from './ChatMessageItem'

interface ChatMessageListProps {
  viewerPlayerId?: string
}

export function ChatMessageList({ viewerPlayerId }: ChatMessageListProps) {
  const messages = useChatStore((state) => state.messages)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    // Same rule as GameLogList: only follow the newest message when the
    // reader is already near the bottom, otherwise scrolling up to re-read a
    // trade offer would get yanked back down by the next incoming message.
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight
    if (distanceFromBottom < 80) list.scrollTop = list.scrollHeight
  }, [messages.length])

  if (messages.length === 0) {
    return <p className="chat-empty">{t('chatEmpty')}</p>
  }

  return (
    <div className="chat-message-list" ref={listRef}>
      {messages.map((message) => (
        <ChatMessageItem key={message.id} message={message} viewerPlayerId={viewerPlayerId} />
      ))}
    </div>
  )
}
