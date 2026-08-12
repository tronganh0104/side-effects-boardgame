import { useState } from 'react'
import { FinishedScreen } from '../components/FinishedScreen'
import { GameBoard } from '../components/GameBoard'
import { HomeScreen } from '../components/HomeScreen'
import { OnlineLobby } from '../components/OnlineLobby'
import { SetupScreen } from '../components/SetupScreen'
import { useGameStore } from '../store/gameStore'
import { useLocalTradeDriver } from '../store/localTradeDriver'
import { useTradeStore } from '../store/tradeStore'
import '../styles/index.css'

export function App() {
  const [mode, setMode] = useState<'home' | 'local' | 'online'>('home')
  const store = useGameStore()
  const game = store.gameState

  // Local hot-seat trading: the same negotiation machine as online
  // (`createTradeSessionStore`, driven here by `localTradeDriver` instead of
  // `server/trade/tradeGateway.ts`), but the other side is a bot
  // (`useLocalTradeBot`, wired inside `GameBoard`) instead of a second human
  // handing the device back and forth. The human is always the initiator —
  // `game.currentPlayerId`, the same player GameBoard already renders when
  // no `viewerPlayerId` is supplied.
  const tradeError = useLocalTradeDriver((state) => state.error)
  const clearTradeError = useLocalTradeDriver((state) => state.clearError)
  const tradeSession = useTradeStore((state) => state.session)

  if (mode === 'home')
    return (
      <HomeScreen
        onLocal={() => setMode('local')}
        onOnline={() => setMode('online')}
      />
    )
  if (mode === 'online') return <OnlineLobby onBack={() => setMode('home')} />
  if (!game)
    return <SetupScreen error={store.error} onStart={store.createLocalGame} />
  if (game.status === 'finished') {
    const winner = game.players.find(
      (player) => player.id === game.winnerPlayerId,
    )
    return (
      <FinishedScreen
        winnerName={winner?.name ?? 'A player'}
        onNewGame={() => {
          store.resetGame()
          useLocalTradeDriver.getState().reset()
          setMode('home')
        }}
      />
    )
  }
  return (
    <GameBoard
      game={game}
      error={store.error ?? tradeError}
      gameLog={store.gameLog}
      onDraw={store.draw}
      onEndTurn={store.endTurn}
      onForfeit={store.forfeit}
      onClearError={() => {
        store.clearError()
        clearTradeError()
      }}
      onDiscard={store.discard}
      onManualDiscard={store.manualDiscard}
      onPlayDrug={store.playDrug}
      onPlayDisorder={store.playDisorder}
      onPlayEpisode={store.playEpisode}
      onPlayTherapy={store.playTherapy}
      onInviteTrade={(targetPlayerId) =>
        useLocalTradeDriver.getState().invite(game.currentPlayerId, targetPlayerId)
      }
      onAcceptTrade={() => useLocalTradeDriver.getState().accept(game.currentPlayerId)}
      onDeclineTrade={() => useLocalTradeDriver.getState().decline(game.currentPlayerId)}
      onPlaceTradeCard={(cardInstanceId) =>
        useLocalTradeDriver.getState().place(game.currentPlayerId, cardInstanceId)
      }
      onClearTradeCard={() => useLocalTradeDriver.getState().clear(game.currentPlayerId)}
      onConfirmTrade={() => useLocalTradeDriver.getState().confirm(game.currentPlayerId)}
      onCancelTrade={() => useLocalTradeDriver.getState().cancel(game.currentPlayerId)}
      tradeIneligiblePlayers={
        tradeSession ? { [tradeSession.withPlayerId]: 'busy' } : undefined
      }
    />
  )
}
