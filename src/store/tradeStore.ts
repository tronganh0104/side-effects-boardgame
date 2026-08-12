import { create } from 'zustand'
import type { TradeClosedPayload, TradeStatePayload } from '../game/trade/types'

/**
 * Mirrors exactly what `trade:state` carries — see `src/game/trade/types.ts`.
 * `theyPlaced` stays a boolean because that is all the payload ever has:
 * there is no field here that could hold the opponent's card id, so this
 * store cannot invent state the server never sent (see AGENTS.md / the
 * design doc's "shape-not-strip" principle for `theyPlaced`).
 */
export type TradeSessionView = TradeStatePayload

interface TradeStore {
  /** The current negotiation session, or none. Wholly server-derived. */
  session: TradeSessionView | null
  /**
   * Local-only UI flag: is the partner-picker (the "who do you want to
   * trade with" list) open on this client. The server has no concept of
   * this — it only exists once an invite has actually been sent — so it is
   * kept on its own field, never folded into `session`.
   */
  isPartnerPickerOpen: boolean
  /** Why the last session ended, for the UI to explain to the player. */
  lastCloseReason: TradeClosedPayload['reason'] | null
  /** Applies an incoming `trade:state`. Replaces the session wholesale — a
   * stale field from a previous payload (e.g. `theyPlaced: true` after they
   * cleared their slot) must never survive a merge. */
  applyState: (payload: TradeStatePayload) => void
  /** Applies an incoming `trade:closed`: clears the session, records why. */
  applyClosed: (payload: TradeClosedPayload) => void
  openPartnerPicker: () => void
  closePartnerPicker: () => void
  reset: () => void
}

const initialState = {
  session: null,
  isPartnerPickerOpen: false,
  lastCloseReason: null,
} satisfies Pick<TradeStore, 'session' | 'isPartnerPickerOpen' | 'lastCloseReason'>

export const useTradeStore = create<TradeStore>((set) => ({
  ...initialState,
  applyState: (payload) => set({ session: payload }),
  applyClosed: (payload) =>
    set({ session: null, lastCloseReason: payload.reason }),
  openPartnerPicker: () => set({ isPartnerPickerOpen: true }),
  closePartnerPicker: () => set({ isPartnerPickerOpen: false }),
  reset: () => set({ ...initialState }),
}))
