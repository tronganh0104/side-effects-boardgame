import { useEffect, useRef, useState } from 'react'
import { GameBoard } from './GameBoard'
import { DecisionModal } from './DecisionModal'
import { FinishedScreen } from './FinishedScreen'
import { ChatPanel } from './chat/ChatPanel'
import {
  createMultiplayerClient,
  multiplayerServerUrl,
  type ConnectionState,
  type MultiplayerSession,
  type RoomView,
} from '../multiplayer/multiplayerClient'
import type { PlayerGameView } from '../../server/game/playerView'
import { localizeError, t } from '../i18n'
import { useChatStore } from '../store/chatStore'

interface OnlineLobbyProps {
  onBack: () => void
}

export function OnlineLobby({ onBack }: OnlineLobbyProps) {
  const [displayName, setDisplayName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [room, setRoom] = useState<RoomView>()
  const [session, setSession] = useState<MultiplayerSession>()
  const [game, setGame] = useState<PlayerGameView>()
  const [error, setError] = useState<string>()
  const [gameLog, setGameLog] = useState<string[]>([])
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('connecting')
  const clientRef = useRef<ReturnType<typeof createMultiplayerClient> | null>(
    null,
  )

  useEffect(() => {
    const client = createMultiplayerClient(
      multiplayerServerUrl,
      {
        onRoomState: setRoom,
        onGameState: setGame,
        onError: setError,
        onGameLog: setGameLog,
        onConnectionState: setConnectionState,
        onSessionRestored: setSession,
        onChatMessage: (message) => useChatStore.getState().append(message),
        onRoomLeft: () => {
          setRoom(undefined)
          setGame(undefined)
          setSession(undefined)
          useChatStore.getState().reset()
        },
      },
    )
    clientRef.current = client
    client.connect()
    return () => {
      client.disconnect()
    }
  }, [])

  const isHost = room?.hostPlayerId === session?.playerId
  const allConnected =
    room?.players.every((player) => player.connected) ?? false
  const canStart = Boolean(
    isHost &&
    room &&
    room.players.length >= 2 &&
    room.players.length <= 8 &&
    allConnected,
  )

  if (game?.status === 'finished') {
    const winner = game.players.find(
      (player) => player.id === game.winnerPlayerId,
    )
    return (
      <FinishedScreen
        winnerName={winner?.name ?? t('winner')}
        onNewGame={onBack}
        actionLabel={t('back')}
      />
    )
  }

  if (game) {
    const viewerId = session?.playerId ?? ''
    const currentRoomPlayer = room?.players.find(
      (player) => player.id === game.currentPlayerId,
    )
    return (
      <main className="online-game">
        <p className="connection-status">
          {currentRoomPlayer?.connected === false
            ? `${currentRoomPlayer.displayName} — ${t('waitingForReconnect')}`
            : game.currentPlayerId === viewerId
              ? t('yourTurn')
              : t('waitingFor', { player: currentRoomPlayer?.displayName ?? t('currentPlayer') })}
        </p>
        {connectionState !== 'connected' && (
          <p className="error">{t('reconnecting')}</p>
        )}
        {game.pendingDecision && (
          <DecisionModal
            decision={game.pendingDecision}
            viewerPlayerId={viewerId}
            onResolve={(decisionId, choiceIds) =>
              clientRef.current?.resolveDecision(decisionId, choiceIds)
            }
          />
        )}
        <GameBoard
          game={game}
          viewerPlayerId={viewerId}
          error={error}
          gameLog={gameLog}
          onDraw={() => {
            setError(undefined)
            clientRef.current?.sendCommand({ type: 'draw' })
          }}
          onEndTurn={() => {
            setError(undefined)
            clientRef.current?.sendCommand({ type: 'endTurn' })
          }}
          onForfeit={() => clientRef.current?.sendCommand({ type: 'forfeit' })}
          onClearError={() => setError(undefined)}
          onDiscard={(cardInstanceId) => {
            setError(undefined)
            clientRef.current?.sendCommand({ type: 'discard', cardInstanceId })
          }}
          onManualDiscard={(cardInstanceId) => {
            setError(undefined)
            clientRef.current?.sendCommand({ type: 'discardManual', cardInstanceId })
          }}
          onPlayDrug={(drugCardId, disorderCardId) => {
            setError(undefined)
            clientRef.current?.sendCommand({
              type: 'playDrug',
              drugCardId,
              disorderCardId,
            })
          }}
          onPlayDisorder={(disorderCardId, targetPlayerId) => {
            setError(undefined)
            clientRef.current?.sendCommand({
              type: 'playDisorder',
              disorderCardId,
              targetPlayerId,
            })
          }}
          onPlayEpisode={(
            episodeCardId,
            targetPlayerId,
            targetDisorderCardId,
          ) => {
            setError(undefined)
            clientRef.current?.sendCommand({
              type: 'playEpisode',
              episodeCardId,
              targetPlayerId,
              targetDisorderCardId,
            })
          }}
          onPlayTherapy={(therapyCardId, disorderCardId) => {
            setError(undefined)
            clientRef.current?.sendCommand({
              type: 'playTherapy',
              therapyCardId,
              disorderCardId,
            })
          }}
          onSendChat={(text) => clientRef.current?.sendChat(text)}
          onInviteTrade={(targetPlayerId) =>
            clientRef.current?.inviteTrade(targetPlayerId)
          }
          onAcceptTrade={() => clientRef.current?.acceptTrade()}
          onDeclineTrade={() => clientRef.current?.declineTrade()}
          onPlaceTradeCard={(cardInstanceId) =>
            clientRef.current?.placeTradeCard(cardInstanceId)
          }
          onClearTradeCard={() => clientRef.current?.clearTradeCard()}
          onConfirmTrade={() => clientRef.current?.confirmTrade()}
          onCancelTrade={() => clientRef.current?.cancelTrade()}
          tradeIneligiblePlayers={Object.fromEntries(
            (room?.players ?? [])
              .filter((player) => !player.connected)
              .map((player) => [player.id, 'disconnected' as const]),
          )}
        />
      </main>
    )
  }

  return (
    <main className="setup-screen">
      <section className={`panel online-lobby panel-surface panel-surface--framed${room ? ' has-chat' : ''}`}>
        <button
          type="button"
          className="lobby-back-btn"
          onClick={onBack}
        >
          ← {t('back')}
        </button>
        <h1 className="online-lobby-title">{t('onlineGame')}</h1>

        {connectionState !== 'connected' && (
          <p className="error" style={{ marginBottom: '1rem' }}>
            {connectionState === 'unavailable'
              ? t('unavailable')
              : connectionState === 'connecting' ? t('connecting') : t('reconnecting')}
          </p>
        )}

        {!room && (
          <>
            <label className="name-field">
              <span className="label">{t('displayName')}</span>
              <input
                className="field-input"
                value={displayName}
                placeholder="Nhập tên của bạn"
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <div className="button-row" style={{ marginBottom: '0' }}>
              <button
                type="button"
                className="primary"
                disabled={!displayName.trim()}
                onClick={() => clientRef.current?.createRoom(displayName.trim())}
              >
                + {t('createRoom')}
              </button>
            </div>

            <div className="or-divider">hoặc</div>

            <label className="name-field">
              <span className="label">{t('roomCode')}</span>
              <div className="input-row">
                <input
                  className="field-input room-code-input"
                  value={roomCode}
                  maxLength={6}
                  placeholder="ABC123"
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                />
                <button
                  type="button"
                  className="btn-join"
                  disabled={!displayName.trim() || !roomCode.trim()}
                  onClick={() => clientRef.current?.joinRoom(roomCode, displayName.trim())}
                >
                  Vào
                </button>
              </div>
            </label>
          </>
        )}

        {room && (
          <>
            <div className="room-code-card">
              <div>
                <span className="lbl">Mã phòng</span>
                <span className="room-code">{room.id}</span>
              </div>
              <button
                type="button"
                className="copy-btn"
                onClick={() => navigator.clipboard.writeText(room.id)}
              >
                📋 Copy
              </button>
            </div>

            <p className="conn-line">
              <strong>{room.players.length}</strong>/8 người chơi ·{' '}
              {allConnected ? 'Đã kết nối' : t('waitingForReconnect')}
            </p>

            <div className="lobby-body">
              <ul className="lobby-players">
                {room.players.map((player, idx) => {
                  const initials = player.displayName.charAt(0).toUpperCase()
                  const isHost = player.id === room.hostPlayerId
                  const isMe = player.id === session?.playerId
                  return (
                    <li key={player.id}>
                      <span className="player-avatar" style={{ background: `linear-gradient(135deg, hsl(${(idx * 60) % 360}, 60%, 45%), hsl(${(idx * 60 + 20) % 360}, 60%, 30%))` }}>
                        {initials}
                      </span>
                      <span className="player-name-wrap">
                        {player.displayName}
                        {isMe && <span className="me-tag">BẠN</span>}
                        {isHost && <span className="host-tag">👑 Chủ</span>}
                      </span>
                      <span className={`player-status ${player.connected ? 'connected' : ''}`}>
                        {player.connected ? '● Đã kết nối' : '○ Đang chờ'}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {/* Chat is available in the lobby too, not just in-game — negotiation can happen any time. */}
              <ChatPanel
                onSend={(text) => clientRef.current?.sendChat(text)}
                viewerPlayerId={session?.playerId}
              />
            </div>

            <div className="button-row">
              {isHost && (
                <button
                  type="button"
                  className="primary"
                  disabled={!canStart}
                  onClick={() => clientRef.current?.startRoom()}
                >
                  {t('startGame')} ▶
                </button>
              )}
              {!isHost && (
                <p className="waiting-host-msg">
                  {t('waitingForHost')}
                </p>
              )}
              <button
                type="button"
                className="btn-danger leave-room-btn"
                onClick={() => clientRef.current?.leaveRoom()}
              >
                Rời phòng
              </button>
            </div>
            <p className="lobby-hint">Cần ít nhất <strong>2</strong> người chơi để bắt đầu.</p>
          </>
        )}

        {error && <p className="error">{localizeError(error)}</p>}
      </section>
    </main>
  )
}
