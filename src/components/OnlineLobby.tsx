import { useEffect, useRef, useState } from 'react'
import { GameBoard } from './GameBoard'
import { DecisionModal } from './DecisionModal'
import { FinishedScreen } from './FinishedScreen'
import { ChatPanel } from './chat/ChatPanel'
import {
  createMultiplayerClient,
  multiplayerServerUrl,
  type ConnectionState,
  type AccountRecoveryView,
  type MultiplayerSession,
  type RoomView,
} from '../multiplayer/multiplayerClient'
import type { PlayerGameView } from '../../server/game/playerView'
import { localizeError, t } from '../i18n'
import { useChatStore } from '../store/chatStore'
import {
  exitFinishedOnlineGame,
  resetMultiplayerRoomUi,
} from '../multiplayer/recoveryCleanup'

interface OnlineLobbyProps {
  onBack: () => void
  recoverOnMount?: boolean
  initialRoomCode?: string
}

/** Push a room-code path so the URL becomes /ABCDEF, or / when leaving. */
function pushRoomUrl(roomId: string | undefined): void {
  const target = roomId ? `/${roomId}` : '/'
  if (window.location.pathname !== target)
    history.pushState(null, '', target)
}

export function OnlineLobby({ onBack, recoverOnMount = false, initialRoomCode }: OnlineLobbyProps) {
  const [displayName, setDisplayName] = useState('')
  const [roomCode, setRoomCode] = useState(initialRoomCode ?? '')
  const [room, setRoom] = useState<RoomView>()
  const [session, setSession] = useState<MultiplayerSession>()
  const [game, setGame] = useState<PlayerGameView>()
  const [error, setError] = useState<string>()
  const [gameLog, setGameLog] = useState<string[]>([])
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('connecting')
  const [accountRecovery, setAccountRecovery] = useState<AccountRecoveryView>({ status: 'none' })
  const [now, setNow] = useState(() => Date.now())
  const [linkCopied, setLinkCopied] = useState(false)
  const clientRef = useRef<ReturnType<typeof createMultiplayerClient> | null>(
    null,
  )
  const recoveryClaimedRef = useRef(false)

  const leaveAndGoHome = () => {
    pushRoomUrl(undefined)
    onBack()
  }

  const resetRoomUi = () => {
    resetMultiplayerRoomUi({
      clearRoom: () => setRoom(undefined),
      clearGame: () => setGame(undefined),
      clearSession: () => setSession(undefined),
      clearGameLog: () => setGameLog([]),
    })
  }

  useEffect(() => {
    const client = createMultiplayerClient(
      multiplayerServerUrl,
      {
        onRoomState: (r) => {
          setRoom(r)
          pushRoomUrl(r.id)
        },
        onGameState: setGame,
        onError: setError,
        onGameLog: setGameLog,
        onConnectionState: setConnectionState,
        onSessionRestored: (restoredSession) => {
          setSession(restoredSession)
          setError(undefined)
          pushRoomUrl(restoredSession.roomId)
        },
        onChatMessage: (message) => useChatStore.getState().append(message),
        onRoomLeft: () => {
          resetRoomUi()
          // Go all the way back to home so the user isn't stuck on the lobby screen.
          leaveAndGoHome()
        },
        onRecoveryFailed: () => {
          resetRoomUi()
          // Clear the URL code so a refresh doesn't re-attempt a dead session.
          pushRoomUrl(undefined)
        },
        onAccountRecovery: setAccountRecovery,
        onSessionReplaced: () => {
          resetRoomUi()
          pushRoomUrl(undefined)
          setAccountRecovery({ status: 'none' })
          setError(t('accountSessionReplaced'))
        },
      },
    )
    clientRef.current = client
    client.connect()
    return () => {
      client.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If the URL had a room code when the page loaded, try to join it as soon as
  // the socket connects (connection state flips to 'connected').
  const autoJoinAttemptedRef = useRef(false)
  useEffect(() => {
    if (
      !initialRoomCode ||
      autoJoinAttemptedRef.current ||
      connectionState !== 'connected' ||
      // Don't auto-join if account recovery is already in progress.
      accountRecovery.status !== 'none'
    ) return
    autoJoinAttemptedRef.current = true
    // Only auto-join if the user has provided a display name; otherwise they
    // land on the form pre-filled with the room code and click Join themselves.
    if (displayName.trim()) {
      clientRef.current?.joinRoom(initialRoomCode, displayName.trim())
    }
    // If no display name, the field is pre-filled with the room code; the user
    // types their name and clicks Join — no special handling needed.
  }, [connectionState, initialRoomCode, displayName, accountRecovery.status])

  useEffect(() => {
    if (!recoverOnMount || recoveryClaimedRef.current || accountRecovery.status === 'none') return
    recoveryClaimedRef.current = true
    clientRef.current?.recoverAccountSession(accountRecovery.status === 'already-connected')
  }, [accountRecovery, recoverOnMount])

  useEffect(() => {
    if (!game || !room?.players.some((player) => player.graceExpiresAt !== undefined)) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [game, room])

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

  const shareableLink = room
    ? `${window.location.origin}/${room.id}`
    : undefined

  const handleCopyLink = () => {
    if (!shareableLink) return
    navigator.clipboard.writeText(shareableLink).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    }).catch(() => {
      // Fallback: copy just the room code
      navigator.clipboard.writeText(room!.id).catch(() => undefined)
    })
  }

  if (game?.status === 'finished') {
    const winner = game.players.find(
      (player) => player.id === game.winnerPlayerId,
    )
    return (
      <FinishedScreen
        winnerName={winner?.name ?? t('winner')}
        onNewGame={() =>
          exitFinishedOnlineGame(
            {
              clearRoom: () => setRoom(undefined),
              clearGame: () => setGame(undefined),
              clearSession: () => setSession(undefined),
              clearGameLog: () => setGameLog([]),
            },
            leaveAndGoHome,
          )
        }
        actionLabel={t('back')}
      />
    )
  }

  if (game) {
    const viewerId = session?.playerId ?? ''
    const currentRoomPlayer = room?.players.find(
      (player) => player.id === game.currentPlayerId,
    )
    const disconnectedRoomPlayer = room?.players.find((player) => !player.connected)
    return (
      <main className="online-game">
        <p className="connection-status">
          {disconnectedRoomPlayer
            ? `${disconnectedRoomPlayer.displayName} — ${disconnectedRoomPlayer.graceExpiresAt !== undefined && disconnectedRoomPlayer.graceExpiresAt > now
              ? t('waitingForReconnectCountdown', { seconds: Math.ceil((disconnectedRoomPlayer.graceExpiresAt - now) / 1000) })
              : disconnectedRoomPlayer.graceExpiresAt !== undefined ? t('disconnectProcessing') : t('waitingForReconnect')}`
            : game.currentPlayerId === viewerId
              ? t('yourTurn')
              : t('waitingFor', { player: currentRoomPlayer?.displayName ?? t('currentPlayer') })}
        </p>
        {connectionState !== 'connected' && (
          <p className="error">{connectionState === 'resuming' ? t('restoringGame') : t('reconnecting')}</p>
        )}
        {game.pendingDecision && (
          <DecisionModal
            decision={game.pendingDecision}
            viewerPlayerId={viewerId}
            playerHand={game.players.find(p => p.id === viewerId)?.hand}
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
          onSurrender={() => clientRef.current?.sendCommand({ type: 'surrender' })}
          onLeave={() => {
            const body = game.players.length === 2
              ? t('leaveActiveGameBody')
              : t('leaveActiveGameBodyMultiplayer')
            if (window.confirm(`${t('leaveActiveGameTitle')}\n\n${body}`))
              clientRef.current?.leaveRoom()
          }}
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
          onClick={leaveAndGoHome}
        >
          ← {t('back')}
        </button>
        <h1 className="online-lobby-title">{t('onlineGame')}</h1>

        {connectionState !== 'connected' && (
          <p className="error" style={{ marginBottom: '1rem' }}>
            {connectionState === 'failed'
              ? t('recoveryFailed')
              : connectionState === 'resuming'
                ? t('restoringGame')
              : connectionState === 'unavailable'
              ? t('unavailable')
              : connectionState === 'connecting' ? t('connecting') : t('reconnecting')}
          </p>
        )}

        {!room && accountRecovery?.status !== 'none' && (
          <div className="account-recovery-card">
            <h2>{t('accountRecoveryTitle')}</h2>
            <p>{accountRecovery.status === 'already-connected' ? t('accountRecoveryElsewhere') : t('accountRecoveryBody')}</p>
            {accountRecovery.roomId && <p>{t('roomCode')}: <strong>{accountRecovery.roomId}</strong></p>}
            <button
              type="button"
              className="primary"
              onClick={() => clientRef.current?.recoverAccountSession(accountRecovery.status === 'already-connected')}
            >
              {accountRecovery.status === 'already-connected' ? t('accountTakeover') : t('accountReturnToGame')}
            </button>
          </div>
        )}

        {!room && accountRecovery?.status === 'none' && (
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
              <div className="room-code-actions">
                <button
                  type="button"
                  className="copy-btn"
                  title="Sao chép mã phòng"
                  onClick={() => navigator.clipboard.writeText(room.id).catch(() => undefined)}
                >
                  📋 Mã
                </button>
                <button
                  type="button"
                  className="copy-btn copy-btn--link"
                  title="Sao chép đường dẫn phòng"
                  onClick={handleCopyLink}
                >
                  {linkCopied ? '✓ Đã sao chép!' : '🔗 Link'}
                </button>
              </div>
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