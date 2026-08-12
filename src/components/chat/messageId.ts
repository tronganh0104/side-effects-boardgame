// crypto.randomUUID only exists in a secure context (https, or localhost).
// This game is commonly hosted over plain http on a LAN IP (e.g.
// http://192.168.1.5:5173) so friends can join without TLS setup — there
// `window.crypto` exists but `randomUUID` is undefined, and calling it
// throws. The counter+timestamp fallback below only has to be unique within
// one tab's chat history (it backs React keys and future trade-offer
// correlation handles), never a secret, so it doesn't need crypto strength.
let fallbackCounter = 0

export function createMessageId(): string {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  fallbackCounter += 1
  return `local-${Date.now()}-${fallbackCounter}`
}
