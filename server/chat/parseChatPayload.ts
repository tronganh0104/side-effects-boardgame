import { CHAT_TEXT_MAX_LENGTH } from './types'

type UnknownRecord = Record<string, unknown>

// Re-implemented locally rather than imported: registerSocketHandlers.ts owns
// its requireRecord/requireString pair and is not this task's file to refactor.
function requireRecord(payload: unknown): UnknownRecord {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('Invalid request payload.')
  return payload as UnknownRecord
}

export function parseChatSendPayload(payload: unknown): { text: string } {
  const record = requireRecord(payload)
  const text = record.text
  if (
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > CHAT_TEXT_MAX_LENGTH
  )
    throw new Error('Invalid text.')
  return { text: text.trim() }
}
