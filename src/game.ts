import {
  CRICKET_TARGETS,
  SCHEMA_VERSION,
  type CricketCloseInfo,
  type CricketResult,
  type CricketSettings,
  type CricketTarget,
  type DartInput,
  type DartThrow,
  type GameResult,
  type GameSession,
  type GameSettings,
  type Multiplier,
  type OutRule,
  type Round,
  type Segment,
  type ZeroOneResult,
  type ZeroOneSettings,
  type ZeroOneStats,
} from './models'

export interface ZeroOneState {
  remaining: number
  rounds: Round[]
  cleared: boolean
  limitReached: boolean
  busts: number
  nextRound: number
  nextDart: 1 | 2 | 3
}

export interface CricketState {
  marks: Record<CricketTarget, number>
  totalMarks: number
  closeInfo: CricketCloseInfo[]
  rounds: Round[]
  cleared: boolean
  limitReached: boolean
  nextRound: number
  nextDart: 1 | 2 | 3
}

const average = (value: number, darts: number): number => (darts === 0 ? 0 : value / darts)

function makeId(): string {
  const random = crypto.getRandomValues(new Uint32Array(4))
  return `${Date.now().toString(36)}-${[...random].map((value) => value.toString(36)).join('-')}`
}

export function scoreFor(segment: Segment, multiplier: Multiplier): number {
  if (segment === 'MISS') return 0
  if (segment === 'BULL') return 50
  return segment * multiplier
}

export function marksFor(segment: Segment, multiplier: Multiplier): number {
  if (segment === 'BULL') return multiplier === 2 ? 2 : 1
  return typeof segment === 'number' && segment >= 15 && segment <= 20 ? multiplier : 0
}

export function formatThrow(dart: Pick<DartInput, 'segment' | 'multiplier'>): string {
  if (dart.segment === 'MISS') return 'MISS'
  if (dart.segment === 'BULL') return dart.multiplier === 2 ? 'Inner BULL' : 'Outer BULL'
  const prefix = dart.multiplier === 3 ? 'T' : dart.multiplier === 2 ? 'D' : 'S'
  return `${prefix}${dart.segment}`
}

function validCheckout(rule: OutRule, dart: DartThrow): boolean {
  if (rule === 'straight') return true
  return dart.segment === 'BULL' || dart.multiplier === 2 || dart.multiplier === 3
}

function groupRounds(throws: readonly DartThrow[]): Map<number, DartThrow[]> {
  const grouped = new Map<number, DartThrow[]>()
  for (const dart of throws) {
    const round = grouped.get(dart.round) ?? []
    round.push(dart)
    grouped.set(dart.round, round)
  }
  return grouped
}

export function replayZeroOne(settings: ZeroOneSettings, throws: readonly DartThrow[]): ZeroOneState {
  let remaining: number = settings.startingScore
  let cleared = false
  let busts = 0
  const rounds: Round[] = []

  for (const [number, roundThrows] of groupRounds(throws)) {
    const startRemaining = remaining
    let provisional: number = remaining
    let bust = false

    for (const dart of roundThrows) {
      const candidate = provisional - dart.score
      const invalidZero = candidate === 0 && !validCheckout(settings.outRule, dart)
      const impossibleOne = candidate === 1 && settings.outRule !== 'straight'
      if (candidate < 0 || invalidZero || impossibleOne) {
        bust = true
        busts += 1
        provisional = startRemaining
        break
      }
      provisional = candidate
      if (candidate === 0) {
        cleared = true
        break
      }
    }

    remaining = bust ? startRemaining : provisional
    rounds.push({
      number,
      throws: [...roundThrows],
      validScore: bust ? 0 : startRemaining - remaining,
      marks: 0,
      bust,
      startRemaining,
      endRemaining: remaining,
    })
    if (cleared) break
  }

  const lastRound = rounds.at(-1)
  const roundEnded = lastRound !== undefined && (lastRound.bust || lastRound.throws.length >= 3)
  const limitReached = !cleared && settings.roundLimit !== null && lastRound !== undefined &&
    lastRound.number >= settings.roundLimit && roundEnded
  const nextRound = lastRound === undefined ? 1 : roundEnded ? lastRound.number + 1 : lastRound.number
  const nextDart = lastRound === undefined || roundEnded ? 1 : ((lastRound.throws.length + 1) as 1 | 2 | 3)

  return { remaining, rounds, cleared, limitReached, busts, nextRound, nextDart }
}

function zeroOneStats(rounds: readonly Round[]): ZeroOneStats {
  const darts = rounds.reduce((sum, round) => sum + round.throws.length, 0)
  const validScore = rounds.reduce((sum, round) => sum + round.validScore, 0)
  const ppd = average(validScore, darts)
  return { ppd, ppr: ppd * 3, darts, rounds: rounds.length, validScore }
}

export function calculateZeroOneResult(settings: ZeroOneSettings, throws: readonly DartThrow[]): ZeroOneResult {
  const state = replayZeroOne(settings, throws)
  const threshold = settings.startingScore === 501 ? 100 : 140
  const cutoffIndex = state.rounds.findIndex((round) => (round.endRemaining ?? settings.startingScore) <= threshold)
  const eightyRounds = cutoffIndex >= 0 ? state.rounds.slice(0, cutoffIndex + 1) : state.rounds
  const all = zeroOneStats(state.rounds)

  return {
    game: '01',
    cleared: state.cleared,
    remaining: state.remaining,
    eighty: zeroOneStats(eightyRounds),
    all: {
      ...all,
      totalDarts: throws.length,
      highestRound: Math.max(0, ...state.rounds.map((round) => round.validScore)),
      busts: state.busts,
      clearDarts: state.cleared ? throws.length : null,
    },
  }
}

function emptyCricketMarks(): Record<CricketTarget, number> {
  return { 20: 0, 19: 0, 18: 0, 17: 0, 16: 0, 15: 0, BULL: 0 }
}

function asCricketTarget(segment: Segment): CricketTarget | null {
  return CRICKET_TARGETS.find((target) => target === segment) ?? null
}

export function replayCricket(settings: CricketSettings, throws: readonly DartThrow[]): CricketState {
  const marks = emptyCricketMarks()
  const closeInfo: CricketCloseInfo[] = []
  let totalMarks = 0

  throws.forEach((dart, index) => {
    totalMarks += dart.marks
    const target = asCricketTarget(dart.segment)
    if (target === null) return
    const before = marks[target]
    marks[target] = Math.min(3, before + dart.marks)
    if (before < 3 && marks[target] === 3) {
      closeInfo.push({
        target,
        order: closeInfo.length + 1,
        round: dart.round,
        dartInRound: dart.dartInRound,
        throwsUsed: index + 1,
      })
    }
  })

  const rounds = [...groupRounds(throws)].map(([number, roundThrows]) => ({
    number,
    throws: [...roundThrows],
    validScore: 0,
    marks: roundThrows.reduce((sum, dart) => sum + dart.marks, 0),
    bust: false,
  }))
  const allClosed = closeInfo.length === CRICKET_TARGETS.length
  const cleared = settings.cricketMode === 'all-close' && allClosed
  const limitReached = settings.cricketMode === 'twenty-rounds' && throws.length >= 60
  const last = throws.at(-1)
  const nextRound = last === undefined ? 1 : last.dartInRound === 3 ? last.round + 1 : last.round
  const nextDart = last === undefined || last.dartInRound === 3 ? 1 : ((last.dartInRound + 1) as 2 | 3)

  return { marks, totalMarks, closeInfo, rounds, cleared, limitReached, nextRound, nextDart }
}

export function calculateCricketResult(settings: CricketSettings, throws: readonly DartThrow[]): CricketResult {
  const state = replayCricket(settings, throws)
  const sixthClose = state.closeInfo.find((close) => close.order === 6)
  const eightyThrows = sixthClose === undefined ? [...throws] : throws.filter((dart) => dart.round <= sixthClose.round)
  const eightyMarks = eightyThrows.reduce((sum, dart) => sum + dart.marks, 0)
  const totalDarts = throws.length
  const totalRounds = new Set(throws.map((dart) => dart.round)).size
  const eightyRounds = new Set(eightyThrows.map((dart) => dart.round)).size

  return {
    game: 'cricket',
    cleared: state.closeInfo.length === CRICKET_TARGETS.length,
    eighty: {
      mpr: average(eightyMarks, eightyThrows.length) * 3,
      totalMarks: eightyMarks,
      totalDarts: eightyThrows.length,
      rounds: eightyRounds,
    },
    all: {
      mpr: average(state.totalMarks, totalDarts) * 3,
      totalMarks: state.totalMarks,
      totalDarts,
      rounds: totalRounds,
      closedCount: state.closeInfo.length,
    },
    marks: state.marks,
    closeInfo: state.closeInfo,
  }
}

export function calculateResult(settings: GameSettings, throws: readonly DartThrow[]): GameResult {
  return settings.game === '01'
    ? calculateZeroOneResult(settings, throws)
    : calculateCricketResult(settings, throws)
}

export function createSession(settings: GameSettings, now = new Date()): GameSession {
  const timestamp = now.toISOString()
  return {
    id: makeId(),
    schemaVersion: SCHEMA_VERSION,
    settings,
    status: 'in_progress',
    startedAt: timestamp,
    updatedAt: timestamp,
    throws: [],
  }
}

function normalizedInput(input: DartInput): DartInput {
  if (input.segment === 'MISS') return { segment: 'MISS', multiplier: 0 }
  if (input.segment === 'BULL') {
    return { segment: 'BULL', multiplier: input.multiplier === 2 ? 2 : 1 }
  }
  if (input.segment < 1 || input.segment > 20 || ![1, 2, 3].includes(input.multiplier)) {
    throw new Error('無効なダーツ入力です')
  }
  return input
}

export function addThrow(session: GameSession, input: DartInput, now = new Date()): GameSession {
  if (session.status !== 'in_progress') throw new Error('終了したゲームには入力できません')
  const normalized = normalizedInput(input)
  const position = session.settings.game === '01'
    ? replayZeroOne(session.settings, session.throws)
    : replayCricket(session.settings, session.throws)
  const dart: DartThrow = {
    ...normalized,
    id: makeId(),
    score: scoreFor(normalized.segment, normalized.multiplier),
    marks: marksFor(normalized.segment, normalized.multiplier),
    round: position.nextRound,
    dartInRound: position.nextDart,
    thrownAt: now.toISOString(),
    bust: false,
  }
  const throws = [...session.throws, dart]
  const state = session.settings.game === '01'
    ? replayZeroOne(session.settings, throws)
    : replayCricket(session.settings, throws)
  const finished = state.cleared || state.limitReached
  const bust = state.rounds.at(-1)?.bust ?? false
  throws[throws.length - 1] = { ...dart, bust }
  const timestamp = now.toISOString()
  return {
    ...session,
    throws,
    status: finished ? 'completed' : 'in_progress',
    updatedAt: timestamp,
    ...(finished ? { endedAt: timestamp, result: calculateResult(session.settings, throws) } : {}),
  }
}

export function undoThrow(session: GameSession, now = new Date()): GameSession {
  if (session.throws.length === 0) return session
  const throws = session.throws.slice(0, -1)
  return {
    ...session,
    status: 'in_progress',
    updatedAt: now.toISOString(),
    throws,
    endedAt: undefined,
    result: undefined,
  }
}

export function abortSession(session: GameSession, now = new Date()): GameSession {
  const timestamp = now.toISOString()
  return { ...session, status: 'aborted', updatedAt: timestamp, endedAt: timestamp }
}
