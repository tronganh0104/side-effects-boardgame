import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FinishedScreen } from '../../components/FinishedScreen'
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
})
