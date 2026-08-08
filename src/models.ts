export const APP_NAME = 'Solo Darts Stats'
export const SCHEMA_VERSION = 1
export const CRICKET_TARGETS = [20, 19, 18, 17, 16, 15, 'BULL'] as const

export type CricketTarget = (typeof CRICKET_TARGETS)[number]
export type Segment = number | 'BULL' | 'MISS'
export type Multiplier = 0 | 1 | 2 | 3
export type OutRule = 'straight' | 'master'
export type GameStatus = 'in_progress' | 'completed' | 'aborted'

export interface ZeroOneSettings {
  game: '01'
  startingScore: 501 | 701
  outRule: OutRule
  roundLimit: 15 | 20 | null
}

export interface CricketSettings {
  game: 'cricket'
  cricketMode: 'twenty-rounds' | 'all-close'
}

export type GameSettings = ZeroOneSettings | CricketSettings

export interface DartInput {
  segment: Segment
  multiplier: Multiplier
}

export interface DartThrow extends DartInput {
  id: string
  score: number
  marks: number
  round: number
  dartInRound: 1 | 2 | 3
  thrownAt: string
  bust: boolean
}

export interface Round {
  number: number
  throws: DartThrow[]
  validScore: number
  marks: number
  bust: boolean
  startRemaining?: number
  endRemaining?: number
}

export interface ZeroOneStats {
  ppd: number
  ppr: number
  darts: number
  rounds: number
  validScore: number
}

export interface ZeroOneResult {
  game: '01'
  cleared: boolean
  remaining: number
  eighty: ZeroOneStats
  all: ZeroOneStats & {
    totalDarts: number
    highestRound: number
    busts: number
    clearDarts: number | null
  }
}

export interface CricketCloseInfo {
  target: CricketTarget
  order: number
  round: number
  dartInRound: 1 | 2 | 3
  throwsUsed: number
}

export interface CricketStats {
  mpr: number
  totalMarks: number
  totalDarts: number
  rounds: number
}

export interface CricketResult {
  game: 'cricket'
  cleared: boolean
  eighty: CricketStats
  all: CricketStats & { closedCount: number }
  marks: Record<CricketTarget, number>
  closeInfo: CricketCloseInfo[]
}

export type GameResult = ZeroOneResult | CricketResult

export interface GameSession {
  id: string
  schemaVersion: number
  settings: GameSettings
  status: GameStatus
  startedAt: string
  updatedAt: string
  endedAt?: string
  throws: DartThrow[]
  result?: GameResult
}
