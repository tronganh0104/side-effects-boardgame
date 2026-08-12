import { t } from '../../i18n'

// The card-back artwork bakes its own gold "SIDE EFFECTS" wordmark into the
// centre, so the label/count used to fight it when overlaid on top (see
// deck.css history). They render as a caption beside the artwork instead
// (deck.css positions it absolutely to the card's side, not below it, to
// keep the pile's HEIGHT down to just the card — see that file's
// .card-back-wrap/.card-back-caption comments): `.card-back` is purely the
// art (aria-hidden, no text), and the caption is a second, aria-hidden
// sibling — DOM order between them doesn't matter, since deck.css positions
// the caption absolutely rather than relying on flex/document order. The
// accessible name lives once, on the outermost wrapper, so screen readers
// announce it exactly once rather than once from the wrapper's aria-label
// and again from the caption's own text.
export function CardBack({ count, label }: { count: number; label: string }) {
  // count === 0 drives a `.card-back--empty` modifier (deck.css) so an empty
  // pile reads as an empty slot instead of a full card back captioned "0".
  // The aria-label/aria-hidden arrangement above this line is unchanged.
  const isEmpty = count === 0
  return (
    <div className="card-back-wrap" aria-label={`${label}: ${count}`}>
      <div className={`card-back${isEmpty ? ' card-back--empty' : ''}`} aria-hidden="true" />
      <span className="card-back-caption" aria-hidden="true">
        <small>{t('title')}</small>
        <strong>{count}</strong>
      </span>
    </div>
  )
}
