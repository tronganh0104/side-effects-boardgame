import type { CardType } from '../../game/cards/types'

// One baked face per distinct card (definitions.ts has 17 distinct
// definitionIds; copies of the same card share a face). Globbing instead of
// a hand-written url() per id means adding a card's art later is just
// dropping a file in src/assets/cards/ — Vite still hashes and bundles it
// correctly through the asset pipeline (eager + import:'default' resolves
// each match to its built URL string at module-eval time, no runtime fetch).
const facesBySize = {
  512: import.meta.glob('../../assets/cards/*-512.webp', {
    eager: true,
    import: 'default',
  }) as Record<string, string>,
  1024: import.meta.glob('../../assets/cards/*-1024.webp', {
    eager: true,
    import: 'default',
  }) as Record<string, string>,
}

// Pre-per-card template art (src/assets/card-{type}-*.webp) — the four
// generic frames every card used before per-card faces existed. Kept
// specifically as the fallback below, not deleted: see cardArtFor.
const templatesBySize = {
  512: import.meta.glob('../../assets/card-{drug,disorder,therapy,episode}-512.webp', {
    eager: true,
    import: 'default',
  }) as Record<string, string>,
  1024: import.meta.glob('../../assets/card-{drug,disorder,therapy,episode}-1024.webp', {
    eager: true,
    import: 'default',
  }) as Record<string, string>,
}

/** Strips the glob's directory prefix and the given suffix, leaving the id the filename was keyed by. */
function idFromFilename(path: string, suffix: string): string {
  const filename = path.slice(path.lastIndexOf('/') + 1)
  return filename.slice(0, -suffix.length)
}

function toIdMap(files: Record<string, string>, suffix: string): Map<string, string> {
  return new Map(
    Object.entries(files).map(([path, url]) => [idFromFilename(path, suffix), url]),
  )
}

const faces512 = toIdMap(facesBySize[512], '-512.webp')
const faces1024 = toIdMap(facesBySize[1024], '-1024.webp')
const templates512 = toIdMap(templatesBySize[512], '-512.webp')
const templates1024 = toIdMap(templatesBySize[1024], '-1024.webp')

export interface CardArt {
  /** CSS image-set() value, ready to assign to a --card-art custom property. */
  imageSet: string
  /** True when definitionId had no dedicated face and the per-type template was used instead. */
  isFallback: boolean
}

function imageSetFor(url512: string, url1024: string): string {
  return `image-set(url("${url512}") 1x, url("${url1024}") 2x)`
}

/**
 * Resolves the baked art for a card. Falls back to the old per-type template
 * (still shipped in src/assets/, see cards.css history) when a definitionId
 * has no dedicated face, so a missing asset degrades to a generic-but-correct
 * frame instead of a blank card face — a blank face in a card game hides that
 * card's rules from the player. Logs so the gap doesn't ship unnoticed.
 */
export function cardArtFor(definitionId: string, cardType: CardType): CardArt {
  const url512 = faces512.get(definitionId)
  const url1024 = faces1024.get(definitionId)
  if (url512 && url1024) {
    return { imageSet: imageSetFor(url512, url1024), isFallback: false }
  }

  console.error(
    `cardArtFor: missing baked art for definitionId "${definitionId}" — falling back to the generic "${cardType}" template.`,
  )
  const fallback512 = templates512.get(`card-${cardType}`)
  const fallback1024 = templates1024.get(`card-${cardType}`)
  if (!fallback512 || !fallback1024) {
    // Should be unreachable — the four template files ship with the repo —
    // but an empty image-set() would silently render nothing, so fail loud.
    throw new Error(`cardArtFor: no fallback template art for card type "${cardType}"`)
  }
  return { imageSet: imageSetFor(fallback512, fallback1024), isFallback: true }
}
