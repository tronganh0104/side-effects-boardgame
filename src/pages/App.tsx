import { useState } from 'react'
import { FinishedScreen } from '../components/FinishedScreen'
import { DecisionModal } from '../components/DecisionModal'
import { GameBoard } from '../components/GameBoard'
import { HomeScreen } from '../components/HomeScreen'
import { OnlineLobby } from '../components/OnlineLobby'
import { SetupScreen } from '../components/SetupScreen'
import { useGameStore } from '../store/gameStore'
import { useLocalTradeDriver } from '../store/localTradeDriver'
import { useTradeStore } from '../store/tradeStore'
import { exitFinishedLocalGame } from '../multiplayer/recoveryCleanup'
import '../styles/index.css'

/** Extract a 6-char room code from the URL path, e.g. "/V2RGJF" → "V2RGJF". */
function getRoomCodeFromPath(): string | undefined {
  const match = window.location.pathname.match(/^\/([A-Z0-9]{6})$/i)
  return match ? match[1].toUpperCase() : undefined
}

export function App() {
  const initialRoomCode = getRoomCodeFromPath()
  const [mode, setMode] = useState<'home' | 'local' | 'online'>(
    initialRoomCode ? 'online' : 'home',
  )
  const store = useGameStore()
  const game = store.gameState

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
  if (mode === 'online') return <OnlineLobby
    onBack={() => {
      setMode('home')
      history.pushState(null, '', '/')
    }}
    initialRoomCode={initialRoomCode}
  />
  if (!game)
    return <SetupScreen error={store.error} onStart={store.createLocalGame} />
  if (game.status === 'finished') {
    const winner = game.players.find(
      (player) => player.id === game.winnerPlayerId,
    )
    return (
      <FinishedScreen
        winnerName={winner?.name ?? 'A player'}
        onNewGame={() =>
          exitFinishedLocalGame(
            store.resetGame,
            useLocalTradeDriver.getState().reset,
            () => setMode('home'),
          )
        }
      />
    )
  }
  return (
    <>
      {store.pendingDecision && (
        <DecisionModal
          decision={store.pendingDecision}
          viewerPlayerId={store.pendingDecision.chooserPlayerId}
          playerHand={game.players.find(p => p.id === store.pendingDecision?.chooserPlayerId)?.hand}
          onResolve={store.resolvePendingDecision}
        />
      )}
      <GameBoard
      game={game}
      error={store.error ?? tradeError}
      gameLog={store.gameLog}
      onDraw={store.draw}
      onEndTurn={store.endTurn}
      onForfeit={store.forfeit}
      onSurrender={store.surrender}
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
    </>
  )
}
