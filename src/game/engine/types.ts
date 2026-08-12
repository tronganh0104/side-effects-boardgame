import type {
  CardInstance,
  DisorderDefinition,
  DrugDefinition,
} from '../cards/types'

export interface PsycheSlot {
  disorder: CardInstance<DisorderDefinition>
  drug?: CardInstance<DrugDefinition>
}

export interface PsycheState {
  slots: PsycheSlot[]
}

export interface TemporaryEffectsState {
  skipTurns: number
  cannotPlayTurns: number
  skipDrawTurns: number
}

export interface PlayerState {
  id: string
  name: string
  hand: CardInstance[]
  psyche: PsycheState
  effects: TemporaryEffectsState
  tradeUsedThisTurn: boolean
}

export interface TurnState {
  number: number
  currentPlayerId: string
  phase: 'draw' | 'play' | 'discard'
  cardsPlayedThisTurn: number
  cardsDrawnThisTurn: number
}

export interface GameState {
  players: PlayerState[]
  drawPile: CardInstance[]
  discardPile: CardInstance[]
  currentPlayerIndex: number
  currentPlayerId: string
  turnNumber: number
  turn: TurnState
  status: 'setup' | 'playing' | 'finished'
  winnerPlayerId?: string
}
