import { useEffect, useRef } from 'react'

interface GameLogListProps {
  entries: string[]
  /** Keeps only the most recent n entries; omit to show all. */
  limit?: number
}

/**
 * Splits a log line on its `**…**` emphasis markers. The log is a plain string
 * because it crosses the socket and is persisted; this is the only place that
 * interprets the markers.
 */
function renderEntry(entry: string) {
  return entry.split(/\*\*(.+?)\*\*/g).map((part, index) =>
    index % 2 === 1 ? <strong key={index}>{part}</strong> : part,
  )
}

export function GameLogList({ entries, limit }: GameLogListProps) {
  const listRef = useRef<HTMLOListElement>(null)
  const recent = limit === undefined ? entries : entries.slice(-limit)

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    // Follow the newest entry, but only when the reader is already near the
    // bottom — otherwise scrolling up to read history would be yanked away.
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight
    if (distanceFromBottom < 80) list.scrollTop = list.scrollHeight
  }, [recent.length])

  return (
    <ol className="game-log-list" ref={listRef}>
      {recent.map((entry, index) => (
        <li key={`${entry}-${index}`}>{renderEntry(entry)}</li>
      ))}
    </ol>
  )
}
