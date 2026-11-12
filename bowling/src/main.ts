import '../../shared/landscape.js'
import { Sound } from './audio'
import { COURSES, THROWS_PER_STAGE, findCourse, obstaclesAt, type Course, type ObstacleDef } from './challenge'
import { BALL_RADIUS, BALL_START_Y, LANE, createBall, createPins, isSettled, step, type Ball, type Pin } from './physics'
import {
  canUnlock,
  clearStage,
  isStagePlayable,
  loadProgress,
  pickMultiplier,
  saveProgress,
  unlock,
  type Progress,
} from './progress'
import { BowlingScene } from './scene'
import { characterLine, type VoiceEvent } from './voice'
import { FRAMES, PIN_COUNT, cumulativeScores, frameMarks, isGameOver, nextRoll, splitFrames } from './scoring'

const MIN_SPEED = 4
const MAX_SPEED = 20
const MAX_CURVE = 1.2
const MOVE_SPEED = 1.2
const MAX_ANGLE = 0.22
const SUBSTEPS = 6
const SETTLE_DELAY = 0.8
const ROLL_TIMEOUT = 12
const ROULETTE_TIME = 1.2
const RESULT_DELAY = 3
const RETRY_DELAY = 0.9
const ROULETTE_FACES = [1, 2, 3, 5, 10]

type Mode =
  | { kind: 'normal'; rolls: number[] }
  | { kind: 'challenge'; course: Course; stage: number; throwsUsed: number; knocked: number }
type State = 'menu' | 'aim' | 'rolling' | 'retry' | 'result' | 'end'

const $ = (id: string) => document.getElementById(id) as HTMLElement
const el = {
  scoreboard: $('scoreboard'),
  status: $('status'),
  points: $('points'),
  message: $('message'),
  bonus: $('bonus'),
  hint: $('hint'),
  power: $('power'),
  powerBar: $('power-bar'),
  panel: $('panel'),
  menu: $('menu'),
  back: $('back'),
  moveLeft: $('move-left'),
  moveRight: $('move-right'),
  sound: $('sound'),
}

const view = new BowlingScene(PIN_COUNT)
const sound = new Sound()
let progress: Progress = loadProgress()
let mode: Mode = { kind: 'normal', rolls: [] }
let state: State = 'menu'
let ball: Ball = createBall()
let pins: Pin[] = createPins()
let obstacleDefs: ObstacleDef[] = []
let obstacleTime = 0
let standingBefore = PIN_COUNT
let rollTime = 0
let settledTime = 0
let resultTime = 0
let lastTick = 0
let pendingBonus = { knocked: 0, multiplier: 1, shown: false }
let snapCamera = true
let drag: { startX: number; startY: number; angle: number; power: number } | null = null
let steerStartX: number | null = null
let moveDir = 0
let strikeStreak = 0
let ballStartX = 0

const speak = (event: VoiceEvent, interrupt = true) => sound.say(characterLine(event, Math.random()), interrupt)
const standingCount = () => pins.filter((p) => !p.fallen).length
const show = (e: HTMLElement, visible: boolean, display = 'block') => (e.style.display = visible ? display : 'none')

function setProgress(next: Progress) {
  progress = next
  saveProgress(progress)
  el.points.textContent = `⭐ ${progress.points} pt`
}

function openMenu(page: 'top' | 'challenge') {
  state = 'menu'
  show(el.menu, true)
  show(el.panel, false)
  el.message.textContent = ''
  el.bonus.textContent = ''
  if (page === 'top') {
    el.menu.innerHTML = `
      <h1>100ピン ボウリング</h1>
      <div class="pts">⭐ ${progress.points} pt</div>
      <div><button class="big" data-action="normal">ふつうのゲーム</button></div>
      <div><button class="big" data-action="challenge-menu">チャレンジ</button></div>`
    return
  }
  el.menu.innerHTML = `
    <h2>チャレンジ</h2>
    <div class="pts">⭐ ${progress.points} pt</div>
    ${COURSES.map(renderCourse).join('')}
    <button class="big sub" data-action="top">もどる</button>`
}

function renderCourse(course: Course): string {
  if (!progress.unlocked.includes(course.id)) {
    return `<div class="course"><h3>🔒 ${course.name}</h3>
      <button class="unlock-btn" data-action="unlock" data-course="${course.id}"
        ${canUnlock(progress, course.id) ? '' : 'disabled'}>⭐ ${course.cost} pt でひらく</button></div>`
  }
  const cleared = progress.cleared[course.id] ?? 0
  const stages = course.stages
    .map((s, i) => {
      const playable = isStagePlayable(progress, course.id, i)
      return `<button class="stage-btn${i < cleared ? ' cleared' : ''}" data-action="stage"
        data-course="${course.id}" data-stage="${i}" ${playable ? '' : 'disabled'}>
        ${i < cleared ? '★' : playable ? '' : '🔒'} ${i + 1}<br>${s.target}本</button>`
    })
    .join('')
  return `<div class="course"><h3>${course.name}</h3><div class="stages">${stages}</div></div>`
}

el.menu.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest('button')
  if (!target || target.disabled) return
  const { action, course, stage } = target.dataset
  if (action === 'normal') startNormal()
  if (action === 'challenge-menu') openMenu('challenge')
  if (action === 'top') openMenu('top')
  if (action === 'unlock' && course) {
    setProgress(unlock(progress, course))
    sound.fanfare()
    speak({ kind: 'unlock' })
    openMenu('challenge')
  }
  if (action === 'stage' && course && stage) startChallenge(findCourse(course)!, Number(stage))
})

el.panel.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest('button')
  if (!target) return
  const { action } = target.dataset
  if (action === 'normal') startNormal()
  if (action === 'retry' && mode.kind === 'challenge') startChallenge(mode.course, mode.stage)
  if (action === 'next' && mode.kind === 'challenge') startChallenge(mode.course, mode.stage + 1)
  if (action === 'challenge-menu') openMenu('challenge')
  if (action === 'top') openMenu('top')
})

el.back.addEventListener('click', () => openMenu(mode.kind === 'challenge' ? 'challenge' : 'top'))
el.sound.addEventListener('click', () => {
  sound.toggleMute()
  el.sound.textContent = sound.muted ? '×' : '♪'
})
document.addEventListener('pointerdown', () => sound.unlock(), { capture: true })

function startNormal() {
  mode = { kind: 'normal', rolls: [] }
  strikeStreak = 0
  setObstacles([])
  startRoll(true)
}

function startChallenge(course: Course, stage: number) {
  mode = { kind: 'challenge', course, stage, throwsUsed: 0, knocked: 0 }
  setObstacles(course.stages[stage].obstacles)
  startRoll(true)
}

function setObstacles(defs: ObstacleDef[]) {
  obstacleDefs = defs
  obstacleTime = 0
  view.setObstacles(obstaclesAt(defs, 0))
}

function startRoll(freshRack: boolean) {
  if (freshRack) {
    pins = createPins()
    view.resetPins()
  } else {
    pins.forEach((p) => {
      if (p.fallen) p.out = true
    })
  }
  ball = createBall()
  ball.x = ballStartX
  standingBefore = standingCount()
  state = 'aim'
  snapCamera = true
  show(el.menu, false)
  show(el.panel, false)
  show(el.hint, true)
  el.hint.textContent = '◀▶で位置、下に引っ張って投球'
  el.message.textContent = ''
  el.bonus.textContent = ''
  renderHud()
}

function startRetry() {
  state = 'retry'
  resultTime = 0
  show(el.hint, false)
  el.message.textContent = 'ガター！もういっかい！'
  sound.fail()
  speak({ kind: 'gutter' })
}

function finishRoll() {
  const knocked = standingBefore - standingCount()
  const cleared = standingCount() === 0
  const strike = cleared && standingBefore === PIN_COUNT
  strikeStreak = strike ? strikeStreak + 1 : 0
  if (cleared) view.celebrate()
  if (strike) el.message.innerHTML = strikeStreak >= 2 ? `STRIKE!<br>${strikeStreak}れんぞく！` : 'STRIKE! やったね！'
  else if (cleared) el.message.textContent = 'SPARE! ナイス！'
  else if (knocked === 0) el.message.textContent = ball.inGutter ? 'GUTTER...' : 'MISS...'
  else el.message.textContent = `${knocked} ピン`
  speak(
    cleared
      ? strike
        ? { kind: 'strike', streak: strikeStreak }
        : { kind: 'spare' }
      : knocked === 0
        ? { kind: 'miss' }
        : { kind: 'knocked', count: knocked, left: standingCount() },
  )

  if (mode.kind === 'normal') mode.rolls.push(knocked)
  else {
    mode.knocked += knocked
    mode.throwsUsed += 1
  }
  const multiplier = pickMultiplier(Math.random())
  pendingBonus = { knocked, multiplier, shown: false }
  setProgress({ ...progress, points: progress.points + knocked * multiplier })
  el.points.textContent = `⭐ ${progress.points - knocked * multiplier} pt`
  state = 'result'
  resultTime = 0
  renderHud()
}

function updateResult(dt: number) {
  resultTime += dt
  const { knocked, multiplier } = pendingBonus
  if (!pendingBonus.shown) {
    if (knocked > 0 && resultTime < ROULETTE_TIME) {
      if (resultTime - lastTick > 0.07) {
        lastTick = resultTime
        const face = ROULETTE_FACES[Math.floor(Math.random() * ROULETTE_FACES.length)]
        el.bonus.innerHTML = `${knocked}本 × <span class="mult">${face}倍</span>`
        sound.rouletteTick()
      }
      return
    }
    pendingBonus.shown = true
    lastTick = 0
    el.bonus.innerHTML = `${knocked}本 × <span class="mult">${multiplier}倍</span> = ${knocked * multiplier} pt`
    el.points.textContent = `⭐ ${progress.points} pt`
    if (knocked > 0) {
      sound.bonus(multiplier)
      speak({ kind: 'bonus', multiplier }, false)
    }
  }
  if (resultTime > RESULT_DELAY) afterResult()
}

function afterResult() {
  if (mode.kind === 'normal') {
    if (!isGameOver(mode.rolls)) return startRoll(nextRoll(mode.rolls).freshRack)
    const total = cumulativeScores(mode.rolls).at(-1)
    speak({ kind: 'gameOver', score: total ?? 0 })
    return endWith(`GAME OVER ${total} 点`, [
      ['normal', 'もう一度'],
      ['top', 'メニュー'],
    ])
  }
  const { course, stage, knocked, throwsUsed } = mode
  const target = course.stages[stage].target
  if (knocked >= target) {
    setProgress({ ...clearStage(progress, course.id, stage), points: progress.points + target })
    sound.fanfare()
    view.celebrate()
    speak({ kind: 'stageClear' })
    const hasNext = stage + 1 < course.stages.length
    return endWith(`ステージクリア！<br><small>クリアボーナス +${target} pt</small>`, [
      ...(hasNext ? [['next', 'つぎのステージ'] as [string, string]] : []),
      ['challenge-menu', 'コースえらび'],
    ])
  }
  if (throwsUsed < THROWS_PER_STAGE) return startRoll(false)
  sound.fail()
  speak({ kind: 'stageFail' })
  endWith(`ざんねん… ${knocked} / ${target} 本`, [
    ['retry', 'もういちど'],
    ['challenge-menu', 'コースえらび'],
  ])
}

function endWith(message: string, buttons: [string, string][]) {
  state = 'end'
  el.message.innerHTML = message
  el.bonus.textContent = ''
  el.panel.innerHTML = buttons
    .map(([action, label], i) => `<button class="big${i > 0 ? ' sub' : ''}" data-action="${action}">${label}</button>`)
    .join('')
  show(el.panel, true)
}

function renderHud() {
  const normal = mode.kind === 'normal'
  show(el.scoreboard, normal, 'flex')
  el.points.textContent = `⭐ ${progress.points} pt`
  if (mode.kind === 'normal') {
    renderScoreboard(mode.rolls)
    const info = nextRoll(mode.rolls)
    el.status.textContent = isGameOver(mode.rolls)
      ? ''
      : `第${info.frame + 1}フレーム ${info.rollInFrame + 1}投目 / 残り ${standingCount()} 本`
    return
  }
  const { course, stage, throwsUsed } = mode
  const knocked = mode.knocked + (state === 'rolling' ? standingBefore - standingCount() : 0)
  const left = THROWS_PER_STAGE - throwsUsed
  el.status.textContent =
    `${course.name} ${stage + 1}  もくひょう ${course.stages[stage].target}本 / いま ${knocked}本 / のこり ${left}投`
}

function renderScoreboard(rolls: number[]) {
  const frames = splitFrames(rolls)
  const totals = cumulativeScores(rolls)
  const current = isGameOver(rolls) ? -1 : nextRoll(rolls).frame
  el.scoreboard.innerHTML = Array.from({ length: FRAMES }, (_, f) => {
    const marks = frameMarks(frames[f] ?? []).map((m) => `<span>${m}</span>`).join('')
    return `<div class="frame${f === current ? ' current' : ''}">
      <div class="no">${f + 1}</div>
      <div class="marks">${marks}</div>
      <div class="total">${totals[f] ?? ''}</div>
    </div>`
  }).join('')
}

function pullToThrow(dx: number, dy: number) {
  const maxPull = Math.min(window.innerWidth, window.innerHeight) * 0.45
  const power = Math.min(1, Math.max(0, dy) / maxPull)
  const angle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, Math.atan2(-dx, Math.max(dy, 1)) * 0.6))
  return { angle, power }
}

function cancelDrag() {
  drag = null
  steerStartX = null
  view.hideAim()
  show(el.power, false)
}

const canvas = view.renderer.domElement
canvas.addEventListener('pointerdown', (e) => {
  if (state === 'rolling') {
    steerStartX = e.clientX
    canvas.setPointerCapture(e.pointerId)
    return
  }
  if (state !== 'aim') return
  canvas.setPointerCapture(e.pointerId)
  drag = { startX: e.clientX, startY: e.clientY, angle: 0, power: 0 }
})
canvas.addEventListener('pointermove', (e) => {
  if (steerStartX !== null && state === 'rolling') {
    const amount = Math.max(-1, Math.min(1, (e.clientX - steerStartX) / (window.innerWidth * 0.3)))
    ball.spin = amount * MAX_CURVE
    el.hint.textContent = amount < -0.05 ? '◀◀ 左にカーブ' : amount > 0.05 ? '右にカーブ ▶▶' : 'まっすぐ'
    return
  }
  if (!drag) return
  Object.assign(drag, pullToThrow(e.clientX - drag.startX, e.clientY - drag.startY))
  view.showAim(ball, drag.angle, drag.power)
  show(el.power, true)
  el.powerBar.style.width = `${drag.power * 100}%`
})
canvas.addEventListener('pointerup', () => {
  steerStartX = null
  if (!drag || state !== 'aim') return cancelDrag()
  const { angle, power } = drag
  cancelDrag()
  if (power < 0.08) return
  const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * power
  ball.vx = Math.sin(angle) * speed
  ball.vy = Math.cos(angle) * speed
  state = 'rolling'
  rollTime = 0
  settledTime = 0
  el.hint.textContent = '左右にスワイプでカーブ！'
  sound.throwBall()
})
canvas.addEventListener('pointercancel', cancelDrag)

function bindMoveButton(button: HTMLElement, dir: number) {
  button.addEventListener('pointerdown', (e) => {
    button.setPointerCapture(e.pointerId)
    moveDir = dir
  })
  const stop = () => {
    if (moveDir === dir) moveDir = 0
  }
  button.addEventListener('pointerup', stop)
  button.addEventListener('pointercancel', stop)
  button.addEventListener('lostpointercapture', stop)
}
bindMoveButton(el.moveLeft, -1)
bindMoveButton(el.moveRight, 1)
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') moveDir = -1
  if (e.key === 'ArrowRight') moveDir = 1
})
window.addEventListener('keyup', (e) => {
  if ((e.key === 'ArrowLeft' && moveDir === -1) || (e.key === 'ArrowRight' && moveDir === 1)) moveDir = 0
})

let last = performance.now()
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now

  const aiming = state === 'aim'
  show(el.moveLeft, aiming)
  show(el.moveRight, aiming)
  if (aiming && moveDir !== 0 && !drag) {
    const limit = LANE.halfWidth - BALL_RADIUS
    ball.x = Math.max(-limit, Math.min(limit, ball.x + moveDir * MOVE_SPEED * dt))
    ballStartX = ball.x
  }

  if (state === 'rolling') {
    const fallenBefore = PIN_COUNT - standingCount()
    const h = dt / SUBSTEPS
    for (let i = 0; i < SUBSTEPS; i++) step(ball, pins, h, obstaclesAt(obstacleDefs, obstacleTime + i * h))
    sound.pins(PIN_COUNT - standingCount() - fallenBefore)
    rollTime += dt
    settledTime = ball.y > BALL_START_Y + 1 && isSettled(ball, pins) ? settledTime + dt : 0
    if (ball.y > LANE.headPinY) show(el.hint, false)
    if (ball.inGutter && standingCount() === standingBefore) startRetry()
    else if (settledTime > SETTLE_DELAY || rollTime > ROLL_TIMEOUT) finishRoll()
    else renderHud()
  } else if (state === 'retry') {
    resultTime += dt
    if (resultTime > RETRY_DELAY) startRoll(false)
  } else if (state === 'result') {
    updateResult(dt)
  }

  obstacleTime += dt
  view.update(ball, pins, obstaclesAt(obstacleDefs, obstacleTime), dt, snapCamera)
  snapCamera = false
  requestAnimationFrame(loop)
}

setProgress(progress)
el.sound.textContent = sound.muted ? '×' : '♪'
openMenu('top')
requestAnimationFrame(loop)
