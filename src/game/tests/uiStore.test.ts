import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CardInstance, DisorderDefinition } from '../cards/types'
import { hasCardConservation } from '../engine/invariants'
import { FinishedScreen } from '../../components/FinishedScreen'
import { DecisionModal } from '../../components/DecisionModal'
import { useGameStore } from '../../store/gameStore'

function resetStore() {
  useGameStore.getState().resetGame()
}

describe('local UI adapter', () => {
  it('starts a local game from player names', () => {
    resetStore()
    useGameStore.getState().createLocalGame(['Ada', 'Ben'])
    const game = useGameStore.getState().gameState

    expect(game?.players.map((player) => player.name)).toEqual(['Ada', 'Ben'])
    expect(game?.status).toBe('playing')
  })

  it('delegates draw and end turn to the domain engine', () => {
    resetStore()
    useGameStore.getState().createLocalGame(['Ada', 'Ben'])
    const beforeDraw = useGameStore.getState().gameState!
    const playerId = beforeDraw.currentPlayerId

    useGameStore.getState().draw()
    const afterDraw = useGameStore.getState().gameState!
    expect(
      afterDraw.players.find((player) => player.id === playerId)?.hand,
    ).toHaveLength(6)
    expect(afterDraw.turn.phase).toBe('play')

    useGameStore.getState().endTurn()
    expect(useGameStore.getState().gameState?.currentPlayerId).not.toBe(
      playerId,
    )
  })

  it('writes Vietnamese-only local game log entries', () => {
    resetStore()
    useGameStore.getState().createLocalGame(['Ada', 'Ben'])
    expect(useGameStore.getState().gameLog).toEqual([
      'Ván chơi cùng máy đã bắt đầu.',
    ])

    useGameStore.getState().draw()
    expect(useGameStore.getState().gameLog.at(-1)).toMatch(/rút \d+ lá/)
  })

  it('delegates a play action to the domain engine', () => {
    resetStore()
    useGameStore.getState().createLocalGame(['Ada', 'Ben'])
    useGameStore.getState().draw()
    const game = useGameStore.getState().gameState!
    const player = game.players[game.currentPlayerIndex]
    const therapy = game.drawPile.find((card) => card.cardType === 'therapy')!
    const target = player.psyche.slots.find(
      (slot) => slot.disorder.therapyAllowed,
    )!
    const replaced = player.hand[0]
    useGameStore.setState({
      gameState: {
        ...game,
        players: game.players.map((candidate, index) =>
          index === game.currentPlayerIndex
            ? { ...candidate, hand: [therapy, ...candidate.hand.slice(1)] }
            : candidate,
        ),
        drawPile: [
          replaced,
          ...game.drawPile.filter(
            (card) => card.instanceId !== therapy.instanceId,
          ),
        ],
      },
    })

    useGameStore
      .getState()
      .playTherapy(therapy.instanceId, target.disorder.instanceId)
    const result = useGameStore.getState().gameState!
    expect(result.discardPile.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([therapy.instanceId, target.disorder.instanceId]),
    )
  })

  it('opens and resolves the local Tremors decision instead of rejecting the Episode', () => {
    resetStore()
    useGameStore.getState().createLocalGame(['Ada', 'Ben'])
    useGameStore.getState().draw()
    const game = useGameStore.getState().gameState!
    const attacker = game.players[game.currentPlayerIndex]
    const target = game.players.find((player) => player.id !== attacker.id)!
    const episode = game.drawPile.find((card) => card.cardType === 'episode')!
    const tremors = game.drawPile.find(
      (card): card is CardInstance<DisorderDefinition> =>
        card.cardType === 'disorder' && card.definitionId === 'tremors',
    )!
    const replacedHandCard = attacker.hand[0]
    const replacedDisorder = target.psyche.slots[0].disorder
    useGameStore.setState({
      gameState: {
        ...game,
        players: game.players.map((player) => {
          if (player.id === attacker.id)
            return { ...player, hand: [episode, ...player.hand.slice(1)] }
          if (player.id === target.id)
            return {
              ...player,
              psyche: {
                slots: [{ disorder: tremors }, ...player.psyche.slots.slice(1)],
              },
            }
          return player
        }),
        drawPile: [
          replacedHandCard,
          replacedDisorder,
          ...game.drawPile.filter(
            (card) => card.instanceId !== episode.instanceId && card.instanceId !== tremors.instanceId,
          ),
        ],
      },
    })

    useGameStore.getState().playEpisode(
      episode.instanceId,
      target.id,
      tremors.instanceId,
    )
    const pending = useGameStore.getState().pendingDecision
    expect(pending).toMatchObject({ kind: 'tremors', chooserPlayerId: target.id })
    expect(pending?.choices).toHaveLength(target.hand.length)

    useGameStore
      .getState()
      .resolvePendingDecision(pending!.id, pending!.choices.slice(0, 3).map((choice) => choice.id))

    const resolved = useGameStore.getState().gameState!
    expect(useGameStore.getState().pendingDecision).toBeUndefined()
    expect(resolved.turn.cardsPlayedThisTurn).toBe(1)
    expect(resolved.players.find((player) => player.id === target.id)?.hand).toHaveLength(
      target.hand.length - 3,
    )
    expect(hasCardConservation(resolved)).toBe(true)
  })

  it('keeps local Anxiety choices opaque and resolves exactly one stolen card', () => {
    resetStore()
    useGameStore.getState().createLocalGame(['Ada', 'Ben'])
    useGameStore.getState().draw()
    const game = useGameStore.getState().gameState!
    const attacker = game.players[game.currentPlayerIndex]
    const target = game.players.find((player) => player.id !== attacker.id)!
    const episode = game.drawPile.find((card) => card.cardType === 'episode')!
    const anxiety = game.drawPile.find(
      (card): card is CardInstance<DisorderDefinition> =>
        card.cardType === 'disorder' && card.definitionId === 'anxiety',
    )!
    const replacedHandCard = attacker.hand[0]
    const replacedDisorder = target.psyche.slots[0].disorder
    useGameStore.setState({
      gameState: {
        ...game,
        players: game.players.map((player) => {
          if (player.id === attacker.id)
            return { ...player, hand: [episode, ...player.hand.slice(1)] }
          if (player.id === target.id)
            return { ...player, psyche: { slots: [{ disorder: anxiety }, ...player.psyche.slots.slice(1)] } }
          return player
        }),
        drawPile: [
          replacedHandCard,
          replacedDisorder,
          ...game.drawPile.filter(
            (card) => card.instanceId !== episode.instanceId && card.instanceId !== anxiety.instanceId,
          ),
        ],
      },
    })

    useGameStore.getState().playEpisode(episode.instanceId, target.id, anxiety.instanceId)
    const pending = useGameStore.getState().pendingDecision!
    expect(pending).toMatchObject({ kind: 'anxiety', chooserPlayerId: attacker.id })
    expect(pending.choices.map((choice) => choice.label)).toEqual(
      target.hand.map((_, index) => `Lá bài ${index + 1}`),
    )
    expect(JSON.stringify(pending.choices)).not.toContain(target.hand[0].instanceId)

    const chosen = pending.choices[0]
    useGameStore.getState().resolvePendingDecision(pending.id, [chosen.id])
    const resolved = useGameStore.getState().gameState!
    expect(useGameStore.getState().pendingDecision).toBeUndefined()
    expect(resolved.turn.cardsPlayedThisTurn).toBe(1)
    expect(resolved.players.find((player) => player.id === attacker.id)?.hand).toContainEqual(target.hand[0])
    expect(resolved.players.find((player) => player.id === target.id)?.hand).not.toContainEqual(target.hand[0])
    expect(resolved.discardPile).toContainEqual(episode)
    expect(hasCardConservation(resolved)).toBe(true)
  })

  it('renders the finished-state winner message', () => {
    const html = renderToStaticMarkup(
      createElement(FinishedScreen, {
        winnerName: 'Ada',
        onNewGame: () => undefined,
      }),
    )

    expect(html).toContain('Ada đã chiến thắng!')
    expect(html).toContain('Ván mới')
  })

  it('renders an expired Tremors countdown as a disabled resolving state', () => {
    const html = renderToStaticMarkup(
      createElement(DecisionModal, {
        decision: {
          id: 'decision-expired',
          kind: 'tremors',
          chooserPlayerId: 'ben',
          expiresAt: 0,
          choices: [],
        },
        viewerPlayerId: 'ben',
        playerHand: [],
        onResolve: () => undefined,
      }),
    )

    expect(html).toContain('Đang xử lý...')
    expect(html).toContain('disabled=""')
  })
})
