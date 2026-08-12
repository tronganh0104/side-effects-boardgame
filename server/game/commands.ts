import type { EpisodeEffectOptions } from '../../src/game/engine/episode'

export type GameCommand =
  | { type: 'draw' }
  | { type: 'forfeit' }
  | { type: 'playDrug'; drugCardId: string; disorderCardId: string }
  | { type: 'playDisorder'; disorderCardId: string; targetPlayerId: string }
  | {
      type: 'playEpisode'
      episodeCardId: string
      targetPlayerId: string
      targetDisorderCardId: string
      options?: EpisodeEffectOptions
    }
  | { type: 'playTherapy'; therapyCardId: string; disorderCardId: string }
  | { type: 'discard'; cardInstanceId: string }
  | { type: 'discardManual'; cardInstanceId: string }
  | { type: 'endTurn' }
  | {
      type: 'tradeCards'
      initiatorPlayerId: string
      initiatorCardId: string
      partnerPlayerId: string
      partnerCardId: string
    }
