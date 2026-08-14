import { useChatStore } from '../store/chatStore'
import { useTradeStore } from '../store/tradeStore'
import { clearSavedSession } from './multiplayerClient'

export interface MultiplayerRoomUiReset {
  clearRoom(): void
  clearGame(): void
  clearSession(): void
  clearGameLog(): void
}

/** Clears all UI state that is meaningful only while a room seat is valid. */
export function resetMultiplayerRoomUi(reset: MultiplayerRoomUiReset): void {
  reset.clearRoom()
  reset.clearGame()
  reset.clearSession()
  reset.clearGameLog()
  useChatStore.getState().reset()
  useTradeStore.getState().reset()
}

/** Explicit acknowledgement of an online result ends its recovery context. */
export function exitFinishedOnlineGame(
  reset: MultiplayerRoomUiReset,
  onBack: () => void,
): void {
  clearSavedSession()
  resetMultiplayerRoomUi(reset)
  onBack()
}

export function exitFinishedLocalGame(
  resetLocalGame: () => void,
  resetLocalTrade: () => void,
  onBack: () => void,
): void {
  resetLocalGame()
  resetLocalTrade()
  onBack()
}
