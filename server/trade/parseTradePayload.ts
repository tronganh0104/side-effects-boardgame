type UnknownRecord = Record<string, unknown>

// Re-implemented locally rather than imported: registerSocketHandlers.ts owns
// its requireRecord/requireString pair, and server/chat/parseChatPayload.ts
// owns its own copy too. Trade must not depend on either.
function requireRecord(payload: unknown): UnknownRecord {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('Yêu cầu không hợp lệ.')
  return payload as UnknownRecord
}

function requireString(
  record: UnknownRecord,
  key: string,
  maxLength = 256,
): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength)
    throw new Error(`Trường ${key} không hợp lệ.`)
  return value
}

export function parseTradeInvitePayload(payload: unknown): {
  targetPlayerId: string
} {
  const record = requireRecord(payload)
  return { targetPlayerId: requireString(record, 'targetPlayerId') }
}

export function parseTradePlacePayload(payload: unknown): {
  cardInstanceId: string
} {
  const record = requireRecord(payload)
  return { cardInstanceId: requireString(record, 'cardInstanceId') }
}
