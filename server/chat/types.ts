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

// A union from day one: the upcoming trade feature adds a `ChatTradeOfferMessage`
// variant here and a matching branch in the client's message renderer, without
// touching the transport or the store.
export type ChatMessage = ChatTextMessage
