import { t } from '../i18n'

/**
 * The watched opponent's hand, mirrored from the viewer's own hand but face
 * down: one back per card so the count is readable at a glance instead of
 * only as a number in the avatar bar.
 */
export function OpponentHand({
  count,
  playerName,
  playerId,
}: {
  count: number
  playerName: string
  playerId: string
}) {
  return (
    <section
      className="hand opponent-hand"
      id={`opponent-hand-${playerId}`}
      aria-label={`${t('hand')} ${playerName}: ${count}`}
    >
      <div className="cards">
        {Array.from({ length: count }, (_, index) => (
          <div className="facedown-card" key={index} aria-hidden="true" />
        ))}
      </div>
    </section>
  )
}
