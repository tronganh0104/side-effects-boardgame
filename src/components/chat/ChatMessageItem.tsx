import type { ChatMessage } from '../../../server/chat/types'

interface ChatMessageItemProps {
  message: ChatMessage
  /** Undefined only in the instant before a session is assigned; nothing then reads as "own". */
  viewerPlayerId?: string
}

function formatTime(sentAt: number): string {
  // A clock rendering, not a UI string, so this reads from the browser
  // locale directly rather than through t().
  return new Date(sentAt).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ChatMessageItem({ message, viewerPlayerId }: ChatMessageItemProps) {
  const isOwn = message.author.playerId === viewerPlayerId

  // Switch on `kind`, not an if/else: this is the extension point for the
  // trade feature, which adds a `ChatTradeOfferMessage` branch here without
  // touching ChatMessageList, ChatPanel, or the store.
  switch (message.kind) {
    case 'text':
      return (
        <div className={`chat-message ${isOwn ? 'chat-message-own' : ''}`}>
          <div className="chat-message-meta">
            <span className="chat-message-author">{message.author.displayName}</span>
            <span className="chat-message-time">{formatTime(message.sentAt)}</span>
          </div>
          <p className="chat-message-text">{message.text}</p>
        </div>
      )
    default:
      return null
  }
}
