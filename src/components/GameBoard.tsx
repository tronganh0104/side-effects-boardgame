import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CardInstance } from '../game/cards/types'
import type { GameState, PlayerState } from '../game/engine/types'
import type {
  PlayerGameView,
  PlayerView,
  PublicCardView,
  PublicPsycheSlotView,
} from '../../server/game/playerView'
import { disorderName, localizeError, phaseName, t } from '../i18n'
import { getCardDefinition } from '../game/cards/catalog'
import { canReceiveDisorderInSlots, type ExposureSlot } from '../game/engine/sideEffects'
import { canTreatWithTherapy } from '../game/engine/therapy'
import { GameCard } from './cards/GameCard'
import { CardBack } from './cards/CardBack'
import { CardHoverProvider, useCardHover } from './cards/cardHoverContext'
import { SelectionHint } from './board/SelectionHint'
import { OpponentAvatarBar } from './OpponentAvatarBar'
import { OpponentHand } from './OpponentHand'
import { GameLogDrawer } from './GameLogDrawer'
import { PlayerSidebar } from './sidebar/PlayerSidebar'
import { GhostLayer, triggerGhost } from './GhostLayer'
import { useGameAudio } from '../audio/useGameAudio'
import { audioManager } from '../audio/audioManager'
import { AudioSettings } from './AudioSettings'
import { ChatPanel } from './chat/ChatPanel'
import { ChatDrawer } from './chat/ChatDrawer'
import { useLocalChatBot } from './chat/useLocalChatBot'
import { createMessageId } from './chat/messageId'
import { useChatStore } from '../store/chatStore'
import { useTradeStore } from '../store/tradeStore'
import { TradeButton } from './trade/TradeButton'
import { TradeInviteBadge } from './trade/TradeInviteBadge'
import { TradePartnerPicker, type TradePartnerOption } from './trade/TradePartnerPicker'
import { TradePanel } from './trade/TradePanel'
import { useLocalTradeBot } from './trade/useLocalTradeBot'
import { resolveTradeHandClick, isAwaitingTradeCard } from './trade/tradeHandPlacement'

type BoardCard =
  | Pick<
      CardInstance,
      'instanceId' | 'definitionId' | 'cardType' | 'displayName'
    >
  | PublicCardView
type BoardPlayer = PlayerState | PlayerView

function slotsOf(
  player: BoardPlayer,
): (PlayerState['psyche']['slots'][number] | PublicPsycheSlotView)[] {
  return Array.isArray(player.psyche) ? player.psyche : player.psyche.slots
}

function handOf(player: BoardPlayer): BoardCard[] {
  return player.hand ?? []
}

/** t() only returns plain text, so wrapping the interpolated value in <strong>
 * afterwards means re-finding it in the resolved string — splits around the
 * first occurrence of `value` rather than the raw `{param}` token, which t()
 * has already replaced by the time this runs. */
function splitAroundValue(text: string, value: string): [string, string] {
  const index = text.indexOf(value)
  if (index === -1) return [text, '']
  return [text.slice(0, index), text.slice(index + value.length)]
}

interface GameBoardProps {
  game: GameState | PlayerGameView
  viewerPlayerId?: string
  error?: string
  gameLog: string[]
  onDraw: () => void
  onEndTurn: () => void
  onForfeit: () => void
  onLeave?: () => void
  onClearError?: () => void
  /** Presence means online mode, same idiom as onLeave: messages go over the
   *  socket. Absent in local mode, where GameBoard appends straight to
   *  chatStore instead and a bot fakes the other hot-seat players. */
  onSendChat?: (text: string) => void
  /** Same online-mode idiom as onSendChat: presence of these seven callbacks
   *  is what turns on the trade UI. In online mode they call the socket; in
   *  local hot-seat they drive `localTradeDriver` instead, with a bot
   *  (`useLocalTradeBot`) playing the other side — either way GameBoard
   *  only ever sees the same seven functions. */
  onInviteTrade?: (targetPlayerId: string) => void
  onAcceptTrade?: () => void
  onDeclineTrade?: () => void
  onPlaceTradeCard?: (cardInstanceId: string) => void
  onClearTradeCard?: () => void
  onConfirmTrade?: () => void
  onCancelTrade?: () => void
  /** Per-player reason a trade invite would be rejected, supplied by the
   *  online wiring layer (room connectivity / other active sessions). Absent
   *  or missing entries are treated as eligible; `tradeUsedThisTurn` is
   *  always known locally from `game.players` and needs no entry here. */
  tradeIneligiblePlayers?: Record<string, 'busy' | 'disconnected'>
  onDiscard: (cardId: string) => void
  onManualDiscard: (cardId: string) => void
  onPlayDrug: (drugId: string, disorderId: string) => void
  onPlayDisorder: (disorderId: string, targetPlayerId: string) => void
  onPlayEpisode: (
    episodeId: string,
    targetPlayerId: string,
    disorderId: string,
    options?: { chosenCardId?: string; tremorsDiscardCardIds?: string[] },
  ) => void
  onPlayTherapy: (therapyId: string, disorderId: string) => void
}

export function Psyche({
  player,
  playerId,
  selectedCard,
  viewerId,
  isTargetingMode,
  onTargetSlot,
}: {
  player: BoardPlayer
  playerId: string
  selectedCard?: BoardCard
  viewerId: string
  isTargetingMode: boolean
  onTargetSlot: (ownerId: string, slotId: string) => void
}) {
  return (
    <div className="psyche">
      {slotsOf(player).map((slot) => {
        const isOwn = playerId === viewerId
        const isUntreated = !slot.drug
        
        let canSelect = false
        if (selectedCard) {
          if (selectedCard.cardType === 'drug') {
            const definition = getCardDefinition(selectedCard.definitionId)
            canSelect = isOwn && isUntreated && definition?.cardType === 'drug' &&
              slot.disorder.definitionId === definition.treats
          } else if (selectedCard.cardType === 'therapy') {
            const definition = getCardDefinition(slot.disorder.definitionId)
            canSelect =
              isOwn &&
              isUntreated &&
              definition?.cardType === 'disorder' &&
              canTreatWithTherapy(definition)
          } else if (selectedCard.cardType === 'episode') {
            canSelect = !isOwn && isUntreated
          }
        }

        const slotClass = [
          'slot',
          isTargetingMode ? (canSelect ? 'target-highlight targetable' : 'dimmed') : '',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <button
            type="button"
            id={`slot-${slot.disorder.instanceId}`}
            className={slotClass}
            key={slot.disorder.instanceId}
            onClick={(event) => {
              event.stopPropagation()
              if (canSelect) {
                onTargetSlot(playerId, slot.disorder.instanceId)
              }
            }}
          >
            <span className={`slot-badge ${slot.drug ? 'treated' : 'untreated'}`}>
              {slot.drug ? t('treated') : t('untreated')}
            </span>
            <GameCard card={slot.disorder} />
            {slot.drug && (
              <div className="drug-attachment">
                <GameCard card={slot.drug} />
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

function CardButton({
  card,
  selected,
  tradePlaced,
  onClick,
}: {
  card: BoardCard
  selected: boolean
  /** This card is the one currently offered in an open trade session — see
   *  tradeHandPlacement.ts. Purely a visual marker; clicking it still goes
   *  through the same handler, which is what takes it back out. */
  tradePlaced?: boolean
  onClick: () => void
}) {
  // Keyboard-only path for the sidebar card-info preview (CardInfoPanel):
  // hand cards are <button>s, and a button's own focus/blur never reaches a
  // descendant handler (GameCard's internal hover span, cardHoverContext.tsx,
  // only ever sees mouseenter/mouseleave) — so this is wired here instead,
  // on the actual focusable element. Safe the same way GameCard's own
  // wiring is: `card` here is always one of the viewer's own real hand
  // cards, never a face-down one.
  const { onCardHover } = useCardHover()
  return (
    <button
      type="button"
      className={`card-button ${selected ? 'selected' : ''} ${tradePlaced ? 'trade-placed' : ''}`}
        onClick={(event) => {
          event.stopPropagation()
          onClick()
          event.currentTarget.blur()
      }}
      onFocus={() => onCardHover(card)}
      onBlur={() => onCardHover(null)}
    >
      <GameCard card={card} />
      {tradePlaced && <span className="trade-placed-badge">🔁 Đang đổi</span>}
    </button>
  )
}

export function GameBoard(props: GameBoardProps) {
  const { game } = props
  const current = game.players[game.currentPlayerIndex]
  const drawPileCount = 'drawPile' in game ? game.drawPile.length : game.drawPileCount
  const discardPileCount = 'discardPile' in game ? game.discardPile.length : game.discardPileCount
  const viewer =
    game.players.find((player) => player.id === (props.viewerPlayerId ?? game.currentPlayerId)) ??
    current
  const viewerHand = handOf(viewer)
  const isViewerTurn = viewer.id === game.currentPlayerId

  const [selectedCardId, setSelectedCardId] = useState<string>()
  const [focusedOpponentId, setFocusedOpponentId] = useState<string>()
  const [showLog, setShowLog] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [isLocked, setIsLocked] = useState(false) // Lock interactions while waiting for server
  const [sortMode, setSortMode] = useState<'original' | 'type' | 'name'>('original')

  // Trade UI mounts in both modes now: online wires these seven callbacks to
  // the socket, local wires them to localTradeDriver — GameBoard can't tell
  // the difference and doesn't need to.
  const isTradeEnabled = Boolean(props.onInviteTrade)
  // Read-only: GameBoard only ever looks at the session to decide what a
  // hand click means (tradeHandPlacement.ts) and to show the "place a card"
  // hint. It never writes to this store — that stays server-mirrored state.
  const tradeSession = useTradeStore((state) => state.session)
  const isAwaitingTradeCardPlacement = isTradeEnabled && isAwaitingTradeCard(tradeSession)
  const tradePlayers = useMemo(
    () => game.players.map((player) => ({ id: player.id, name: player.name })),
    [game.players],
  )

  const isOnlineChat = Boolean(props.onSendChat)
  const isChatCollapsed = useChatStore((state) => state.isCollapsed)
  const chatUnreadCount = useChatStore((state) => state.unreadCount)
  const appendChatMessage = useChatStore((state) => state.append)
  // Local mode has no server to relay through: a sent message is authored as
  // the current hot-seat player and appended directly. Online mode's real
  // send (props.onSendChat) takes over below; only one of the two ever runs.
  const sendLocalChat = (text: string) => {
    appendChatMessage({
      kind: 'text',
      id: createMessageId(),
      author: { playerId: viewer.id, displayName: viewer.name },
      sentAt: Date.now(),
      text,
    })
  }
  const sendChat = props.onSendChat ?? sendLocalChat
  // Local hot-seat has no real peer, so a jittered timer fakes one — see
  // useLocalChatBot. It no-ops on its own whenever isOnlineChat is true or
  // the game has finished, so this call is unconditional like any hook.
  useLocalChatBot({
    enabled: !isOnlineChat,
    players: game.players.map((player) => ({ id: player.id, name: player.name })),
    excludeId: viewer.id,
    isFinished: game.status === 'finished',
  })
  // Local hot-seat has no real trade partner either: whichever player is
  // invited is played by a bot (see useLocalTradeBot / localTradeBot.ts)
  // instead of handing the device to a second human. Same online/local
  // split as the chat bot above — never runs when onSendChat (online) is
  // present.
  useLocalTradeBot({
    enabled: isTradeEnabled && !isOnlineChat,
    isFinished: game.status === 'finished',
  })

  useGameAudio(game as PlayerGameView, viewer.id)

  const selectedCard = viewerHand.find((card) => card.instanceId === selectedCardId)
  const selectedTreatment = selectedCard?.cardType === 'drug'
    ? getCardDefinition(selectedCard.definitionId)
    : undefined
  // Only the Drug hint interpolates a value, so only it needs the split-and-
  // rewrap dance (splitAroundValue) to keep <strong> around the Disorder name;
  // the other card types' hints below are static one-liners straight from t().
  const treatedDisorderName = selectedTreatment?.cardType === 'drug'
    ? disorderName(selectedTreatment.treats)
    : undefined
  const drugHintParts = treatedDisorderName
    ? splitAroundValue(t('selectionHintDrug', { disorder: treatedDisorderName }), treatedDisorderName)
    : undefined
  // Single derived node instead of four separate hint elements: the four
  // conditions are mutually exclusive on selectedCard.cardType, and
  // SelectionHint (rendered once, in .own-hand below) needs one child to
  // anchor, not four stacked absolutely-positioned boxes.
  const handSelectionHint =
    selectedTreatment?.cardType === 'drug' && drugHintParts
      ? <>{drugHintParts[0]}<strong>{treatedDisorderName}</strong>{drugHintParts[1]}</>
      : selectedCard?.cardType === 'disorder'
      ? t('selectionHintDisorder')
      : selectedCard?.cardType === 'therapy'
      ? t('selectionHintTherapy')
      : selectedCard?.cardType === 'episode'
      ? t('selectionHintEpisode')
      : null
  const sortedHand = useMemo(() => {
    if (sortMode === 'original') return viewerHand
    return [...viewerHand].sort((a, b) =>
      sortMode === 'type'
        ? a.cardType.localeCompare(b.cardType) || a.displayName.localeCompare(b.displayName)
        : a.displayName.localeCompare(b.displayName),
    )
  }, [sortMode, viewerHand])
  const isTargetingMode = selectedCard !== undefined

  const opponents = game.players.filter((player) => player.id !== viewer.id)
  const tradePartners: TradePartnerOption[] = useMemo(
    () =>
      opponents.map((opponent) => {
        const usedTurn = 'tradeUsedThisTurn' in opponent && opponent.tradeUsedThisTurn
        const reason = usedTurn
          ? 'đã đổi lượt này'
          : props.tradeIneligiblePlayers?.[opponent.id] === 'busy'
            ? 'đang bận'
            : props.tradeIneligiblePlayers?.[opponent.id] === 'disconnected'
              ? 'mất kết nối'
              : undefined
        return { id: opponent.id, name: opponent.name, reason }
      }),
    [opponents, props.tradeIneligiblePlayers],
  )
  const focusedOpponent =
    opponents.find((player) => player.id === focusedOpponentId) ??
    opponents.find((player) => player.id === game.currentPlayerId) ??
    opponents[0]
  const selectedDisorderDefinition =
    selectedCard?.cardType === 'disorder'
      ? getCardDefinition(selectedCard.definitionId)
      : undefined
  const canTargetFocusedOpponent =
    selectedDisorderDefinition?.cardType === 'disorder' &&
    focusedOpponent !== undefined &&
    canReceiveDisorderInSlots(
      slotsOf(focusedOpponent) as ExposureSlot[],
      selectedDisorderDefinition.definitionId,
    )
  // The resolved id, not the raw state: before the first click focusedOpponentId
  // is undefined while an opponent is already being shown, so highlighting off
  // the raw state would leave the watched player unmarked at game start.
  const watchedOpponentId = focusedOpponent?.id
  const watchedHandCount = focusedOpponent
    ? 'handCount' in focusedOpponent
      ? focusedOpponent.handCount
      : (focusedOpponent.hand?.length ?? 0)
    : 0
  // --slot-count for the board's card-size fit (layout.css --card-w-fit-psyche):
  // the two psyche rows actually on screen are the viewer's own (self-zone)
  // and the focused opponent's (opponent-zone) — never every player's, since
  // only those two ever render at once. Slot counts grow as disorders land,
  // so this reads live state each render rather than a hardcoded max; the
  // Math.max(1, …) floor keeps the CSS calc's division safe before either
  // side has any slots yet.
  const slotCount = Math.max(
    1,
    slotsOf(viewer).length,
    focusedOpponent ? slotsOf(focusedOpponent).length : 0,
  )

  useEffect(() => {
    // Unlock interaction when game state changes (server responded)
    setIsLocked(false)
    if (selectedCardId && !viewerHand.some((card) => card.instanceId === selectedCardId)) {
      setSelectedCardId(undefined)
    }
  }, [game.turnNumber, game.turn.cardsPlayedThisTurn, game.turn.phase, viewerHand])

  useEffect(() => {
    if (props.error) {
      setIsLocked(false)
    }
  }, [props.error])

  // Cancel targeting on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedCardId(undefined)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const executeCommand = (action: () => void) => {
    setIsLocked(true)
    setSelectedCardId(undefined)
    action()
  }

  const isDiscardPhase = isViewerTurn && game.turn.phase === 'discard'

  const handleTargetSlot = (ownerId: string, slotId: string) => {
    if (!selectedCard || isLocked || !isViewerTurn) return

    if (selectedCard.cardType === 'drug' && ownerId === viewer.id) {
      audioManager.play('click') // fallback click, semantic sound on land
      triggerGhost(`hand-card-${selectedCard.instanceId}`, `slot-${slotId}`, selectedCard, 'card', () => {
        audioManager.play('drug-play')
      })
      executeCommand(() => props.onPlayDrug(selectedCard.instanceId, slotId))
    } else if (selectedCard.cardType === 'therapy' && ownerId === viewer.id) {
      audioManager.play('click')
      triggerGhost(`hand-card-${selectedCard.instanceId}`, `slot-${slotId}`, selectedCard, 'card', () => {
        audioManager.play('therapy-play')
      })
      executeCommand(() => props.onPlayTherapy(selectedCard.instanceId, slotId))
    } else if (selectedCard.cardType === 'episode' && ownerId !== viewer.id) {
      audioManager.play('click')
      triggerGhost(`hand-card-${selectedCard.instanceId}`, `slot-${slotId}`, selectedCard, 'card', () => {
        audioManager.play('episode')
      })
      executeCommand(() => props.onPlayEpisode(selectedCard.instanceId, ownerId, slotId))
    }
  }

  const handleTargetOpponent = (opponentId: string) => {
    if (!selectedCard || isLocked || !isViewerTurn) {
      audioManager.play('click')
      setFocusedOpponentId(opponentId) // Just focus if not targeting
      return
    }

    audioManager.play('click')
    setFocusedOpponentId(opponentId)
  }

  const handleBackgroundClick = () => {
    if (selectedCardId) setSelectedCardId(undefined)
  }

  return (
    <CardHoverProvider>
    <main
      className={`game-board ${isTargetingMode ? 'targeting-mode' : ''} ${isLocked ? 'interaction-locked' : ''} has-chat ${isChatCollapsed ? 'chat-collapsed' : ''}`}
      onClick={handleBackgroundClick}
      /* --card-w (layout.css) is computed on .game-board itself, so the live
         counts its fit formula reads have to land here too, not on .own-hand
         (--hand-count used to live there, back when only the hand shrank to
         fit) — :root and .own-hand are both the wrong element now: :root
         can't see anything set on a descendant, and .own-hand can't see
         .psyche's slot count. */
      style={{ '--hand-count': sortedHand.length, '--slot-count': slotCount } as CSSProperties}
    >
      <PlayerSidebar
        player={viewer}
        isViewerTurn={isViewerTurn}
        currentPlayerName={current.name}
        phase={game.turn.phase}
        cardsPlayedThisTurn={game.turn.cardsPlayedThisTurn}
        turnNumber={game.turnNumber}
        gameLog={props.gameLog}
      />
      {/* Desktop sidebar renders in every mode, local hot-seat included, so the
          board keeps the same three-column frame regardless of mode — only the
          mobile drawer below stays online-only. */}
      <aside className="chat-sidebar">
        <ChatPanel onSend={sendChat} viewerPlayerId={viewer.id} />
      </aside>
      <div className="top-actions" onClick={(event) => event.stopPropagation()}>
        {props.onLeave && (
          <button type="button" className="btn-danger top-action-btn" onClick={props.onLeave}>
            Về phòng
          </button>
        )}
        {game.players.length === 2 && <button
          type="button"
          className="btn-danger top-action-btn"
          disabled={!isViewerTurn || game.status !== 'playing' || isLocked}
          onClick={() => {
            if (window.confirm('Bạn chắc chắn muốn xin thua ván này?')) executeCommand(props.onForfeit)
          }}
        >
          Xin thua
        </button>}
        <button className="log-icon-btn top-action-icon" type="button" onClick={() => { audioManager.play('click'); setShowLog(!showLog) }} aria-label={t('gameLog')}>
          📜
        </button>
        {props.onSendChat && (
          <button
            className="log-icon-btn top-action-icon chat-icon-btn"
            type="button"
            onClick={() => { audioManager.play('click'); setShowChat(!showChat) }}
            aria-label={t('chatOpen')}
          >
            💬
            {chatUnreadCount > 0 && (
              <span className="chat-unread-badge chat-icon-badge" aria-label={t('chatUnread', { count: chatUnreadCount })}>
                {chatUnreadCount}
              </span>
            )}
          </button>
        )}
        <AudioSettings />
      </div>
      <section className="opponent-zone">
        {opponents.length > 1 && (
          <OpponentAvatarBar
            opponents={opponents}
            focusedOpponentId={watchedOpponentId}
            setFocusedOpponentId={handleTargetOpponent}
            targetPlayerId={
              isTargetingMode &&
              selectedCard?.cardType === 'disorder' &&
              canTargetFocusedOpponent
                ? watchedOpponentId
                : undefined
            }
            currentPlayerId={game.currentPlayerId}
          />
        )}
        {focusedOpponent && (
          <article
            className={`player opponent-player ${isTargetingMode && selectedCard?.cardType === 'disorder' && canTargetFocusedOpponent ? 'target-highlight targetable' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              handleTargetOpponent(focusedOpponent.id)
            }}
          >
            <header className="opponent-header">
              <strong>{focusedOpponent.name}</strong>
            </header>
            <OpponentHand
              count={watchedHandCount}
              playerName={focusedOpponent.name}
              playerId={focusedOpponent.id}
            />
            {/* No `focusedOpponent.id === focusedOpponentId` check: that state is
                undefined until the first click, which hid the button on the
                opponent already being shown. */}
            {selectedCard?.cardType === 'disorder' &&
              isViewerTurn &&
              canTargetFocusedOpponent && (
              <button
                type="button"
                className="primary apply-card-btn"
                onClick={(event) => {
                  event.stopPropagation()
                  triggerGhost(`hand-card-${selectedCard.instanceId}`, `avatar-${focusedOpponent.id}`, selectedCard, 'card', () => audioManager.play('disorder-play'))
                  executeCommand(() => props.onPlayDisorder(selectedCard.instanceId, focusedOpponent.id))
                }}
              >
                Áp dụng vào Tâm trí của {focusedOpponent.name}
              </button>
            )}
            <Psyche
              player={focusedOpponent}
              playerId={focusedOpponent.id}
              selectedCard={selectedCard}
              viewerId={viewer.id}
              isTargetingMode={isTargetingMode}
              onTargetSlot={handleTargetSlot}
            />
          </article>
        )}
      </section>

      <section className="center-zone" id="center-table">
        <div className="deck-area">
          {/* The trade hint is the only .selection-hint variant left here.
              It fires with NO card selected yet (it's asking the player to
              pick one for the trade), so it has no card to anchor above and
              keeps the original centring against .deck-area — .center-zone
              sizes to minmax(var(--card-back-h), 1fr) and then CENTRES
              .deck-area inside that box (flex, align-items/justify-content:
              center), so `bottom: 100%` here lands on the slack that
              centring leaves above .deck-area, not on .center-zone's own
              much smaller padding. See layout.css's .deck-area comment and
              hand.css's .selection-hint comment for the anchor itself.
              The drug/disorder/therapy/episode hints moved out of this
              block: <SelectionHint> is rendered below, inside .own-hand,
              but portals its actual DOM node into document.body and
              positions it with `position: fixed` (see SelectionHint.tsx),
              since they always have a selected card in the hand to anchor
              over instead and .own-hand's own overflow-x:auto would clip
              anything positioned above it. */}
          {isAwaitingTradeCardPlacement && (
            <div className="selection-hint trade-hint">
              Chọn 1 lá trên tay để đưa vào giao dịch trao đổi
            </div>
          )}
          <button id="deck-draw" type="button" className="draw-pile" style={{ padding: 0, background: 'none', border: 'none' }} onClick={() => {
            if (!isLocked) {
              audioManager.play('draw')
              triggerGhost('deck-draw', 'own-hand', undefined, 'cardback')
              props.onDraw()
            }
          }} disabled={!isViewerTurn || game.turn.phase !== 'draw'}>
            <CardBack label={t('drawPile')} count={drawPileCount} />
          </button>
          <div id="deck-discard" className="discard-pile">
            <CardBack label={t('discardPile')} count={discardPileCount} />
          </div>
        </div>
      </section>


      <section className="self-zone">
        {props.error && (
          <div className="game-error-modal" role="alertdialog" aria-modal="true">
            <div className="game-error-panel">
              <h2>Không thể thực hiện</h2>
              <p>{localizeError(props.error)}</p>
              <button type="button" className="primary" onClick={props.onClearError}>Đã hiểu</button>
            </div>
          </div>
        )}

        {isDiscardPhase && (
          <p className="turn-hint">Bạn đang có {viewerHand.length} lá. Hãy chọn và bỏ {viewerHand.length - 6} lá để tiếp tục.</p>
        )}
        
        <div className="hud-glass">
          {isViewerTurn ? <strong>Lượt của bạn</strong> : <span>Lượt của {current.name}</span>}
          <span className="divider">|</span>
          <span>{phaseName(game.turn.phase)}</span>
          <span className="divider">|</span>
          <span>{game.turn.cardsPlayedThisTurn}/2 thẻ</span>
        </div>

        <article className="player viewer-player">
          <header className="own-nameplate">
            <strong>Bạn — {viewer.name}</strong>
          </header>
          <Psyche
            player={viewer}
            playerId={viewer.id}
            selectedCard={selectedCard}
            viewerId={viewer.id}
            isTargetingMode={isTargetingMode}
            onTargetSlot={handleTargetSlot}
          />
        </article>
        
        <div className="hand-and-controls">
          {isTargetingMode && (
            <button 
              type="button" 
              className="cancel-target-btn mobile-only" 
              onClick={() => {
                audioManager.play('click')
                setSelectedCardId(undefined)
              }}
              style={{
                position: 'absolute',
                top: '-3rem',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 100,
                borderRadius: '99px',
                padding: '0.4rem 1.2rem',
                backgroundColor: '#a42c2c',
                borderColor: '#e84848',
                boxShadow: '0 4px 12px #000a'
              }}
            >
              ✖ {t('cancel')}
            </button>
          )}
          <section
            className="hand own-hand"
            id="own-hand"
          >
            {selectedCard && handSelectionHint !== null && (
              <SelectionHint cardInstanceId={selectedCard.instanceId}>{handSelectionHint}</SelectionHint>
            )}
            <div className="cards">
              {sortedHand.map((card) => (
                <div id={`hand-card-${card.instanceId}`} key={card.instanceId}>
                  <CardButton
                    card={card}
                    selected={card.instanceId === selectedCardId}
                    tradePlaced={isTradeEnabled && tradeSession?.phase === 'open' && tradeSession.yourCardId === card.instanceId}
                    onClick={() => {
                      audioManager.play('click')
                      const tradeAction = isTradeEnabled
                        ? resolveTradeHandClick(tradeSession, card.instanceId)
                        : 'select'
                      if (tradeAction === 'clear') {
                        props.onClearTradeCard!()
                        return
                      }
                      if (tradeAction === 'place') {
                        props.onPlaceTradeCard!(card.instanceId)
                        return
                      }
                      if (selectedCardId === card.instanceId) setSelectedCardId(undefined)
                      else setSelectedCardId(card.instanceId)
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
          
          <div className="controls-bar">
            <button
              type="button"
              className="utility-btn"
              onClick={() => setSortMode(sortMode === 'original' ? 'type' : sortMode === 'type' ? 'name' : 'original')}
              title="Sắp xếp bài trên tay"
            >
              {sortMode === 'original' ? 'Sắp xếp' : sortMode === 'type' ? 'Theo loại' : 'Theo tên'}
            </button>
            {isTradeEnabled && (
              <>
                <TradeButton players={tradePlayers} onCancelInvite={props.onCancelTrade!} />
                <TradeInviteBadge
                  players={tradePlayers}
                  onAccept={props.onAcceptTrade!}
                  onDecline={props.onDeclineTrade!}
                />
              </>
            )}
            {isTargetingMode && isViewerTurn && game.turn.phase === 'play' && (
              <button
                type="button"
                className="btn-danger action-btn"
                disabled={isLocked}
                onClick={() => {
                  const currentId = selectedCardId
                  if (currentId) executeCommand(() => props.onManualDiscard(currentId))
                }}
              >
                Bỏ bài
              </button>
            )}
            {isTargetingMode && isDiscardPhase && (
              <button type="button" className="primary action-btn" onClick={() => {
                const currentId = selectedCardId
                if (currentId) {
                  audioManager.play('discard')
                  triggerGhost(`hand-card-${currentId}`, 'deck-discard', selectedCard)
                  executeCommand(() => props.onDiscard(currentId))
                }
              }}>
                {t('discardSelected')}
              </button>
            )}
            <button
              type="button"
              className="primary action-btn end-turn-btn"
              disabled={!isViewerTurn || game.turn.phase !== 'play' || isLocked}
              onClick={() => {
                audioManager.play('click')
                executeCommand(props.onEndTurn)
              }}
            >
              {t('endTurn')}
            </button>
          </div>
        </div>
      </section>

      <GameLogDrawer gameLog={props.gameLog} showLog={showLog} setShowLog={setShowLog} />
      {props.onSendChat && (
        <ChatDrawer
          show={showChat}
          onClose={() => setShowChat(false)}
          onSend={props.onSendChat}
          viewerPlayerId={viewer.id}
        />
      )}
      <GhostLayer />
      {isTradeEnabled && (
        <>
          <TradePartnerPicker partners={tradePartners} onInvite={props.onInviteTrade!} />
          <TradePanel
            players={tradePlayers}
            hand={viewerHand}
            onClear={props.onClearTradeCard!}
            onConfirm={props.onConfirmTrade!}
            onCancel={props.onCancelTrade!}
          />
        </>
      )}
    </main>
    </CardHoverProvider>
  )
}
