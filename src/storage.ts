import type { GameSession } from './models'

export const DB_NAME = 'solo-darts-stats'
export const DB_VERSION = 1
const STORE = 'sessions'

let connection: Promise<IDBDatabase> | null = null

export function initDb(): Promise<IDBDatabase> {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('startedAt', 'startedAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDBを開けませんでした'))
    request.onblocked = () => reject(new Error('IndexedDBの更新がブロックされました'))
  })
  return connection
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB操作に失敗しました'))
  })
}

export async function saveSession(session: GameSession): Promise<void> {
  const db = await initDb()
  const tx = db.transaction(STORE, 'readwrite')
  await requestResult(tx.objectStore(STORE).put(session))
}

export async function getSession(id: string): Promise<GameSession | undefined> {
  const db = await initDb()
  const tx = db.transaction(STORE, 'readonly')
  return requestResult(tx.objectStore(STORE).get(id)) as Promise<GameSession | undefined>
}

export async function listSessions(): Promise<GameSession[]> {
  const db = await initDb()
  const tx = db.transaction(STORE, 'readonly')
  const sessions = await requestResult(tx.objectStore(STORE).getAll()) as GameSession[]
  return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export async function getActiveSession(): Promise<GameSession | undefined> {
  const sessions = await listSessions()
  return sessions.find((session) => session.status === 'in_progress')
}

export async function listCompletedSessions(): Promise<GameSession[]> {
  const sessions = await listSessions()
  return sessions.filter((session) => session.status === 'completed')
}

export async function deleteSession(id: string): Promise<void> {
  const db = await initDb()
  const tx = db.transaction(STORE, 'readwrite')
  await requestResult(tx.objectStore(STORE).delete(id))
}

export async function deleteAllSessions(): Promise<void> {
  const db = await initDb()
  const tx = db.transaction(STORE, 'readwrite')
  await requestResult(tx.objectStore(STORE).clear())
}

export async function resetDbForTests(): Promise<void> {
  const db = await connection?.catch(() => null)
  db?.close()
  connection = null
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('テストDBを削除できませんでした'))
  })
}
