import { describe, expect, it } from 'vitest'
import { pickBotAuthor, pickBotLine } from '../../components/chat/localChatBot'
import type { RandomSource } from '../engine/random'

function fixedRandom(value: number): RandomSource {
  return { next: () => value }
}

describe('pickBotLine', () => {
  const lines = ['a', 'b', 'c', 'd']

  it('selects the expected index for a stubbed random', () => {
    expect(pickBotLine(lines, fixedRandom(0))).toBe('a')
    expect(pickBotLine(lines, fixedRandom(0.26))).toBe('b')
    expect(pickBotLine(lines, fixedRandom(0.99))).toBe('d')
  })

  it('returns an empty string for an empty pool', () => {
    expect(pickBotLine([], fixedRandom(0.5))).toBe('')
  })
})

describe('pickBotAuthor', () => {
  const players = [
    { id: 'p1', name: 'Ada' },
    { id: 'p2', name: 'Bo' },
    { id: 'p3', name: 'Cy' },
  ]

  it('never returns the excluded player', () => {
    expect(pickBotAuthor(players, 'p1', fixedRandom(0))).toEqual({
      playerId: 'p2',
      displayName: 'Bo',
    })
    expect(pickBotAuthor(players, 'p1', fixedRandom(0.99))).toEqual({
      playerId: 'p3',
      displayName: 'Cy',
    })
  })

  it('excludes the middle player when they are the current speaker', () => {
    expect(pickBotAuthor(players, 'p2', fixedRandom(0))).toEqual({
      playerId: 'p1',
      displayName: 'Ada',
    })
    expect(pickBotAuthor(players, 'p2', fixedRandom(0.99))).toEqual({
      playerId: 'p3',
      displayName: 'Cy',
    })
  })

  it('returns undefined when no other player exists', () => {
    const solo = [{ id: 'p1', name: 'Ada' }]
    expect(pickBotAuthor(solo, 'p1', fixedRandom(0.5))).toBeUndefined()
  })
})
