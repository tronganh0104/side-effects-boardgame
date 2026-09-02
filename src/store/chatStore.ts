import { create } from 'zustand'
import type { ChatMessage, ChatSystemMessage } from '../../server/chat/types'
import { createMessageId } from '../components/chat/messageId'

interface ChatStore {
  messages: ChatMessage[]
  unreadCount: number
  isCollapsed: boolean // desktop sidebar collapse only — the mobile drawer's open state lives in GameBoard's local useState, matching showLog
  append: (message: ChatMessage) => void
  /**
   * Injects a system log line into the chat timeline without bumping the
   * unread badge — these narrate the game the player is already watching,
   * so they are informational context, not new incoming messages that
   * demand attention. The caller supplies only the text; id and sentAt are
   * stamped here so callers don't have to import messageId.
   */
  appendSystemMessage: (text: string) => void
  markRead: () => void
  toggleCollapsed: () => void
  reset: () => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  unreadCount: 0,
  isCollapsed: false,
  // Deliberately uncapped, unlike gameStore.gameLog's .slice(-30): the server
  // is a pure relay and stores nothing, so this array is the only copy of
  // chat history that exists anywhere. Capping it would throw away history
  // the player can never recover, and there is no server memory to protect
  // by doing so — an unbounded history costs the server nothing.
  append: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
      unreadCount: state.unreadCount + 1,
    })),
  appendSystemMessage: (text) => {
    const message: ChatSystemMessage = {
      kind: 'system',
      id: createMessageId(),
      sentAt: Date.now(),
      text,
    }
    set((state) => ({
      messages: [...state.messages, message],
      // Intentionally NOT incrementing unreadCount: system messages narrate
      // the game the player is already watching; they are context, not new
      // incoming chat that demands a badge.
    }))
  },
  markRead: () => set({ unreadCount: 0 }),
  toggleCollapsed: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
  reset: () => set({ messages: [], unreadCount: 0 }),
}))
