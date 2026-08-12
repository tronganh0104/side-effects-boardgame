import { describe, expect, it } from 'vitest'
import { parseChatSendPayload } from '../chat/parseChatPayload'

describe('chat payload validation', () => {
  it('rejects a non-object payload', () => {
    expect(() => parseChatSendPayload(null)).toThrow('Invalid request payload')
  })

  it('rejects a missing text field', () => {
    expect(() => parseChatSendPayload({})).toThrow('Invalid text')
  })

  it('rejects a non-string text field', () => {
    expect(() => parseChatSendPayload({ text: 42 })).toThrow('Invalid text')
  })

  it('rejects an empty string', () => {
    expect(() => parseChatSendPayload({ text: '' })).toThrow('Invalid text')
  })

  it('rejects a whitespace-only string', () => {
    expect(() => parseChatSendPayload({ text: '   ' })).toThrow('Invalid text')
  })

  it('rejects text longer than 300 characters', () => {
    expect(() => parseChatSendPayload({ text: 'a'.repeat(301) })).toThrow(
      'Invalid text',
    )
  })

  it('accepts text of exactly 300 characters', () => {
    const text = 'a'.repeat(300)
    expect(parseChatSendPayload({ text })).toEqual({ text })
  })

  it('trims valid input', () => {
    expect(parseChatSendPayload({ text: '  hello there  ' })).toEqual({
      text: 'hello there',
    })
  })
})
