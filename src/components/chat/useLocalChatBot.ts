import { useEffect, useRef } from 'react'
import { useChatStore } from '../../store/chatStore'
import { systemRandom } from '../../game/engine/random'
import { defaultLocale } from '../../i18n'
import { botLines } from './botLines'
import { pickBotAuthor, pickBotLine, type LocalChatPlayer } from './localChatBot'
import { createMessageId } from './messageId'

const MIN_DELAY_MS = 12_000
const MAX_DELAY_MS = 25_000

function nextDelay(): number {
  return MIN_DELAY_MS + systemRandom.next() * (MAX_DELAY_MS - MIN_DELAY_MS)
}

/**
 * Local hot-seat play has no real peer to chat with, so this fakes one: a
 * jittered timer posts a line as a random OTHER local player, straight into
 * chatStore (no socket — there is nothing to relay). `enabled` must be false
 * in online mode; the timer is not allowed to run alongside a real transport.
 */
export function useLocalChatBot(options: {
  enabled: boolean
  players: LocalChatPlayer[]
  excludeId: string
  isFinished: boolean
}) {
  const { enabled, players, excludeId, isFinished } = options
  const append = useChatStore((state) => state.append)
  // Refs, not state: a timer id is bookkeeping for cleanup, not something a
  // render should ever depend on.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const playersRef = useRef(players)
  playersRef.current = players
  const excludeIdRef = useRef(excludeId)
  excludeIdRef.current = excludeId

  useEffect(() => {
    if (!enabled || isFinished) return

    let cancelled = false

    const postAndReschedule = () => {
      if (cancelled) return
      const author = pickBotAuthor(playersRef.current, excludeIdRef.current, systemRandom)
      if (author) {
        const lines = botLines[defaultLocale]
        append({
          kind: 'text',
          id: createMessageId(),
          author,
          sentAt: Date.now(),
          text: pickBotLine(lines, systemRandom),
        })
      }
      timeoutRef.current = setTimeout(postAndReschedule, nextDelay())
    }

    timeoutRef.current = setTimeout(postAndReschedule, nextDelay())

    return () => {
      cancelled = true
      clearTimeout(timeoutRef.current)
    }
  }, [enabled, isFinished, append])
}
