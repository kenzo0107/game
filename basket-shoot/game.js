import {
    BALL_RADIUS,
    RIM_HEIGHT,
    THREE_POINT_DISTANCE,
    createBall,
    createHoop,
    hoopCenterX,
    launchVelocity,
    shotPoints,
    step,
} from './physics.js';

const GAME_SECONDS = 60;
const DT = 1 / 240;
const VIEW = { left: -0.6, width: 10.6, height: 5.8, floorDepth: 0.6 };
const HOOP = createHoop(9);
const POLE_X = 9.75;
const SHOT_DISTANCE = { min: 2.4, max: 7.4 };
const HAND = { dx: 0.15, y: 2.1 };
const MIN_DRAG = 0.25;
const AIM_PREVIEW_SEC = 0.35;
const SHOT_TIMEOUT_SEC = 4;
const NEXT_BALL_DELAY_SEC = 0.35;

const canvas = document.getElementById('court');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const timeEl = document.getElementById('time');
const bestEl = document.getElementById('best');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const startButton = document.getElementById('start');
const soundButton = document.getElementById('sound');

const view = { w: 0, h: 0, s: 1, ox: 0, floorY: 0 };
const state = {
    phase: 'title',
    score: 0,
    timeLeft: GAME_SECONDS,
    shooterX: 0,
    shotFromX: 0,
    ball: null,
    flying: false,
    shotAge: 0,
    readyIn: 0,
    aim: null,
    popups: [],
    netWobble: 0,
    clock: 0,
};

function loadNumber(key) {
    try {
        return Number(localStorage.getItem(key)) || 0;
    } catch {
        return 0;
    }
}

function save(key, value) {
    try {
        localStorage.setItem(key, String(value));
    } catch {}
}

let best = loadNumber('basketShootBest');
let soundOn = (() => {
    try {
        return localStorage.getItem('basketShootSound') !== 'off';
    } catch {
        return true;
    }
})();

let audio = null;
const lastSound = {};

function audioContext() {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    return audio;
}

function tone(freq, length, type, volume, delay = 0) {
    const ac = audioContext();
    const t = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + length);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + length);
}

function noise(length, freq, volume) {
    const ac = audioContext();
    const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * length), ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    src.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    gain.gain.value = volume;
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start();
}

const SOUNDS = {
    swish: () => noise(0.3, 3200, 0.5),
    rim: () => {
        tone(520, 0.18, 'square', 0.05);
        tone(790, 0.12, 'square', 0.03);
    },
    board: () => tone(150, 0.12, 'triangle', 0.25),
    floor: () => tone(95, 0.1, 'sine', 0.35),
    tick: () => tone(1200, 0.05, 'square', 0.04),
    buzzer: () => tone(220, 0.7, 'sawtooth', 0.08),
    start: () => [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'square', 0.05, i * 0.1)),
};

function play(name) {
    if (!soundOn) return;
    if (state.clock - (lastSound[name] ?? -1) < 0.08) return;
    lastSound[name] = state.clock;
    try {
        SOUNDS[name]();
    } catch {}
}

const handPosition = () => ({ x: state.shooterX + HAND.dx, y: HAND.y });
const canThrow = () => state.phase === 'playing' && !state.flying && state.readyIn <= 0 && state.timeLeft > 0;

function pickShooterX() {
    const distance = SHOT_DISTANCE.min + Math.random() * (SHOT_DISTANCE.max - SHOT_DISTANCE.min);
    return hoopCenterX(HOOP) - distance;
}

function renderHud() {
    scoreEl.textContent = state.score;
    timeEl.textContent = Math.ceil(state.timeLeft);
    timeEl.classList.toggle('hurry', state.phase === 'playing' && state.timeLeft <= 10);
    bestEl.textContent = best;
}

function startGame() {
    Object.assign(state, {
        phase: 'playing',
        score: 0,
        timeLeft: GAME_SECONDS,
        shooterX: hoopCenterX(HOOP) - 3,
        ball: null,
        flying: false,
        readyIn: 0,
        aim: null,
        popups: [],
    });
    overlay.hidden = true;
    play('start');
    renderHud();
}

function endGame() {
    state.phase = 'over';
    state.aim = null;
    const isBest = state.score > best;
    if (isBest) {
        best = state.score;
        save('basketShootBest', best);
    }
    play('buzzer');
    overlayTitle.textContent = isBest ? 'ベスト こうしん！' : 'タイムアップ！';
    overlayText.innerHTML = `<b>${state.score}</b> てん`;
    startButton.textContent = 'もういちど';
    overlay.hidden = false;
    renderHud();
}

function addPopup(text, color) {
    state.popups.push({ text, color, x: hoopCenterX(HOOP), y: RIM_HEIGHT + 0.5 + state.popups.length * 0.45, age: 0 });
}

function throwBall(dragX, dragY) {
    const { vx, vy } = launchVelocity(dragX, dragY);
    const hand = handPosition();
    state.ball = { ...createBall(hand.x, hand.y, vx, vy), rot: 0 };
    state.flying = true;
    state.shotAge = 0;
    state.shotFromX = state.shooterX;
}

function resolveShot() {
    if (!state.ball.scored && state.ball.touchedRim) addPopup('おしい！', '#a9a2d6');
    state.flying = false;
    state.ball = null;
    state.shooterX = pickShooterX();
    state.readyIn = NEXT_BALL_DELAY_SEC;
    if (state.timeLeft <= 0) endGame();
}

function handleEvent(event) {
    if (event === 'score') {
        const points = shotPoints(state.shotFromX, HOOP);
        state.score += points;
        state.netWobble = 1;
        addPopup(`+${points}`, points === 3 ? '#ff3ea5' : '#ffd23f');
        if (!state.ball.touchedRim) addPopup('スウィッシュ！', '#29e7ff');
        play('swish');
        renderHud();
    } else {
        play(event);
    }
}

function updateBall(dt) {
    const { ball } = state;
    for (let t = 0; t < dt; t += DT) step(ball, HOOP, DT).forEach(handleEvent);
    ball.rot += (ball.vx * dt) / BALL_RADIUS;
    state.shotAge += dt;
    const out = ball.x < VIEW.left - 0.5 || ball.x > VIEW.left + VIEW.width + 0.5;
    const settled = ball.bounces >= (ball.scored ? 1 : 2);
    if (out || settled || state.shotAge > SHOT_TIMEOUT_SEC) resolveShot();
}

function update(dt) {
    state.clock += dt;
    if (state.phase === 'playing') {
        const before = Math.ceil(state.timeLeft);
        state.timeLeft = Math.max(0, state.timeLeft - dt);
        const now = Math.ceil(state.timeLeft);
        if (now !== before) {
            if (now <= 5 && now > 0) play('tick');
            renderHud();
        }
        if (state.timeLeft <= 0 && !state.flying) endGame();
    }
    if (state.flying) updateBall(dt);
    state.readyIn = Math.max(0, state.readyIn - dt);
    state.netWobble = Math.max(0, state.netWobble - dt * 1.5);
    for (const p of state.popups) p.age += dt;
    state.popups = state.popups.filter((p) => p.age < 1.2);
}

const sx = (x) => view.ox + x * view.s;
const sy = (y) => view.floorY - y * view.s;

function line(x1, y1, x2, y2, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width * view.s;
    ctx.beginPath();
    ctx.moveTo(sx(x1), sy(y1));
    ctx.lineTo(sx(x2), sy(y2));
    ctx.stroke();
}

function drawBackground() {
    const wall = ctx.createLinearGradient(0, 0, 0, view.floorY);
    wall.addColorStop(0, '#14102e');
    wall.addColorStop(1, '#2d2366');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, view.w, view.floorY);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, sy(1.2), view.w, 0.5 * view.s);

    const floor = ctx.createLinearGradient(0, view.floorY, 0, view.h);
    floor.addColorStop(0, '#d99a55');
    floor.addColorStop(1, '#a8682f');
    ctx.fillStyle = floor;
    ctx.fillRect(0, view.floorY, view.w, view.h - view.floorY);
    ctx.strokeStyle = 'rgba(80, 40, 10, 0.25)';
    ctx.lineWidth = 1;
    for (let x = Math.floor(VIEW.left); x < VIEW.left + VIEW.width + 1; x += 0.6) {
        ctx.beginPath();
        ctx.moveTo(sx(x), view.floorY);
        ctx.lineTo(sx(x - 0.3), view.h);
        ctx.stroke();
    }

    const threeX = hoopCenterX(HOOP) - THREE_POINT_DISTANCE;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(sx(threeX - 0.04), view.floorY);
    ctx.lineTo(sx(threeX + 0.04), view.floorY);
    ctx.lineTo(sx(threeX - 0.1), view.floorY + 0.35 * view.s);
    ctx.lineTo(sx(threeX - 0.18), view.floorY + 0.35 * view.s);
    ctx.fill();
    ctx.font = `bold ${0.22 * view.s}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('3P', sx(threeX - 0.25), view.floorY + 0.2 * view.s);
}

function drawGoal() {
    const { board, back } = HOOP;
    line(POLE_X, 0, POLE_X, 3.5, 0.16, '#3b4a6b');
    line(POLE_X, 0, POLE_X, 1.8, 0.3, '#2f6bff');
    line(board.x + 0.05, 3.4, POLE_X, 3.4, 0.08, '#3b4a6b');
    ctx.fillStyle = '#f4f1ff';
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 0.025 * view.s;
    ctx.fillRect(sx(board.x), sy(board.top), 0.06 * view.s, (board.top - board.bottom) * view.s);
    ctx.strokeRect(sx(board.x), sy(board.top), 0.06 * view.s, (board.top - board.bottom) * view.s);
    line(back.x, back.y, board.x, back.y, 0.04, '#d9481c');
}

function drawNetAndRim() {
    const { front, back } = HOOP;
    const sway = Math.sin(state.clock * 25) * 0.05 * state.netWobble;
    const bottom = RIM_HEIGHT - 0.42 + state.netWobble * 0.08;
    const bl = front.x + 0.08 + sway;
    const br = back.x - 0.08 + sway;
    const color = 'rgba(255, 255, 255, 0.85)';
    const strands = 4;
    for (let i = 0; i <= strands; i++) {
        const k = i / strands;
        line(front.x + (back.x - front.x) * k, RIM_HEIGHT, bl + (br - bl) * k, bottom, 0.015, color);
    }
    for (let j = 1; j <= 3; j++) {
        const k = j / 3;
        const y = RIM_HEIGHT + (bottom - RIM_HEIGHT) * k;
        line(front.x + (bl - front.x) * k, y, back.x + (br - back.x) * k, y, 0.012, color);
    }
    line(front.x, RIM_HEIGHT, back.x, RIM_HEIGHT, 0.05, '#ff5a1f');
}

function drawPlayer() {
    const x = state.shooterX;
    const holding = !state.flying;
    const hand = handPosition();
    line(x - 0.14, 0, x - 0.02, 0.9, 0.12, '#f5c99b');
    line(x + 0.14, 0, x + 0.02, 0.9, 0.12, '#f5c99b');
    line(x, 0.85, x, 1.5, 0.32, '#2f6bff');
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${0.18 * view.s}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('7', sx(x), sy(1.22));
    const armEnd = holding ? { x: hand.x - 0.02, y: hand.y - 0.1 } : { x: x + 0.35, y: 2.0 };
    line(x + 0.05, 1.45, armEnd.x, armEnd.y, 0.09, '#f5c99b');
    ctx.fillStyle = '#f5c99b';
    ctx.beginPath();
    ctx.arc(sx(x), sy(1.7), 0.14 * view.s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b1a0e';
    ctx.beginPath();
    ctx.arc(sx(x), sy(1.74), 0.14 * view.s, Math.PI, Math.PI * 2);
    ctx.fill();
}

function drawBall(x, y, rot) {
    const r = BALL_RADIUS * view.s;
    ctx.save();
    ctx.translate(sx(x), sy(y));
    ctx.rotate(rot);
    ctx.fillStyle = '#e8731c';
    ctx.strokeStyle = '#3a1a05';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r);
    ctx.moveTo(-r * 0.7, -r * 0.7);
    ctx.quadraticCurveTo(0, -r * 0.2, r * 0.7, -r * 0.7);
    ctx.stroke();
    ctx.restore();
}

function drawAim() {
    const { aim } = state;
    if (!aim || !canThrow()) return;
    const drag = dragInWorld(aim);
    if (Math.hypot(drag.x, drag.y) < MIN_DRAG) return;
    const { vx, vy } = launchVelocity(drag.x, drag.y);
    const hand = handPosition();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (let t = 0.05; t <= AIM_PREVIEW_SEC; t += 0.05) {
        const x = hand.x + vx * t;
        const y = hand.y + vy * t - 4.9 * t * t;
        ctx.beginPath();
        ctx.arc(sx(x), sy(y), 0.035 * view.s * (1 - t / (AIM_PREVIEW_SEC * 1.4)), 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawPopups() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of state.popups) {
        ctx.globalAlpha = Math.min(1, (1.2 - p.age) * 2.5);
        ctx.font = `bold ${0.42 * view.s}px system-ui, sans-serif`;
        ctx.lineWidth = 0.08 * view.s;
        ctx.strokeStyle = '#000';
        const x = sx(p.x - 0.8);
        const y = sy(p.y + p.age * 0.6);
        ctx.strokeText(p.text, x, y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, x, y);
    }
    ctx.globalAlpha = 1;
}

function draw() {
    drawBackground();
    drawGoal();
    drawPlayer();
    drawAim();
    if (state.ball) drawBall(state.ball.x, state.ball.y, state.ball.rot);
    else if (state.readyIn <= 0) drawBall(handPosition().x, handPosition().y, 0);
    drawNetAndRim();
    drawPopups();
}

function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const totalHeight = VIEW.height + VIEW.floorDepth;
    view.s = Math.min(view.w / VIEW.width, view.h / totalHeight);
    view.ox = (view.w - VIEW.width * view.s) / 2 - VIEW.left * view.s;
    view.floorY = (view.h - totalHeight * view.s) / 2 + VIEW.height * view.s;
}

function dragInWorld(aim) {
    return { x: (aim.x - aim.startX) / view.s, y: -(aim.y - aim.startY) / view.s };
}

canvas.addEventListener('pointerdown', (e) => {
    if (!canThrow() || state.aim) return;
    canvas.setPointerCapture(e.pointerId);
    state.aim = { id: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY };
});

canvas.addEventListener('pointermove', (e) => {
    if (state.aim?.id !== e.pointerId) return;
    state.aim.x = e.clientX;
    state.aim.y = e.clientY;
});

canvas.addEventListener('pointerup', (e) => {
    const { aim } = state;
    if (aim?.id !== e.pointerId) return;
    state.aim = null;
    aim.x = e.clientX;
    aim.y = e.clientY;
    const drag = dragInWorld(aim);
    if (canThrow() && Math.hypot(drag.x, drag.y) >= MIN_DRAG) throwBall(drag.x, drag.y);
});

canvas.addEventListener('pointercancel', (e) => {
    if (state.aim?.id === e.pointerId) state.aim = null;
});

startButton.addEventListener('click', startGame);

function renderSound() {
    soundButton.setAttribute('aria-pressed', String(soundOn));
}

soundButton.addEventListener('click', () => {
    soundOn = !soundOn;
    save('basketShootSound', soundOn ? 'on' : 'off');
    renderSound();
});

// 操作前の再生を許さないブラウザでは AudioContext が停止状態で作られるため、最初の操作の種類を問わず再開する
for (const type of ['pointerdown', 'touchend', 'keydown', 'click']) {
    document.addEventListener(type, () => {
        try {
            audioContext();
        } catch {}
    });
}

let last = performance.now();
function frame(now) {
    // タブ切り替えなどで間が空いたとき、戻った瞬間に残り時間が一気に減らないよう上限を設ける
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
state.shooterX = hoopCenterX(HOOP) - 3;
renderHud();
renderSound();
requestAnimationFrame(frame);
