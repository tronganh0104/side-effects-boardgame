export const CHAT_TEXT_MAX_LENGTH = 300

/**
 * `author` is a snapshot, not a `playerId` to look up later: chat history lives
 * only in the browser, and a sender can leave the room before a reader scrolls
 * back to their message. A later `room.players` lookup would return undefined,
 * so the display name has to travel with the message.
 *
 * `id` and `sentAt` are never accepted from the client: a client-supplied value
 * would let it forge ordering (`sentAt`) or identity (`id`). Both are stamped by
 * the server that relays the message.
 */
export interface ChatAuthor {
  playerId: string
  displayName: string
}

export interface ChatTextMessage {
  kind: 'text'
  id: string
  author: ChatAuthor
  sentAt: number
  text: string
}

/**
 * System log messages injected into the chat timeline. Never sent from a
 * client or relayed by the server chat gateway — they are created locally
 * by `appendSystemMessage` (chatStore) from game log strings, so they have
 * no `author` and are not counted as unread (players don't need a badge
 * for their own actions appearing in the feed).
 */
export interface ChatSystemMessage {
  kind: 'system'
  id: string
  sentAt: number
  text: string
}

// Union grows one variant at a time: trade offer comes next, system log is here now.
export type ChatMessage = ChatTextMessage | ChatSystemMessage
