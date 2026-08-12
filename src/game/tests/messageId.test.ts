import { afterEach, describe, expect, it } from 'vitest'
import { createMessageId } from '../../components/chat/messageId'

describe('createMessageId', () => {
  const originalRandomUUID = crypto.randomUUID

  afterEach(() => {
    crypto.randomUUID = originalRandomUUID
  })

  it('uses crypto.randomUUID when it is available', () => {
    const id = createMessageId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('falls back to distinct ids when randomUUID is not callable', () => {
    // @ts-expect-error - simulating a non-secure context where randomUUID is undefined
    crypto.randomUUID = undefined

    const ids = new Set(Array.from({ length: 1000 }, () => createMessageId()))
    expect(ids.size).toBe(1000)
  })
})
