import { describe, expect, it } from 'vitest'
import {
  addThrow,
  calculateCricketResult,
  calculateZeroOneResult,
  createSession,
  finishCricketSession,
  marksFor,
  replayCricket,
  replayZeroOne,
  scoreFor,
  undoThrow,
} from './game'
import type { DartInput, GameSession, ZeroOneSettings } from './models'

const zeroSettings = (overrides: Partial<ZeroOneSettings> = {}): ZeroOneSettings => ({
  game: '01',
  startingScore: 501,
  outRule: 'straight',
  roundLimit: null,
  ...overrides,
})

const play = (session: GameSession, inputs: readonly DartInput[]): GameSession =>
  inputs.reduce((current, input, index) => addThrow(current, input, new Date(2026, 0, 1, 0, 0, index)), session)

const t = (segment: number): DartInput => ({ segment, multiplier: 3 })
const d = (segment: number): DartInput => ({ segment, multiplier: 2 })
const s = (segment: number): DartInput => ({ segment, multiplier: 1 })
const miss: DartInput = { segment: 'MISS', multiplier: 0 }
const outer: DartInput = { segment: 'BULL', multiplier: 1 }
const inner: DartInput = { segment: 'BULL', multiplier: 2 }

const repeat = (input: DartInput, count: number): DartInput[] => Array.from({ length: count }, () => input)
const bringTo40 = (outRule: ZeroOneSettings['outRule']): GameSession =>
  play(createSession(zeroSettings({ outRule })), [...repeat(t(20), 7), d(20), s(1)])
const bringTo50 = (outRule: ZeroOneSettings['outRule']): GameSession =>
  play(createSession(zeroSettings({ outRule })), [...repeat(t(20), 7), d(15), s(1)])
const bringTo60 = (): GameSession =>
  play(createSession(zeroSettings({ outRule: 'master' })), [...repeat(t(20), 7), s(20), s(1)])

describe('ダーツの基本計算', () => {
  it('Single / Double / Triple の得点を計算する', () => {
    expect(scoreFor(20, 1)).toBe(20)
    expect(scoreFor(16, 2)).toBe(32)
    expect(scoreFor(19, 3)).toBe(57)
  })

  it('Outer / Inner BULL はどちらも50点', () => {
    expect(scoreFor('BULL', 1)).toBe(50)
    expect(scoreFor('BULL', 2)).toBe(50)
  })
})

describe('01ゲーム', () => {
  it('Straight Outでちょうど0点にすると終了する', () => {
    const result = play(createSession(zeroSettings()), [...repeat(t(20), 8), s(20), s(1)])
    expect(result.status).toBe('completed')
    expect(result.result?.cleared).toBe(true)
  })

  it('Master OutでTriple、Double、Outer/Inner BULLから終了できる', () => {
    expect(addThrow(bringTo60(), t(20)).result?.cleared).toBe(true)
    expect(addThrow(bringTo40('master'), d(20)).result?.cleared).toBe(true)
    expect(addThrow(bringTo50('master'), outer).result?.cleared).toBe(true)
    expect(addThrow(bringTo50('master'), inner).result?.cleared).toBe(true)
  })

  it('マイナス点はBUSTし、ラウンド開始点へ戻る', () => {
    const session = addThrow(bringTo40('straight'), t(20))
    const state = replayZeroOne(session.settings as ZeroOneSettings, session.throws)
    expect(state.remaining).toBe(40)
    expect(state.rounds.at(-1)?.validScore).toBe(0)
  })

  it('Master Outで残り1点になるとBUSTする', () => {
    const atTwo = play(createSession(zeroSettings({ outRule: 'master' })), [...repeat(t(20), 8), s(19)])
    expect(replayZeroOne(atTwo.settings as ZeroOneSettings, atTwo.throws).remaining).toBe(2)
    const busted = addThrow(atTwo, s(1))
    expect(replayZeroOne(busted.settings as ZeroOneSettings, busted.throws).remaining).toBe(2)
    expect(busted.throws.at(-1)?.bust).toBe(true)
  })

  it('UNDOでBUST直前の状態へ戻る', () => {
    const before = addThrow(bringTo40('master'), s(20))
    const busted = addThrow(before, s(20))
    const undone = undoThrow(busted)
    const state = replayZeroOne(undone.settings as ZeroOneSettings, undone.throws)
    expect(state.remaining).toBe(20)
    expect(state.rounds.at(-1)?.bust).toBe(false)
    expect(undone.status).toBe('in_progress')
  })

  it('501の80％スタッツは残り100点以下になったラウンド全体まで', () => {
    const session = play(createSession(zeroSettings()), [...repeat(t(20), 6), s(20), s(20), s(1)])
    const result = calculateZeroOneResult(session.settings as ZeroOneSettings, session.throws)
    expect(result.remaining).toBe(100)
    expect(result.eighty.rounds).toBe(3)
    expect(result.eighty.darts).toBe(9)
    expect(result.eighty.validScore).toBe(401)
  })

  it('701の80％スタッツは残り140点以下になったラウンド全体まで', () => {
    const settings = zeroSettings({ startingScore: 701 })
    const session = play(createSession(settings), [...repeat(t(20), 9), s(20), s(1), miss])
    const result = calculateZeroOneResult(settings, session.throws)
    expect(result.remaining).toBe(140)
    expect(result.eighty.rounds).toBe(4)
    expect(result.eighty.darts).toBe(12)
  })

  it('ラウンド上限で未クリアとして終了する', () => {
    const session = play(createSession(zeroSettings({ roundLimit: 15 })), repeat(miss, 45))
    expect(session.status).toBe('completed')
    expect(session.result?.cleared).toBe(false)
  })
})

describe('クリケット', () => {
  it('Single / Double / Triple とBULLのマーク数を計算する', () => {
    expect(marksFor(20, 1)).toBe(1)
    expect(marksFor(19, 2)).toBe(2)
    expect(marksFor(18, 3)).toBe(3)
    expect(marksFor('BULL', 1)).toBe(1)
    expect(marksFor('BULL', 2)).toBe(2)
  })

  it('3マークでクローズし、以後も総マーク数へ加算する', () => {
    const settings = { game: 'cricket', cricketMode: 'all-close' } as const
    const session = play(createSession(settings), [t(20), d(20)])
    const state = replayCricket(settings, session.throws)
    expect(state.marks[20]).toBe(3)
    expect(state.totalMarks).toBe(5)
  })

  it('6ナンバーを閉じたラウンド全体で80％スタッツを固定する', () => {
    const settings = { game: 'cricket', cricketMode: 'all-close' } as const
    const session = play(createSession(settings), [t(20), t(19), t(18), t(17), t(16), t(15), miss, outer])
    const result = calculateCricketResult(settings, session.throws)
    expect(result.eighty.rounds).toBe(2)
    expect(result.eighty.totalDarts).toBe(6)
    expect(result.eighty.totalMarks).toBe(18)
  })

  it('全クローズモードは最後のナンバーを閉じた投で終了する', () => {
    const settings = { game: 'cricket', cricketMode: 'all-close' } as const
    const session = play(createSession(settings), [t(20), t(19), t(18), t(17), t(16), t(15), inner, outer])
    expect(session.status).toBe('completed')
    expect(session.throws).toHaveLength(8)
    expect(session.result?.cleared).toBe(true)
  })

  it('20ラウンドモードは60投で終了する', () => {
    const settings = { game: 'cricket', cricketMode: 'twenty-rounds' } as const
    const session = play(createSession(settings), repeat(miss, 60))
    expect(session.status).toBe('completed')
    expect(session.throws).toHaveLength(60)
  })

  it('対象外ナンバーとMISSは0マークで投数に含む', () => {
    const settings = { game: 'cricket', cricketMode: 'all-close' } as const
    const session = play(createSession(settings), [t(14), s(1), miss])
    const result = calculateCricketResult(settings, session.throws)
    expect(result.all.totalMarks).toBe(0)
    expect(result.all.totalDarts).toBe(3)
  })

  it('UNDOでクローズ状態とスタッツが戻る', () => {
    const settings = { game: 'cricket', cricketMode: 'all-close' } as const
    const closed = play(createSession(settings), [s(20), d(20)])
    const undone = undoThrow(closed)
    const state = replayCricket(settings, undone.throws)
    expect(state.marks[20]).toBe(1)
    expect(state.closeInfo).toHaveLength(0)
    expect(calculateCricketResult(settings, undone.throws).all.totalMarks).toBe(1)
  })

  it('対戦中でも現時点の投球で手動終了し、結果を保存できる', () => {
    const settings = { game: 'cricket', cricketMode: 'twenty-rounds' } as const
    const playing = play(createSession(settings), [t(20), d(19), miss])
    const ended = finishCricketSession(playing, new Date('2026-01-01T01:00:00.000Z'))
    expect(ended.status).toBe('completed')
    expect(ended.endedAt).toBe('2026-01-01T01:00:00.000Z')
    expect(ended.result?.game).toBe('cricket')
    if (ended.result?.game !== 'cricket') throw new Error('クリケット結果が必要です')
    expect(ended.result.cleared).toBe(false)
    expect(ended.result.all.totalDarts).toBe(3)
    expect(ended.result.all.totalMarks).toBe(5)
    expect(ended.result.all.mpr).toBe(5)
  })
})
