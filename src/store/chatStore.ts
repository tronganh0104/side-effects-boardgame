import { create } from 'zustand'
import type { ChatMessage } from '../../server/chat/types'

interface ChatStore {
  messages: ChatMessage[]
  unreadCount: number
  isCollapsed: boolean // desktop sidebar collapse only — the mobile drawer's open state lives in GameBoard's local useState, matching showLog
  append: (message: ChatMessage) => void
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
  markRead: () => set({ unreadCount: 0 }),
  toggleCollapsed: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
  reset: () => set({ messages: [], unreadCount: 0 }),
}))
