import { describe, expect, it } from 'vitest'
import { useChatStore } from '../../store/chatStore'
import type { ChatMessage } from '../../../server/chat/types'

function resetStore() {
  useChatStore.getState().reset()
}

function textMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    kind: 'text',
    id: 'msg-1',
    author: { playerId: 'p1', displayName: 'Ada' },
    sentAt: Date.now(),
    text: 'hello',
    ...overrides,
  }
}

describe('chatStore', () => {
  it('appends a message', () => {
    resetStore()
    useChatStore.getState().append(textMessage())

    expect(useChatStore.getState().messages).toHaveLength(1)
    expect(useChatStore.getState().messages[0].text).toBe('hello')
  })

  it('increments unreadCount on append', () => {
    resetStore()
    useChatStore.getState().append(textMessage({ id: 'msg-1' }))
    useChatStore.getState().append(textMessage({ id: 'msg-2' }))

    expect(useChatStore.getState().unreadCount).toBe(2)
  })

  it('zeroes unreadCount on markRead', () => {
    resetStore()
    useChatStore.getState().append(textMessage())
    useChatStore.getState().markRead()

    expect(useChatStore.getState().unreadCount).toBe(0)
  })

  it('flips isCollapsed on toggleCollapsed', () => {
    resetStore()
    expect(useChatStore.getState().isCollapsed).toBe(false)

    useChatStore.getState().toggleCollapsed()
    expect(useChatStore.getState().isCollapsed).toBe(true)

    useChatStore.getState().toggleCollapsed()
    expect(useChatStore.getState().isCollapsed).toBe(false)
  })

  it('clears messages and unreadCount on reset', () => {
    resetStore()
    useChatStore.getState().append(textMessage())
    useChatStore.getState().reset()

    expect(useChatStore.getState().messages).toEqual([])
    expect(useChatStore.getState().unreadCount).toBe(0)
  })
})
