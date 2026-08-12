import { describe, expect, it } from 'vitest'
import type { GameCommand } from '../../../server/game/commands'
import { cardName, disorderName, t } from '../../i18n'
import type {
  CardInstance,
  DisorderDefinition,
  DrugDefinition,
  EpisodeDefinition,
  TherapyDefinition,
} from '../cards/types'
import type { GameState, PlayerState } from '../engine/types'
import { describeCommand } from '../log/describeCommand'

function disorderCard(
  definitionId: DisorderDefinition['definitionId'],
  instanceId: string,
  displayName: string = definitionId,
): CardInstance<DisorderDefinition> {
  return {
    definitionId,
    cardType: 'disorder',
    displayName,
    episodeEffect: { kind: 'disorder-specific' },
    therapyAllowed: true,
    instanceId,
  }
}

function drugCard(
  treats: DrugDefinition['treats'],
  instanceId: string,
  displayName: string,
): CardInstance<DrugDefinition> {
  return {
    definitionId: `${treats}-treatment`,
    cardType: 'drug',
    displayName,
    treats,
    sideEffects: [],
    instanceId,
  }
}

function episodeCard(instanceId: string): CardInstance<EpisodeDefinition> {
  return {
    definitionId: 'episode',
    cardType: 'episode',
    displayName: 'Episode',
    instanceId,
  }
}

function therapyCard(instanceId: string): CardInstance<TherapyDefinition> {
  return {
    definitionId: 'therapy',
    cardType: 'therapy',
    displayName: 'Therapy',
    instanceId,
  }
}

function player(overrides: Partial<PlayerState> & { id: string; name: string }): PlayerState {
  return {
    hand: [],
    psyche: { slots: [] },
    effects: { skipTurns: 0, cannotPlayTurns: 0, skipDrawTurns: 0 },
    tradeUsedThisTurn: false,
    ...overrides,
  }
}

/**
 * A two-player fixture with enough hand and Psyche detail to exercise every
 * command type: Alice can play a Drug on her own untreated Depression, play
 * an Anxiety Disorder card from hand onto Bob, play an Episode against Bob's
 * untreated Gambling addiction, use Therapy on her own untreated Madness,
 * and discard a spare Tremors card.
 */
function baseGame(): GameState {
  const alice = player({
    id: 'p1',
    name: 'Alice',
    hand: [
      drugCard('depression', 'drug-dep', 'Fluoxetine'),
      disorderCard('anxiety', 'disorder-anxiety-hand'),
      episodeCard('episode-1'),
      therapyCard('therapy-1'),
      disorderCard('tremors', 'extra-card', 'Spare Tremors Card'),
    ],
    psyche: {
      slots: [
        { disorder: disorderCard('depression', 'psyche-dep') },
        { disorder: disorderCard('madness', 'psyche-madness') },
      ],
    },
  })
  const bob = player({
    id: 'p2',
    name: 'Bob',
    hand: [disorderCard('impotence', 'bob-hand-card', 'Bob Secret Card')],
    psyche: {
      slots: [
        { disorder: disorderCard('gambling-addiction', 'psyche-target-gambling') },
      ],
    },
  })

  return {
    players: [alice, bob],
    drawPile: [],
    discardPile: [],
    currentPlayerIndex: 0,
    currentPlayerId: 'p1',
    turnNumber: 1,
    turn: {
      number: 1,
      currentPlayerId: 'p1',
      phase: 'play',
      cardsPlayedThisTurn: 0,
      cardsDrawnThisTurn: 0,
    },
    status: 'playing',
  }
}

describe('describeCommand', () => {
  const commandsByType: Record<GameCommand['type'], GameCommand> = {
    draw: { type: 'draw' },
    forfeit: { type: 'forfeit' },
    playDrug: {
      type: 'playDrug',
      drugCardId: 'drug-dep',
      disorderCardId: 'psyche-dep',
    },
    playDisorder: {
      type: 'playDisorder',
      disorderCardId: 'disorder-anxiety-hand',
      targetPlayerId: 'p2',
    },
    playEpisode: {
      type: 'playEpisode',
      episodeCardId: 'episode-1',
      targetPlayerId: 'p2',
      targetDisorderCardId: 'psyche-target-gambling',
    },
    playTherapy: {
      type: 'playTherapy',
      therapyCardId: 'therapy-1',
      disorderCardId: 'psyche-madness',
    },
    discard: { type: 'discard', cardInstanceId: 'extra-card' },
    discardManual: { type: 'discardManual', cardInstanceId: 'extra-card' },
    endTurn: { type: 'endTurn' },
    tradeCards: {
      type: 'tradeCards',
      initiatorPlayerId: 'p1',
      initiatorCardId: 'drug-dep',
      partnerPlayerId: 'p2',
      partnerCardId: 'bob-hand-card',
    },
  }

  // tradeCards deliberately breaks the "actor" convention: unlike every other
  // command, both parties' names are emphasised (see the anti-leak tests
  // below), so it is excluded from the two generic actor-emphasis checks.
  const commandsWithConventionalActor = Object.values(commandsByType).filter(
    (command) => command.type !== 'tradeCards',
  )

  it('names the actor for every command type', () => {
    const before = baseGame()
    for (const command of commandsWithConventionalActor) {
      const line = describeCommand(before, command, before)
      expect(line).toContain('Alice')
    }
  })

  it('never wraps the actor name in emphasis markers', () => {
    const before = baseGame()
    for (const command of commandsWithConventionalActor) {
      const line = describeCommand(before, command, before)
      expect(line).not.toContain('**Alice**')
    }
  })

  it('names both the drug and the treated disorder for playDrug', () => {
    const before = baseGame()
    const line = describeCommand(before, commandsByType.playDrug, before)
    expect(line).toContain('Fluoxetine')
    expect(line).toContain(disorderName('depression'))
  })

  it('emphasises the drug and the treated disorder for playDrug', () => {
    const before = baseGame()
    const line = describeCommand(before, commandsByType.playDrug, before)
    expect(line).toContain('**Fluoxetine**')
    expect(line).toContain(`**${disorderName('depression')}**`)
  })

  it('names the disorder and the target player for playDisorder', () => {
    const before = baseGame()
    const line = describeCommand(before, commandsByType.playDisorder, before)
    expect(line).toContain(disorderName('anxiety'))
    expect(line).toContain('Bob')
  })

  it('emphasises the disorder and the target player for playDisorder', () => {
    const before = baseGame()
    const line = describeCommand(before, commandsByType.playDisorder, before)
    expect(line).toContain(`**${disorderName('anxiety')}**`)
    expect(line).toContain('**Bob**')
  })

  it('names the therapy card and the removed disorder for playTherapy', () => {
    const before = baseGame()
    const line = describeCommand(before, commandsByType.playTherapy, before)
    expect(line).toContain(cardName('therapy', 'Therapy'))
    expect(line).toContain(disorderName('madness'))
  })

  it('emphasises the therapy card for playTherapy', () => {
    const before = baseGame()
    const line = describeCommand(before, commandsByType.playTherapy, before)
    expect(line).toContain(`**${cardName('therapy', 'Therapy')}**`)
  })

  it("names the episode card, the target's disorder, and the target player for playEpisode", () => {
    const before = baseGame()
    const line = describeCommand(before, commandsByType.playEpisode, before)
    expect(line).toContain(cardName('episode', 'Episode'))
    expect(line).toContain(disorderName('gambling-addiction'))
    expect(line).toContain('Bob')
  })

  it('emphasises the episode card for playEpisode', () => {
    const before = baseGame()
    const line = describeCommand(before, commandsByType.playEpisode, before)
    expect(line).toContain(`**${cardName('episode', 'Episode')}**`)
  })

  it('names the discarded card for discard and discardManual', () => {
    const before = baseGame()
    const discardLine = describeCommand(before, commandsByType.discard, before)
    const manualLine = describeCommand(
      before,
      commandsByType.discardManual,
      before,
    )
    expect(discardLine).toContain(disorderName('tremors'))
    expect(manualLine).toContain(disorderName('tremors'))
  })

  it('reports the drawn card count without naming any drawn card', () => {
    const before = baseGame()
    const secretDrawnCard = disorderCard(
      'impotence',
      'secret-drawn-card',
      'Secret Drawn Card Name',
    )
    const after: GameState = {
      ...before,
      players: before.players.map((candidate) =>
        candidate.id === 'p1'
          ? { ...candidate, hand: [...candidate.hand, secretDrawnCard] }
          : candidate,
      ),
      turn: { ...before.turn, cardsDrawnThisTurn: 2 },
    }

    const line = describeCommand(before, commandsByType.draw, after)

    expect(line).toBe(t('logDrew', { player: 'Alice', count: 2 }))
    expect(line).not.toContain('Secret Drawn Card Name')
  })

  it('contains no emphasis markers for draw, since nothing on that line is a card', () => {
    const before = baseGame()
    const line = describeCommand(before, commandsByType.draw, before)
    expect(line).not.toContain('**')
  })

  it('falls back to generic nouns when card, disorder, or player ids cannot be resolved', () => {
    const before = baseGame()
    const brokenPlayDrug: GameCommand = {
      type: 'playDrug',
      drugCardId: 'missing-drug',
      disorderCardId: 'missing-disorder',
    }

    const line = describeCommand(before, brokenPlayDrug, before)

    expect(line).toContain(t('aCard'))
    expect(line).toContain(t('aDisorder'))
  })

  it('emphasises the generic noun fallbacks so an unresolvable name is still a visible slot', () => {
    const before = baseGame()
    const brokenPlayDrug: GameCommand = {
      type: 'playDrug',
      drugCardId: 'missing-drug',
      disorderCardId: 'missing-disorder',
    }

    const line = describeCommand(before, brokenPlayDrug, before)

    expect(line).toContain(`**${t('aCard')}**`)
    expect(line).toContain(`**${t('aDisorder')}**`)
  })

  it('names both players for tradeCards', () => {
    const before = baseGame()
    const line = describeCommand(before, commandsByType.tradeCards, before)
    expect(line).toContain('Alice')
    expect(line).toContain('Bob')
  })

  it('emphasises both player names for tradeCards', () => {
    const before = baseGame()
    const line = describeCommand(before, commandsByType.tradeCards, before)
    expect(line).toContain('**Alice**')
    expect(line).toContain('**Bob**')
  })

  it('never names either traded card for tradeCards, even though both are resolvable', () => {
    const before = baseGame()
    // Both card names below ARE resolvable from `before` (Fluoxetine is
    // Alice's initiatorCardId 'drug-dep'; Bob Secret Card is her partner's
    // partnerCardId 'bob-hand-card') to prove the log line omits them on
    // purpose, not because the names could not be looked up.
    const line = describeCommand(before, commandsByType.tradeCards, before)
    expect(line).not.toContain('Fluoxetine')
    expect(line).not.toContain('Bob Secret Card')
  })

  it('falls back to a generic actor and target name when players cannot be resolved', () => {
    const before: GameState = { ...baseGame(), currentPlayerId: 'ghost' }
    const brokenPlayDisorder: GameCommand = {
      type: 'playDisorder',
      disorderCardId: 'disorder-anxiety-hand',
      targetPlayerId: 'ghost-target',
    }

    const line = describeCommand(before, brokenPlayDisorder, before)

    expect(line).toContain(t('unknownPlayer'))
  })
})
