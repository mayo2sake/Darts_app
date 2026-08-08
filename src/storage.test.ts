import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addThrow, createSession } from './game'
import {
  deleteAllSessions,
  deleteSession,
  getActiveSession,
  getSession,
  initDb,
  listCompletedSessions,
  resetDbForTests,
  saveSession,
} from './storage'

beforeEach(resetDbForTests)
afterEach(resetDbForTests)

describe('IndexedDB保存', () => {
  it('初回起動でDBを初期化し、保存データがなくても動く', async () => {
    await expect(initDb()).resolves.toBeInstanceOf(IDBDatabase)
    await expect(getActiveSession()).resolves.toBeUndefined()
    await expect(listCompletedSessions()).resolves.toEqual([])
  })

  it('入力直後に保存し、再読込相当で進行中ゲームを再開できる', async () => {
    const session = addThrow(createSession({ game: '01', startingScore: 501, outRule: 'straight', roundLimit: 15 }), { segment: 20, multiplier: 3 })
    await saveSession(session)
    const loaded = await getActiveSession()
    expect(loaded?.id).toBe(session.id)
    expect(loaded?.throws[0]?.score).toBe(60)
  })

  it('完了ゲームを履歴へ表示できる形で取得する', async () => {
    let session = createSession({ game: 'cricket', cricketMode: 'all-close' })
    for (const input of [
      { segment: 20, multiplier: 3 }, { segment: 19, multiplier: 3 }, { segment: 18, multiplier: 3 },
      { segment: 17, multiplier: 3 }, { segment: 16, multiplier: 3 }, { segment: 15, multiplier: 3 },
      { segment: 'BULL' as const, multiplier: 2 }, { segment: 'BULL' as const, multiplier: 1 },
    ] as const) session = addThrow(session, input)
    await saveSession(session)
    const history = await listCompletedSessions()
    expect(history).toHaveLength(1)
    expect(history[0]?.result?.cleared).toBe(true)
  })

  it('個別履歴を削除する', async () => {
    const session = createSession({ game: '01', startingScore: 501, outRule: 'straight', roundLimit: 15 })
    await saveSession(session)
    await deleteSession(session.id)
    await expect(getSession(session.id)).resolves.toBeUndefined()
  })

  it('全データを削除する', async () => {
    const session = createSession({ game: '01', startingScore: 501, outRule: 'straight', roundLimit: 15 })
    await saveSession(session)
    await deleteAllSessions()
    await expect(getActiveSession()).resolves.toBeUndefined()
  })
})
