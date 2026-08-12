import { describe, expect, it } from 'vitest'
import type {
  CardInstance,
  DisorderDefinition,
  DrugDefinition,
  EpisodeDefinition,
} from '../cards/types'
import { episodeMutatesTargetHand, playEpisode } from '../engine/episode'
import type { RandomSource } from '../engine/random'
import { createGame } from '../engine/setup'
import {
  discardCard,
  drawForTurn,
  endTurn,
  registerCardPlayed,
} from '../engine/turns'

class SeededRandom implements RandomSource {
  private state: number

  constructor(seed: number) {
    this.state = seed
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0
    return this.state / 2 ** 32
  }
}

const drawnGame = () => {
  const game = createGame(['Ada', 'Ben'], { rng: new SeededRandom(80) })
  return drawForTurn(game, game.currentPlayerId, { rng: new SeededRandom(81) })
}

const attacker = (game: ReturnType<typeof drawnGame>) =>
  game.players[game.currentPlayerIndex]
const target = (game: ReturnType<typeof drawnGame>) =>
  game.players.find((player) => player.id !== game.currentPlayerId)!

function moveToAttackerHand<T extends CardInstance>(
  game: ReturnType<typeof drawnGame>,
  card: T,
) {
  const replacedCard = attacker(game).hand[0]
  return {
    ...game,
    players: game.players.map((player, index) =>
      index === game.currentPlayerIndex
        ? { ...player, hand: [card, ...player.hand.slice(1)] }
        : player,
    ),
    drawPile: [
      replacedCard,
      ...game.drawPile.filter(
        (candidate) => candidate.instanceId !== card.instanceId,
      ),
    ],
  }
}

function episodeScenario(
  disorderDefinitionId: DisorderDefinition['definitionId'],
) {
  const game = drawnGame()
  const victim = target(game)
  const disorder = game.drawPile.find(
    (card): card is CardInstance<DisorderDefinition> =>
      card.cardType === 'disorder' &&
      card.definitionId === disorderDefinitionId,
  )!
  const displacedDisorder = victim.psyche.slots[0].disorder
  const withTargetDisorder = {
    ...game,
    players: game.players.map((player) =>
      player.id === victim.id
        ? {
            ...player,
            psyche: {
              slots: player.psyche.slots.map((slot, index) =>
                index === 0 ? { disorder } : slot,
              ),
            },
          }
        : player,
    ),
    drawPile: [
      displacedDisorder,
      ...game.drawPile.filter(
        (card) => card.instanceId !== disorder.instanceId,
      ),
    ],
  }
  const episode = withTargetDisorder.drawPile.find(
    (card): card is CardInstance<EpisodeDefinition> =>
      card.cardType === 'episode',
  )!
  return {
    game: moveToAttackerHand(withTargetDisorder, episode),
    episode,
    disorder,
    targetId: victim.id,
  }
}

function addDrugToTargetSlot(
  game: ReturnType<typeof drawnGame>,
  targetId: string,
  slotIndex: number,
) {
  const victim = game.players.find((player) => player.id === targetId)!
  const slot = victim.psyche.slots[slotIndex]
  const drug = game.drawPile.find(
    (card): card is CardInstance<DrugDefinition> =>
      card.cardType === 'drug' && card.treats === slot.disorder.definitionId,
  )!

  return {
    ...game,
    players: game.players.map((player) =>
      player.id === targetId
        ? {
            ...player,
            psyche: {
              slots: player.psyche.slots.map((candidate, index) =>
                index === slotIndex ? { ...candidate, drug } : candidate,
              ),
            },
          }
        : player,
    ),
    drawPile: game.drawPile.filter(
      (card) => card.instanceId !== drug.instanceId,
    ),
  }
}

const allCards = (game: ReturnType<typeof drawnGame>) => [
  ...game.players.flatMap((player) => [
    ...player.psyche.slots.flatMap((slot) =>
      slot.drug ? [slot.disorder, slot.drug] : [slot.disorder],
    ),
    ...player.hand,
  ]),
  ...game.drawPile,
  ...game.discardPile,
]

describe('Episode', () => {
  it('classifies only hand-mutating Episodes for trade teardown', () => {
    expect(episodeMutatesTargetHand('madness')).toBe(false)
    expect(episodeMutatesTargetHand('suicidal-thoughts')).toBe(true)
    expect(episodeMutatesTargetHand('depression')).toBe(false)
    expect(episodeMutatesTargetHand('tremors')).toBe(true)
    expect(episodeMutatesTargetHand('gambling-addiction')).toBe(true)
    expect(episodeMutatesTargetHand('anxiety')).toBe(true)
    expect(episodeMutatesTargetHand('impotence')).toBe(false)
    expect(episodeMutatesTargetHand('anorexia')).toBe(false)
  })
  it('rejects treated targets and invalid general commands', () => {
    const scenario = episodeScenario('madness')
    const treated = addDrugToTargetSlot(scenario.game, scenario.targetId, 0)
    const otherPlayerId = target(scenario.game).id

    expect(() =>
      playEpisode(
        treated,
        treated.currentPlayerId,
        scenario.episode.instanceId,
        scenario.targetId,
        scenario.disorder.instanceId,
      ),
    ).toThrow('treated Disorder')
    expect(() =>
      playEpisode(
        scenario.game,
        scenario.targetId,
        scenario.episode.instanceId,
        scenario.targetId,
        scenario.disorder.instanceId,
      ),
    ).toThrow('current player')
    expect(() =>
      playEpisode(
        scenario.game,
        scenario.game.currentPlayerId,
        scenario.episode.instanceId,
        scenario.game.currentPlayerId,
        scenario.disorder.instanceId,
      ),
    ).toThrow('cannot target themself')
    expect(() =>
      playEpisode(
        { ...scenario.game, turn: { ...scenario.game.turn, phase: 'draw' } },
        scenario.game.currentPlayerId,
        scenario.episode.instanceId,
        scenario.targetId,
        scenario.disorder.instanceId,
      ),
    ).toThrow('play phase')
    expect(() =>
      playEpisode(
        scenario.game,
        scenario.game.currentPlayerId,
        'missing',
        scenario.targetId,
        scenario.disorder.instanceId,
      ),
    ).toThrow('not in the current player hand')
    expect(() =>
      playEpisode(
        {
          ...scenario.game,
          turn: { ...scenario.game.turn, cardsPlayedThisTurn: 2 },
        },
        scenario.game.currentPlayerId,
        scenario.episode.instanceId,
        scenario.targetId,
        scenario.disorder.instanceId,
      ),
    ).toThrow('at most two')
    expect(otherPlayerId).not.toBe(scenario.game.currentPlayerId)
  })

  it('Madness discards every target Drug while keeping Disorders untreated', () => {
    const scenario = episodeScenario('madness')
    const oneDrug = addDrugToTargetSlot(scenario.game, scenario.targetId, 1)
    const prepared = addDrugToTargetSlot(oneDrug, scenario.targetId, 2)
    const result = playEpisode(
      prepared,
      prepared.currentPlayerId,
      scenario.episode.instanceId,
      scenario.targetId,
      scenario.disorder.instanceId,
    )
    const victim = result.players.find(
      (player) => player.id === scenario.targetId,
    )!

    expect(victim.psyche.slots).toHaveLength(4)
    expect(victim.psyche.slots.every((slot) => !slot.drug)).toBe(true)
    expect(
      result.discardPile.filter((card) => card.cardType === 'drug'),
    ).toHaveLength(2)
    expect(
      result.discardPile.some(
        (card) => card.instanceId === scenario.episode.instanceId,
      ),
    ).toBe(true)
    expect(result.turn.cardsPlayedThisTurn).toBe(1)
  })

  it('Suicidal Thoughts discards the entire target hand, including an empty hand safely', () => {
    const scenario = episodeScenario('suicidal-thoughts')
    const originalHand = target(scenario.game).hand
    const result = playEpisode(
      scenario.game,
      scenario.game.currentPlayerId,
      scenario.episode.instanceId,
      scenario.targetId,
      scenario.disorder.instanceId,
    )

    expect(target(result).hand).toEqual([])
    expect(result.discardPile).toEqual(expect.arrayContaining(originalHand))

    const emptyHand = {
      ...scenario.game,
      players: scenario.game.players.map((player) =>
        player.id === scenario.targetId ? { ...player, hand: [] } : player,
      ),
      drawPile: [...scenario.game.drawPile, ...originalHand],
    }
    expect(() =>
      playEpisode(
        emptyHand,
        emptyHand.currentPlayerId,
        scenario.episode.instanceId,
        scenario.targetId,
        scenario.disorder.instanceId,
      ),
    ).not.toThrow()
  })

  it('Gambling Addiction steals up to three random cards deterministically', () => {
    const firstScenario = episodeScenario('gambling-addiction')
    const secondScenario = episodeScenario('gambling-addiction')
    const first = playEpisode(
      firstScenario.game,
      firstScenario.game.currentPlayerId,
      firstScenario.episode.instanceId,
      firstScenario.targetId,
      firstScenario.disorder.instanceId,
      { rng: new SeededRandom(99) },
    )
    const second = playEpisode(
      secondScenario.game,
      secondScenario.game.currentPlayerId,
      secondScenario.episode.instanceId,
      secondScenario.targetId,
      secondScenario.disorder.instanceId,
      { rng: new SeededRandom(99) },
    )

    expect(target(first).hand).toHaveLength(1)
    expect(attacker(first).hand).toHaveLength(8)
    expect(first).toEqual(second)

    const shortHand = {
      ...firstScenario.game,
      players: firstScenario.game.players.map((player) =>
        player.id === firstScenario.targetId
          ? { ...player, hand: player.hand.slice(0, 2) }
          : player,
      ),
    }
    const shortResult = playEpisode(
      shortHand,
      shortHand.currentPlayerId,
      firstScenario.episode.instanceId,
      firstScenario.targetId,
      firstScenario.disorder.instanceId,
      { rng: new SeededRandom(5) },
    )
    expect(target(shortResult).hand).toEqual([])
  })

  it('Anxiety transfers a chosen card and validates selection; empty hand is allowed', () => {
    const scenario = episodeScenario('anxiety')
    const chosenCard = target(scenario.game).hand[0]
    const result = playEpisode(
      scenario.game,
      scenario.game.currentPlayerId,
      scenario.episode.instanceId,
      scenario.targetId,
      scenario.disorder.instanceId,
      { chosenCardId: chosenCard.instanceId },
    )

    expect(
      attacker(result).hand.some(
        (card) => card.instanceId === chosenCard.instanceId,
      ),
    ).toBe(true)
    expect(
      target(result).hand.some(
        (card) => card.instanceId === chosenCard.instanceId,
      ),
    ).toBe(false)
    expect(() =>
      playEpisode(
        scenario.game,
        scenario.game.currentPlayerId,
        scenario.episode.instanceId,
        scenario.targetId,
        scenario.disorder.instanceId,
        { chosenCardId: 'missing' },
      ),
    ).toThrow('not in the target player hand')

    const targetHand = target(scenario.game).hand
    const emptyHand = {
      ...scenario.game,
      players: scenario.game.players.map((player) =>
        player.id === scenario.targetId ? { ...player, hand: [] } : player,
      ),
      drawPile: [...scenario.game.drawPile, ...targetHand],
    }
    expect(() =>
      playEpisode(
        emptyHand,
        emptyHand.currentPlayerId,
        scenario.episode.instanceId,
        scenario.targetId,
        scenario.disorder.instanceId,
      ),
    ).not.toThrow()
  })

  it('conserves all 89 physical cards after an Episode', () => {
    const scenario = episodeScenario('madness')
    const prepared = addDrugToTargetSlot(scenario.game, scenario.targetId, 1)
    const result = playEpisode(
      prepared,
      prepared.currentPlayerId,
      scenario.episode.instanceId,
      scenario.targetId,
      scenario.disorder.instanceId,
    )
    const cards = allCards(result)

    expect(cards).toHaveLength(89)
    expect(new Set(cards.map((card) => card.instanceId)).size).toBe(89)
  })

  it('Depression skips the target full next turn without consuming partial effects', () => {
    const scenario = episodeScenario('depression')
    const played = playEpisode(
      scenario.game,
      scenario.game.currentPlayerId,
      scenario.episode.instanceId,
      scenario.targetId,
      scenario.disorder.instanceId,
    )
    const withPartialEffects = {
      ...played,
      players: played.players.map((player) =>
        player.id === scenario.targetId
          ? {
              ...player,
              effects: {
                ...player.effects,
                skipDrawTurns: 1,
                cannotPlayTurns: 1,
              },
            }
          : player,
      ),
    }
    const afterSkip = endTurn(
      withPartialEffects,
      withPartialEffects.currentPlayerId,
    )
    const skippedPlayer = afterSkip.players.find(
      (player) => player.id === scenario.targetId,
    )!

    expect(skippedPlayer.effects.skipTurns).toBe(0)
    expect(skippedPlayer.effects.skipDrawTurns).toBe(1)
    expect(skippedPlayer.effects.cannotPlayTurns).toBe(1)
    expect(afterSkip.currentPlayerId).toBe(withPartialEffects.currentPlayerId)
  })

  it('Impotence allows draw, end, and discard but blocks card play for one turn', () => {
    const scenario = episodeScenario('impotence')
    const played = playEpisode(
      scenario.game,
      scenario.game.currentPlayerId,
      scenario.episode.instanceId,
      scenario.targetId,
      scenario.disorder.instanceId,
    )
    const targetTurn = endTurn(played, played.currentPlayerId)
    const afterDraw = drawForTurn(targetTurn, targetTurn.currentPlayerId)
    const nonDrug = attacker(afterDraw).hand.find(
      (card) => card.cardType !== 'drug',
    )!

    expect(afterDraw.turn.phase).toBe('play')
    expect(() =>
      registerCardPlayed(
        afterDraw,
        afterDraw.currentPlayerId,
        nonDrug.instanceId,
      ),
    ).toThrow('cannot play cards')

    const overflow = {
      ...afterDraw,
      players: afterDraw.players.map((player, index) =>
        index === afterDraw.currentPlayerIndex
          ? { ...player, hand: [...player.hand, afterDraw.drawPile[0]] }
          : player,
      ),
      drawPile: afterDraw.drawPile.slice(1),
    }
    const discardPhase = endTurn(overflow, overflow.currentPlayerId)
    const afterDiscard = discardCard(
      discardPhase,
      discardPhase.currentPlayerId,
      attacker(discardPhase).hand[0].instanceId,
    )
    const impaired = afterDiscard.players.find(
      (player) => player.id === scenario.targetId,
    )!

    expect(discardPhase.turn.phase).toBe('discard')
    expect(impaired.effects.cannotPlayTurns).toBe(0)
  })

  it('Anorexia skips draw but allows play, then restores normal drawing next turn', () => {
    const scenario = episodeScenario('anorexia')
    const played = playEpisode(
      scenario.game,
      scenario.game.currentPlayerId,
      scenario.episode.instanceId,
      scenario.targetId,
      scenario.disorder.instanceId,
    )
    const targetTurn = endTurn(played, played.currentPlayerId)
    const nonDrug = attacker(targetTurn).hand.find(
      (card) => card.cardType !== 'drug',
    )!
    const afterPlay = registerCardPlayed(
      targetTurn,
      targetTurn.currentPlayerId,
      nonDrug.instanceId,
    )
    const attackerTurn = endTurn(afterPlay, afterPlay.currentPlayerId)
    const attackerBeforeDraw = attacker(attackerTurn)
    const manageableAttackerTurn = {
      ...attackerTurn,
      players: attackerTurn.players.map((player, index) =>
        index === attackerTurn.currentPlayerIndex
          ? { ...player, hand: player.hand.slice(0, 4) }
          : player,
      ),
      drawPile: [...attackerTurn.drawPile, ...attackerBeforeDraw.hand.slice(4)],
    }
    const nextTargetTurn = endTurn(
      drawForTurn(
        manageableAttackerTurn,
        manageableAttackerTurn.currentPlayerId,
      ),
      manageableAttackerTurn.currentPlayerId,
    )
    const afterDraw = drawForTurn(
      nextTargetTurn,
      nextTargetTurn.currentPlayerId,
    )

    expect(targetTurn.turn.phase).toBe('play')
    expect(targetTurn.turn.cardsDrawnThisTurn).toBe(0)
    expect(afterPlay.turn.cardsPlayedThisTurn).toBe(1)
    expect(afterDraw.turn.cardsDrawnThisTurn).toBe(2)
  })

  it('combined skip draw and cannot-play resolve during the same turn', () => {
    const game = drawnGame()
    const nextIndex = (game.currentPlayerIndex + 1) % game.players.length
    const affectedId = game.players[nextIndex].id
    const prepared = {
      ...game,
      players: game.players.map((player) =>
        player.id === affectedId
          ? {
              ...player,
              effects: {
                ...player.effects,
                skipDrawTurns: 1,
                cannotPlayTurns: 1,
              },
            }
          : player,
      ),
    }
    const affectedTurn = endTurn(prepared, prepared.currentPlayerId)
    const nonDrug = attacker(affectedTurn).hand.find(
      (card) => card.cardType !== 'drug',
    )!

    expect(affectedTurn.turn.phase).toBe('play')
    expect(affectedTurn.turn.cardsDrawnThisTurn).toBe(0)
    expect(() =>
      registerCardPlayed(
        affectedTurn,
        affectedTurn.currentPlayerId,
        nonDrug.instanceId,
      ),
    ).toThrow('cannot play cards')
  })

  it('Tremors discards exactly three chosen cards and validates selections', () => {
    const scenario = episodeScenario('tremors')
    const chosenCards = target(scenario.game).hand.slice(0, 3)
    const result = playEpisode(
      scenario.game,
      scenario.game.currentPlayerId,
      scenario.episode.instanceId,
      scenario.targetId,
      scenario.disorder.instanceId,
      { tremorsDiscardCardIds: chosenCards.map((card) => card.instanceId) },
    )

    expect(target(result).hand).toHaveLength(1)
    expect(result.discardPile).toEqual(expect.arrayContaining(chosenCards))
    expect(() =>
      playEpisode(
        scenario.game,
        scenario.game.currentPlayerId,
        scenario.episode.instanceId,
        scenario.targetId,
        scenario.disorder.instanceId,
        {
          tremorsDiscardCardIds: [
            chosenCards[0].instanceId,
            chosenCards[0].instanceId,
            chosenCards[1].instanceId,
          ],
        },
      ),
    ).toThrow('unique')
    expect(() =>
      playEpisode(
        scenario.game,
        scenario.game.currentPlayerId,
        scenario.episode.instanceId,
        scenario.targetId,
        scenario.disorder.instanceId,
        {
          tremorsDiscardCardIds: [
            'missing',
            chosenCards[0].instanceId,
            chosenCards[1].instanceId,
          ],
        },
      ),
    ).toThrow('target player hand')
  })

  it('Tremors discards every card when target has fewer than three, including empty hand', () => {
    const scenario = episodeScenario('tremors')
    const originalHand = target(scenario.game).hand
    const shortHand = {
      ...scenario.game,
      players: scenario.game.players.map((player) =>
        player.id === scenario.targetId
          ? { ...player, hand: player.hand.slice(0, 2) }
          : player,
      ),
      drawPile: [...scenario.game.drawPile, ...originalHand.slice(2)],
    }
    const shortResult = playEpisode(
      shortHand,
      shortHand.currentPlayerId,
      scenario.episode.instanceId,
      scenario.targetId,
      scenario.disorder.instanceId,
    )
    expect(target(shortResult).hand).toEqual([])

    const emptyHand = {
      ...scenario.game,
      players: scenario.game.players.map((player) =>
        player.id === scenario.targetId ? { ...player, hand: [] } : player,
      ),
      drawPile: [...scenario.game.drawPile, ...originalHand],
    }
    expect(() =>
      playEpisode(
        emptyHand,
        emptyHand.currentPlayerId,
        scenario.episode.instanceId,
        scenario.targetId,
        scenario.disorder.instanceId,
      ),
    ).not.toThrow()
  })
})
