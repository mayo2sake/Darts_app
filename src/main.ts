import { registerSW } from 'virtual:pwa-register'
import './style.css'
import {
  abortSession,
  addThrow,
  calculateResult,
  createSession,
  finishCricketSession,
  formatThrow,
  replayCricket,
  replayZeroOne,
  undoThrow,
} from './game'
import { APP_NAME, CRICKET_TARGETS, type DartInput, type GameSession, type GameSettings, type Multiplier } from './models'
import {
  deleteSession,
  getActiveSession,
  getSession,
  initDb,
  listCompletedSessions,
  saveSession,
} from './storage'

type Screen = 'home' | 'settings' | 'play' | 'result' | 'history'

const appElement = document.querySelector<HTMLDivElement>('#app')
if (appElement === null) throw new Error('#app が見つかりません')
const app: HTMLDivElement = appElement

let screen: Screen = 'home'
let activeSession: GameSession | undefined
let viewingSession: GameSession | undefined
let completedSessions: GameSession[] = []
let selectedMultiplier: Multiplier = 1
let draftGame: '501' | '701' | 'cricket' = '501'
let saveError = ''

registerSW({ immediate: true })

const number = (value: number): string => value.toFixed(2)
const dateTime = (value: string): string => new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value))

function gameLabel(session: GameSession): string {
  return session.settings.game === '01' ? String(session.settings.startingScore) : 'クリケット'
}

function settingsLabel(settings: GameSettings): string {
  if (settings.game === 'cricket') {
    return settings.cricketMode === 'all-close' ? '全クローズモード' : '20ラウンドモード'
  }
  const out = settings.outRule === 'straight' ? 'Straight Out' : 'Master Out'
  return `${settings.startingScore} / ${out} / ${settings.roundLimit === null ? '上限なし' : `${settings.roundLimit}R`}`
}

function shell(content: string, title = APP_NAME): string {
  const back = screen !== 'home' && screen !== 'play'
    ? '<button class="icon-button" data-action="back" aria-label="前の画面へ戻る">←</button>'
    : '<span class="brand-mark" aria-hidden="true">◎</span>'
  return `
    <header class="app-header app-header-${screen}">
      ${back}
      <div><p class="eyebrow">SOLO DARTS</p><h1>${title}</h1></div>
      <span class="offline-indicator" title="端末内保存"><span>●</span> LOCAL</span>
    </header>
    ${saveError ? `<div class="error-banner" role="alert">${saveError}</div>` : ''}
    <main id="main" data-screen="${screen}">${content}</main>
  `
}

function homeView(): string {
  const resume = activeSession === undefined ? '' : `
    <button class="resume-card" data-action="resume">
      <span><span class="eyebrow">進行中</span><strong>${gameLabel(activeSession)}</strong></span>
      <span>${activeSession.throws.length}投 · 再開 →</span>
    </button>`
  return shell(`
    <section class="hero">
      <div class="hero-target" aria-hidden="true"><i></i><b></b></div>
      <p class="eyebrow">ONE DART AT A TIME</p>
      <h2>ひとりの練習を、<br><em>数字に変える。</em></h2>
      <p>501・701・1人用クリケットを1投ずつ記録。データはこの端末だけに保存されます。</p>
      <button class="primary-button" data-action="new-game">新しいゲーム <span>→</span></button>
    </section>
    ${resume}
    <section class="home-grid">
      <button class="menu-card" data-action="history"><span class="menu-icon">▤</span><span><strong>履歴</strong><small>${completedSessions.length}ゲームを保存</small></span><b>→</b></button>
      <article class="privacy-card"><span class="menu-icon">⌂</span><span><strong>完全ローカル</strong><small>通信・ログイン・解析なし</small></span></article>
    </section>
    <aside class="notice"><strong>保存について</strong><p>履歴はIndexedDBにのみ保存されます。ブラウザのサイトデータを削除すると履歴も消えます。</p></aside>
    <footer>本アプリはDARTSLIVE公式アプリではありません。</footer>
  `)
}

function settingsView(): string {
  const isCricket = draftGame === 'cricket'
  return shell(`
    <form id="settings-form" class="settings-form">
      <section>
        <p class="step-label"><span>01</span> ゲーム</p>
        <div class="segmented three">
          ${(['501', '701', 'cricket'] as const).map((game) => `
            <label><input type="radio" name="game" value="${game}" ${draftGame === game ? 'checked' : ''}><span>${game === 'cricket' ? 'CRICKET' : game}</span></label>
          `).join('')}
        </div>
      </section>
      ${isCricket ? `
        <section>
          <p class="step-label"><span>02</span> 終了モード</p>
          <div class="option-list">
            <label class="option-card"><input type="radio" name="cricketMode" value="twenty-rounds" checked><span><strong>20ラウンド</strong><small>全ナンバーを閉じても60投まで継続</small></span></label>
            <label class="option-card"><input type="radio" name="cricketMode" value="all-close"><span><strong>全クローズ</strong><small>7ナンバーを閉じた投で終了</small></span></label>
          </div>
        </section>` : `
        <section>
          <p class="step-label"><span>02</span> アウトルール</p>
          <div class="option-list compact">
            <label class="option-card"><input type="radio" name="outRule" value="straight" checked><span><strong>Straight Out</strong><small>得点箇所を問わず0点</small></span></label>
            <label class="option-card"><input type="radio" name="outRule" value="master"><span><strong>Master Out</strong><small>Double / Triple / BULL</small></span></label>
          </div>
        </section>
        <section>
          <p class="step-label"><span>03</span> ラウンド上限</p>
          <div class="segmented three">
            <label><input type="radio" name="roundLimit" value="15" checked><span>15R</span></label>
            <label><input type="radio" name="roundLimit" value="20"><span>20R</span></label>
            <label><input type="radio" name="roundLimit" value="none"><span>なし</span></label>
          </div>
        </section>`}
      <button class="primary-button sticky-action" type="submit">ゲーム開始 <span>→</span></button>
    </form>
  `, 'ゲーム設定')
}

function currentRoundDarts(session: GameSession, round: number): string {
  const throws = session.throws.filter((dart) => dart.round === round)
  return [1, 2, 3].map((position) => {
    const dart = throws.find((item) => item.dartInRound === position)
    return `<div class="dart-slot ${dart ? 'filled' : ''}"><small>D${position}</small><strong>${dart ? formatThrow(dart) : '—'}</strong></div>`
  }).join('')
}

function inputPad(): string {
  const numbers = Array.from({ length: 20 }, (_, index) => 20 - index)
  return `
    <section class="input-panel" aria-label="ダーツ入力">
      <div class="quick-row">
        <button data-quick="20,3">T20</button><button data-quick="19,3">T19</button>
        <button class="bull" data-quick="BULL,1">Outer BULL</button><button class="bull inner" data-quick="BULL,2">Inner BULL</button>
      </div>
      <div class="multiplier-tabs" role="group" aria-label="倍率">
        ${([1, 2, 3] as const).map((value) => `<button class="${selectedMultiplier === value ? 'active' : ''}" data-multiplier="${value}" aria-pressed="${selectedMultiplier === value}">${value === 1 ? 'SINGLE' : value === 2 ? 'DOUBLE' : 'TRIPLE'}</button>`).join('')}
      </div>
      <div class="number-pad">
        ${numbers.map((value) => `<button data-number="${value}">${value}</button>`).join('')}
      </div>
      <button class="miss-button" data-quick="MISS,0">MISS <span>0点 / 0マーク</span></button>
    </section>`
}

function playActions(canUndo: boolean, canFinish = false): string {
  return `<div class="play-actions ${canFinish ? 'cricket-actions' : ''}">
    ${canFinish ? '<button class="finish-button" data-action="finish">ゲーム終了・スタッツ保存</button>' : ''}
    <button data-action="undo" ${canUndo ? '' : 'disabled'}>↶ UNDO</button>
    <button class="danger-link" data-action="abort">ゲーム中止</button>
  </div>`
}

function liveStats(session: GameSession): string {
  const result = calculateResult(session.settings, session.throws)
  const at = `${session.throws.length}投時点`
  if (result.game === '01') {
    return `<section class="live-stats" aria-label="現時点のスタッツ">
      <div class="live-stats-heading"><h2>LIVE STATS</h2><span>${at}</span></div>
      <div class="live-stats-grid">
        <article class="accent"><p>80％ <small>DARTSLIVE方式を1人用に準用</small></p><strong>${number(result.eighty.ppd)} <small>PPD</small></strong><dl><div><dt>PPR</dt><dd>${number(result.eighty.ppr)}</dd></div><div><dt>対象</dt><dd>${result.eighty.rounds}R / ${result.eighty.darts}投</dd></div></dl></article>
        <article><p>全投 <small>HIGH ${result.all.highestRound} · BUST ${result.all.busts}</small></p><strong>${number(result.all.ppd)} <small>PPD</small></strong><dl><div><dt>PPR</dt><dd>${number(result.all.ppr)}</dd></div><div><dt>投数</dt><dd>${result.all.totalDarts}</dd></div></dl></article>
      </div>
    </section>`
  }
  return `<section class="live-stats" aria-label="現時点のスタッツ">
    <div class="live-stats-heading"><h2>LIVE STATS</h2><span>${at}</span></div>
    <div class="live-stats-grid">
      <article class="accent"><p>80％ <small>DARTSLIVE方式を1人用に準用</small></p><strong>${number(result.eighty.mpr)} <small>MPR</small></strong><dl><div><dt>マーク</dt><dd>${result.eighty.totalMarks}</dd></div><div><dt>対象</dt><dd>${result.eighty.rounds}R / ${result.eighty.totalDarts}投</dd></div></dl></article>
      <article><p>全投 <small>${result.all.closedCount}/7 CLOSED</small></p><strong>${number(result.all.mpr)} <small>MPR</small></strong><dl><div><dt>マーク</dt><dd>${result.all.totalMarks}</dd></div><div><dt>投数</dt><dd>${result.all.totalDarts}</dd></div></dl></article>
    </div>
  </section>`
}

function zeroOnePlay(session: GameSession): string {
  if (session.settings.game !== '01') return ''
  const state = replayZeroOne(session.settings, session.throws)
  const currentThrows = session.throws.filter((dart) => dart.round === state.nextRound)
  const previous = state.rounds.filter((round) => round.number < state.nextRound).at(-1)
  const recentBust = session.throws.at(-1)?.bust ?? false
  return shell(`
    <section class="scoreboard zero-one">
      <div class="score-meta"><span>ROUND <strong>${state.nextRound}${session.settings.roundLimit ? ` / ${session.settings.roundLimit}` : ''}</strong></span><span>NEXT <strong>DART ${state.nextDart}</strong></span></div>
      ${recentBust ? '<div class="bust-banner" role="status">BUST — ラウンド開始時の点数に戻りました</div>' : ''}
      <p>REMAINING</p><div class="remaining">${state.remaining}</div>
      <div class="round-darts">${currentRoundDarts(session, state.nextRound)}</div>
      <div class="previous-round"><span>直前ラウンド</span><strong>${previous === undefined ? '—' : previous.bust ? 'BUST / 0' : `${previous.validScore}点`}</strong></div>
    </section>
    ${liveStats(session)}
    ${inputPad()}
    ${playActions(currentThrows.length > 0 || session.throws.length > 0)}
  `, settingsLabel(session.settings))
}

function markGlyphs(value: number): string {
  return `${'●'.repeat(value)}${'○'.repeat(3 - value)}`
}

function cricketPlay(session: GameSession): string {
  if (session.settings.game !== 'cricket') return ''
  const state = replayCricket(session.settings, session.throws)
  return shell(`
    <section class="scoreboard cricket">
      <div class="score-meta"><span>ROUND <strong>${state.nextRound} / ${session.settings.cricketMode === 'twenty-rounds' ? '20' : '∞'}</strong></span><span>NEXT <strong>DART ${state.nextDart}</strong></span></div>
      <div class="cricket-board">
        ${CRICKET_TARGETS.map((target) => `<div class="target-row ${state.marks[target] === 3 ? 'closed' : ''}"><strong>${target}</strong><span aria-label="${state.marks[target]}マーク">${markGlyphs(state.marks[target])}</span><small>${state.marks[target]}/3 ${state.marks[target] === 3 ? 'CLOSED' : 'OPEN'}</small></div>`).join('')}
      </div>
      <div class="round-darts">${currentRoundDarts(session, state.nextRound)}</div>
      <div class="previous-round"><span>総マーク</span><strong>${state.totalMarks}</strong></div>
    </section>
    ${liveStats(session)}
    ${inputPad()}
    ${playActions(session.throws.length > 0, true)}
  `, settingsLabel(session.settings))
}

function statsCards(session: GameSession): string {
  const result = session.result ?? calculateResult(session.settings, session.throws)
  if (result.game === '01') {
    return `<div class="stats-pair">
      <article class="stats-card accent"><p>80％スタッツ<small>DARTSLIVE方式を1人用に準用</small></p><strong>${number(result.eighty.ppd)} <small>PPD</small></strong><dl><div><dt>PPR</dt><dd>${number(result.eighty.ppr)}</dd></div><div><dt>対象</dt><dd>${result.eighty.rounds}R / ${result.eighty.darts}投</dd></div></dl></article>
      <article class="stats-card"><p>全投スタッツ</p><strong>${number(result.all.ppd)} <small>PPD</small></strong><dl><div><dt>PPR</dt><dd>${number(result.all.ppr)}</dd></div><div><dt>総投数</dt><dd>${result.all.totalDarts}</dd></div><div><dt>High</dt><dd>${result.all.highestRound}</dd></div><div><dt>BUST</dt><dd>${result.all.busts}</dd></div></dl></article>
    </div>`
  }
  return `<div class="stats-pair">
    <article class="stats-card accent"><p>80％スタッツ<small>DARTSLIVE方式を1人用に準用</small></p><strong>${number(result.eighty.mpr)} <small>MPR</small></strong><dl><div><dt>マーク</dt><dd>${result.eighty.totalMarks}</dd></div><div><dt>対象</dt><dd>${result.eighty.rounds}R / ${result.eighty.totalDarts}投</dd></div></dl></article>
    <article class="stats-card"><p>全投スタッツ</p><strong>${number(result.all.mpr)} <small>MPR</small></strong><dl><div><dt>総マーク</dt><dd>${result.all.totalMarks}</dd></div><div><dt>総投数</dt><dd>${result.all.totalDarts}</dd></div><div><dt>クローズ</dt><dd>${result.all.closedCount}/7</dd></div></dl></article>
  </div>`
}

function resultDetails(session: GameSession): string {
  const result = session.result ?? calculateResult(session.settings, session.throws)
  if (result.game === '01') {
    return `<div class="result-summary"><span>${result.cleared ? 'CLEAR' : 'NOT CLEARED'}</span><strong>${result.cleared ? `${result.all.clearDarts}投でクリア` : `残り ${result.remaining}`}</strong></div>`
  }
  return `<div class="result-summary"><span>${result.cleared ? 'ALL CLOSED' : 'FINISHED'}</span><strong>${result.all.closedCount} / 7 CLOSED</strong></div>
    <div class="close-grid">${CRICKET_TARGETS.map((target) => {
      const close = result.closeInfo.find((item) => item.target === target)
      return `<div><strong>${target}</strong><span>${markGlyphs(result.marks[target])}</span><small>${close ? `#${close.order} · R${close.round} D${close.dartInRound} · ${close.throwsUsed}投` : '未クローズ'}</small></div>`
    }).join('')}</div>`
}

function roundHistory(session: GameSession): string {
  const rounds = session.settings.game === '01'
    ? replayZeroOne(session.settings, session.throws).rounds
    : replayCricket(session.settings, session.throws).rounds
  return `<div class="round-history">${rounds.map((round) => `
    <details><summary><span>ROUND ${round.number}</span><strong>${round.bust ? 'BUST · 0点' : session.settings.game === '01' ? `${round.validScore}点` : `${round.marks}マーク`}</strong></summary>
      <ol>${round.throws.map((dart) => `<li><span>D${dart.dartInRound} · ${formatThrow(dart)}</span><span>${dart.score}点 / ${dart.marks}M ${dart.bust ? '· BUST' : ''}</span><time>${new Date(dart.thrownAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></li>`).join('')}</ol>
    </details>`).join('')}</div>`
}

function resultView(session: GameSession): string {
  return shell(`
    <section class="result-hero"><p class="eyebrow">GAME RESULT</p><h2>${gameLabel(session)}</h2>${resultDetails(session)}<small>${dateTime(session.startedAt)} · ${settingsLabel(session.settings)}</small></section>
    ${statsCards(session)}
    <section class="section-card"><h3>ゲーム設定</h3><p>${settingsLabel(session.settings)}</p></section>
    <section class="history-section"><h3>ラウンド / 1投ごとの履歴</h3>${roundHistory(session)}</section>
    <div class="result-actions"><button class="primary-button" data-action="repeat">同じ設定でもう一度</button><button class="secondary-button" data-action="home">ホームへ戻る</button></div>
  `, '結果')
}

function aggregateRows(sessions: GameSession[]): string {
  const groups = [
    { label: '501', matches: (session: GameSession) => session.settings.game === '01' && session.settings.startingScore === 501 },
    { label: '701', matches: (session: GameSession) => session.settings.game === '01' && session.settings.startingScore === 701 },
    { label: 'CRICKET', matches: (session: GameSession) => session.settings.game === 'cricket' },
  ]
  return groups.map((group) => {
    const games = sessions.filter(group.matches)
    const periods = [{ label: '直近10', games: games.slice(0, 10) }, { label: '直近30', games: games.slice(0, 30) }, { label: '全期間', games }]
    return `<article class="aggregate-card"><h3>${group.label}</h3>${periods.map((period) => {
      const stats = period.games.map((session) => session.result ?? calculateResult(session.settings, session.throws))
      const eighty = stats.reduce((sum, result) => sum + (result.game === '01' ? result.eighty.ppd : result.eighty.mpr), 0) / (stats.length || 1)
      const all = stats.reduce((sum, result) => sum + (result.game === '01' ? result.all.ppd : result.all.mpr), 0) / (stats.length || 1)
      return `<div><span>${period.label}<small>${period.games.length} games</small></span><span><small>80％</small><strong>${number(eighty)}</strong></span><span><small>全投</small><strong>${number(all)}</strong></span></div>`
    }).join('')}</article>`
  }).join('')
}

function historyView(): string {
  const items = completedSessions.length === 0
    ? '<div class="empty-state"><strong>まだ履歴がありません</strong><p>ゲームを完了すると、ここに記録されます。</p></div>'
    : completedSessions.map((session) => {
      const result = session.result ?? calculateResult(session.settings, session.throws)
      const eighty = result.game === '01' ? `${number(result.eighty.ppd)} PPD` : `${number(result.eighty.mpr)} MPR`
      const all = result.game === '01' ? `${number(result.all.ppd)} PPD` : `${number(result.all.mpr)} MPR`
      return `<article class="history-item"><button data-action="detail" data-id="${session.id}"><span><small>${dateTime(session.startedAt)}</small><strong>${gameLabel(session)} · ${result.cleared ? 'クリア' : '未クリア'}</strong><em>${settingsLabel(session.settings)}</em></span><span><small>80％ ${eighty}</small><small>全投 ${all}</small><b>詳細 →</b></span></button><button class="delete-button" data-action="delete" data-id="${session.id}" aria-label="この履歴を削除">削除</button></article>`
    }).join('')
  return shell(`
    <section class="aggregate-section"><h2>ゲーム別集計</h2><p>数値は各期間のゲーム平均です。</p>${aggregateRows(completedSessions)}</section>
    <section class="history-section"><div class="section-heading"><h2>ゲーム履歴</h2>${completedSessions.length ? '<button data-action="delete-all">すべて削除</button>' : ''}</div>${items}</section>
  `, '履歴')
}

function render(): void {
  if (screen === 'home') app.innerHTML = homeView()
  if (screen === 'settings') app.innerHTML = settingsView()
  if (screen === 'play' && activeSession !== undefined) {
    app.innerHTML = activeSession.settings.game === '01' ? zeroOnePlay(activeSession) : cricketPlay(activeSession)
  }
  if (screen === 'result' && viewingSession !== undefined) app.innerHTML = resultView(viewingSession)
  if (screen === 'history') app.innerHTML = historyView()
}

async function refreshData(): Promise<void> {
  activeSession = await getActiveSession()
  completedSessions = await listCompletedSessions()
}

async function persist(session: GameSession): Promise<void> {
  try {
    await saveSession(session)
    saveError = ''
  } catch (error) {
    saveError = `保存できませんでした: ${error instanceof Error ? error.message : '不明なエラー'}`
  }
}

async function enterDart(input: DartInput): Promise<void> {
  if (activeSession === undefined) return
  activeSession = addThrow(activeSession, input)
  await persist(activeSession)
  if (activeSession.status === 'completed') {
    viewingSession = activeSession
    activeSession = undefined
    completedSessions = await listCompletedSessions()
    screen = 'result'
  }
  render()
}

app.addEventListener('change', (event) => {
  const target = event.target
  if (target instanceof HTMLInputElement && target.name === 'game') {
    draftGame = target.value as typeof draftGame
    render()
  }
})

app.addEventListener('submit', (event) => {
  if (!(event.target instanceof HTMLFormElement) || event.target.id !== 'settings-form') return
  event.preventDefault()
  const data = new FormData(event.target)
  let settings: GameSettings
  if (draftGame === 'cricket') {
    settings = { game: 'cricket', cricketMode: data.get('cricketMode') === 'all-close' ? 'all-close' : 'twenty-rounds' }
  } else {
    const limit = data.get('roundLimit')
    settings = {
      game: '01',
      startingScore: draftGame === '501' ? 501 : 701,
      outRule: data.get('outRule') === 'master' ? 'master' : 'straight',
      roundLimit: limit === 'none' ? null : limit === '20' ? 20 : 15,
    }
  }
  activeSession = createSession(settings)
  selectedMultiplier = 1
  void persist(activeSession).then(() => { screen = 'play'; render() })
})

app.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const multiplierButton = target.closest<HTMLButtonElement>('[data-multiplier]')
  if (multiplierButton) {
    selectedMultiplier = Number(multiplierButton.dataset.multiplier) as Multiplier
    render()
    return
  }
  const numberButton = target.closest<HTMLButtonElement>('[data-number]')
  if (numberButton) {
    void enterDart({ segment: Number(numberButton.dataset.number), multiplier: selectedMultiplier })
    return
  }
  const quickButton = target.closest<HTMLButtonElement>('[data-quick]')
  if (quickButton) {
    const [segmentValue, multiplierValue] = (quickButton.dataset.quick ?? '').split(',')
    const segment = segmentValue === 'BULL' || segmentValue === 'MISS' ? segmentValue : Number(segmentValue)
    void enterDart({ segment, multiplier: Number(multiplierValue) as Multiplier })
    return
  }
  const button = target.closest<HTMLButtonElement>('[data-action]')
  if (button === null) return
  const action = button.dataset.action
  if (action === 'new-game') {
    if (activeSession !== undefined && !window.confirm('進行中のゲームを中止して、新しいゲームを始めますか？')) return
    if (activeSession !== undefined) void persist(abortSession(activeSession))
    activeSession = undefined
    screen = 'settings'
    render()
  }
  if (action === 'resume' && activeSession !== undefined) { screen = 'play'; render() }
  if (action === 'history') { screen = 'history'; render() }
  if (action === 'home') { viewingSession = undefined; screen = 'home'; render() }
  if (action === 'back') { screen = screen === 'result' && viewingSession?.status === 'completed' ? 'history' : 'home'; render() }
  if (action === 'undo' && activeSession !== undefined) {
    activeSession = undoThrow(activeSession)
    void persist(activeSession).then(render)
  }
  if (action === 'abort' && activeSession !== undefined && window.confirm('このゲームを中止しますか？入力済みの進行記録は履歴に表示されません。')) {
    const aborted = abortSession(activeSession)
    activeSession = undefined
    void persist(aborted).then(() => { screen = 'home'; render() })
  }
  if (action === 'finish' && activeSession?.settings.game === 'cricket' && window.confirm('現時点のスタッツを保存して、クリケットを終了しますか？')) {
    const completed = finishCricketSession(activeSession)
    viewingSession = completed
    activeSession = undefined
    void persist(completed).then(async () => {
      completedSessions = await listCompletedSessions()
      screen = 'result'
      render()
    })
  }
  if (action === 'repeat' && viewingSession !== undefined) {
    activeSession = createSession(viewingSession.settings)
    selectedMultiplier = 1
    void persist(activeSession).then(() => { screen = 'play'; render() })
  }
  if (action === 'detail') {
    const id = button.dataset.id
    if (id !== undefined) void getSession(id).then((session) => { if (session) { viewingSession = session; screen = 'result'; render() } })
  }
  if (action === 'delete') {
    const id = button.dataset.id
    if (id !== undefined && window.confirm('この履歴を削除しますか？元に戻せません。')) {
      void deleteSession(id).then(async () => { completedSessions = await listCompletedSessions(); render() })
    }
  }
  if (action === 'delete-all' && window.confirm('すべてのゲーム履歴を削除しますか？元に戻せません。')) {
    void Promise.all(completedSessions.map((session) => deleteSession(session.id))).then(async () => { await refreshData(); render() })
  }
})

window.addEventListener('online', render)
window.addEventListener('offline', render)

void initDb()
  .then(refreshData)
  .catch((error: unknown) => { saveError = error instanceof Error ? error.message : '保存領域を初期化できませんでした' })
  .finally(render)
