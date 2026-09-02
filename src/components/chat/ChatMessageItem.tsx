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

/**
 * Renders bold spans for **…** markers in system log lines — the same
 * convention GameLogList uses, applied here so card/player/disorder names
 * stay emphasised when they appear inline with chat bubbles.
 */
function renderSystemText(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, index) =>
    index % 2 === 1 ? <strong key={index}>{part}</strong> : part,
  )
}

export function ChatMessageItem({ message, viewerPlayerId }: ChatMessageItemProps) {
  // Switch on `kind`, not an if/else: this is the extension point for
  // system messages, trade offers, and any future variant — each branch
  // is self-contained and adding one never touches the others.
  switch (message.kind) {
    case 'text': {
      const isOwn = message.author.playerId === viewerPlayerId
      return (
        <div className={`chat-message ${isOwn ? 'chat-message-own' : ''}`}>
          <div className="chat-message-meta">
            <span className="chat-message-author">{message.author.displayName}</span>
            <span className="chat-message-time">{formatTime(message.sentAt)}</span>
          </div>
          <p className="chat-message-text">{message.text}</p>
        </div>
      )
    }
    case 'system':
      // System messages sit inline with chat bubbles but read as engine
      // narration, not player speech: no avatar, no name, slightly inset
      // and de-emphasised so players can scan past them when catching up
      // on conversation — but not invisible.
      return (
        <div className="chat-message chat-message-system" aria-label="Sự kiện ván chơi">
          <p className="chat-message-text chat-message-system-text">
            {renderSystemText(message.text)}
          </p>
        </div>
      )
    default:
      return null
  }
}
