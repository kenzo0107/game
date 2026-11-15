import { createBgm } from './bgm.js';
import {
    BALL_RADIUS,
    RIM_HEIGHT,
    THREE_POINT_DISTANCE,
    createBall,
    createHoop,
    SHOT_DISTANCE,
    hoopCenterX,
    nextShotDistance,
    launchVelocity,
    shotPoints,
    step,
} from './physics.js';

const GAME_SECONDS = 60;
const DT = 1 / 240;
const VIEW = { left: -0.6, width: 10.6, height: 5.8, floorDepth: 0.6 };
const HOOP = createHoop(9);
const POLE_X = 9.75;
const MIN_DRAG = 0.25;
const AIM_PREVIEW_SEC = 0.35;
const SHOT_TIMEOUT_SEC = 4;
const NEXT_BALL_DELAY_SEC = 0.35;
const CHEER_SEC = 1.6;
const PLAYER_GRAVITY = 12;
const JUMP_SPEED = 3.6;
const SHOT_HOP_SPEED = 2.7;
const MAX_JUMPS = 2;
const SPIN = { sec: 0.4, radius: 0.4 };
const HELD_SPIN_SPEED = 18;
const MAX_DIP = 0.15;
const RISE_SEC = 0.24;
const SET_PHASE = 0.5;
const SHOULDER = { dx: 0.04, y: 1.45 };
const SET_POINT = { dx: 0.17, dy: 0.55 };
const POCKET = { dx: 0.24, dy: -0.32 };
const RELEASE = { dx: 0.2, dy: 0.66 };
const ARM = { upper: 0.3, lower: 0.3 };
const LEG = { upper: 0.46, lower: 0.46 };
const HIP_Y = 0.92;
const AIR_POSE_HEIGHT = 0.12;
const SKIN_FAR = '#d9a77a';
const HAIR = '#2b1a0e';
const BACKSPIN = 14;
const SKIN = '#f5c99b';
const UNIFORM = { main: '#fb4f14', trim: '#002244', number: '#fff' };
const FENCE = { bottom: 0.7, top: 1.15 };
const FANS = [
    { x: 0.2, shirt: '#ff3ea5', hair: '#2b1a0e' },
    { x: 1.4, shirt: '#29e7ff', hair: '#f2c14e' },
    { x: 2.6, shirt: '#ffd23f', hair: '#5a3418' },
    { x: 3.8, shirt: '#7cf06b', hair: '#2b1a0e' },
    { x: 5.0, shirt: '#ff8a2b', hair: '#8b4a2b' },
    { x: 6.2, shirt: '#b98cff', hair: '#2b1a0e' },
    { x: 7.4, shirt: '#ff5a5a', hair: '#f2c14e' },
];
const CHEER_WORDS = ['ナイス！', 'やったー！', 'すごーい！', 'いいぞ！'];

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
    shotDistance: SHOT_DISTANCE.min,
    shooterX: 0,
    shotFromX: 0,
    ball: null,
    flying: false,
    shotAge: 0,
    player: { y: 0, vy: 0, jumps: 0 },
    spinAt: -Infinity,
    shot: null,
    readyIn: 0,
    aim: null,
    popups: [],
    netWobble: 0,
    clock: 0,
    cheer: 0,
    cheerFan: 0,
    cheerText: '',
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

function noise(length, freq, volume, delay = 0) {
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
    src.start(ac.currentTime + delay);
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
    cheer: () => {
        noise(1.1, 900, 0.3);
        for (let i = 0; i < 4; i++) noise(0.05, 2200, 0.35, 0.1 + i * 0.16);
    },
    start: () => [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'square', 0.05, i * 0.1)),
};

let bgm = null;
function syncBgm() {
    if (!audio) return;
    bgm ??= createBgm(audio);
    if (soundOn && state.phase === 'playing' && !document.hidden) bgm.start();
    else bgm.stop();
}

function play(name) {
    if (!soundOn) return;
    if (state.clock - (lastSound[name] ?? -1) < 0.08) return;
    lastSound[name] = state.clock;
    try {
        SOUNDS[name]();
    } catch {}
}

const spinProgress = () => (state.clock - state.spinAt) / SPIN.sec;

const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

function shoulderPosition() {
    const dip = crouchDepth();
    return { x: state.shooterX + SHOULDER.dx + dip * 0.6, y: SHOULDER.y + state.player.y - dip };
}

const offset = (p, d) => ({ x: p.x + d.dx, y: p.y + d.dy });

function releasePoint() {
    const shoulder = shoulderPosition();
    return { x: shoulder.x + RELEASE.dx, y: shoulder.y + RELEASE.dy };
}

function predictedReleasePoint() {
    const { player } = state;
    const vy = player.y === 0 ? SHOT_HOP_SPEED : player.vy;
    const y = Math.max(0, player.y + vy * RISE_SEC - (PLAYER_GRAVITY * RISE_SEC ** 2) / 2);
    return { x: state.shooterX + SHOULDER.dx + RELEASE.dx, y: SHOULDER.y + y + RELEASE.dy };
}

function heldBall() {
    const { shot } = state;
    if (shot) {
        const k = Math.min(1, (state.clock - shot.at) / RISE_SEC);
        const ease = (t) => 1 - (1 - t) ** 2;
        const set = offset(shoulderPosition(), SET_POINT);
        const at = k < SET_PHASE
            ? lerp(shot.from, set, ease(k / SET_PHASE))
            : lerp(set, releasePoint(), ease((k - SET_PHASE) / (1 - SET_PHASE)));
        return { ...at, rot: shot.from.rot };
    }
    const shoulder = shoulderPosition();
    const hand = offset(shoulder, SET_POINT);
    const k = spinProgress();
    if (k < 0 || k >= 1) {
        const pocket = offset(shoulder, POCKET);
        const rot = state.player.y > 0 ? state.clock * HELD_SPIN_SPEED : 0;
        return { ...lerp(hand, pocket, crouchDepth() / MAX_DIP), rot };
    }
    const angle = k * Math.PI * 2;
    return {
        x: hand.x + Math.sin(angle) * SPIN.radius,
        y: hand.y - SPIN.radius + Math.cos(angle) * SPIN.radius,
        rot: angle * 2,
    };
}
const canThrow = () =>
    state.phase === 'playing' && !state.flying && !state.shot && state.readyIn <= 0 && state.timeLeft > 0;

const shooterXAt = (distance) => hoopCenterX(HOOP) - distance;

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
        shotDistance: SHOT_DISTANCE.min,
        shooterX: shooterXAt(SHOT_DISTANCE.min),
        ball: null,
        flying: false,
        readyIn: 0,
        aim: null,
        popups: [],
        cheer: 0,
        player: { y: 0, vy: 0, jumps: 0 },
        spinAt: -Infinity,
        shot: null,
    });
    overlay.hidden = true;
    play('start');
    syncBgm();
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
    syncBgm();
    overlayTitle.textContent = isBest ? 'ベスト こうしん！' : 'タイムアップ！';
    overlayText.innerHTML = `<b>${state.score}</b> てん`;
    startButton.textContent = 'もういちど';
    overlay.hidden = false;
    renderHud();
}

function addPopup(text, color) {
    state.popups.push({ text, color, x: hoopCenterX(HOOP), y: RIM_HEIGHT + 0.5 + state.popups.length * 0.45, age: 0 });
}

function startShot(drag, from) {
    state.shot = { drag, from, at: state.clock };
    if (state.player.y === 0) state.player.vy = SHOT_HOP_SPEED;
}

function releaseShot() {
    const held = heldBall();
    const { vx, vy } = launchVelocity(state.shot.drag.x, state.shot.drag.y);
    state.shot = null;
    state.ball = { ...createBall(held.x, held.y, vx, vy), rot: held.rot };
    state.flying = true;
    state.shotAge = 0;
    state.shotFromX = state.shooterX;
}

function jump() {
    const { player } = state;
    if (player.jumps >= MAX_JUMPS) return;
    player.vy = JUMP_SPEED;
    player.jumps += 1;
    if (player.jumps === MAX_JUMPS) state.spinAt = state.clock;
}

function updatePlayer(dt) {
    const { player } = state;
    if (player.y === 0 && player.vy === 0) return;
    player.vy -= PLAYER_GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y <= 0) Object.assign(player, { y: 0, vy: 0, jumps: 0 });
}

function resolveShot() {
    const { scored, touchedRim } = state.ball;
    if (!scored && touchedRim) addPopup('おしい！', '#a9a2d6');
    state.flying = false;
    state.ball = null;
    state.shotDistance = nextShotDistance(state.shotDistance, scored);
    state.shooterX = shooterXAt(state.shotDistance);
    state.readyIn = NEXT_BALL_DELAY_SEC;
    if (state.timeLeft <= 0) endGame();
}

function handleEvent(event) {
    if (event === 'score') {
        const points = shotPoints(state.shotFromX, HOOP);
        state.score += points;
        state.netWobble = 1;
        addPopup(`+${points}`, points === 3 ? '#ff3ea5' : '#ffd23f');
        const swish = !state.ball.touchedRim;
        if (swish) addPopup('スウィッシュ！', '#29e7ff');
        startCheer(points === 3 || swish);
        play('swish');
        play('cheer');
        renderHud();
    } else {
        play(event);
    }
}

function startCheer(big) {
    state.cheer = 1;
    state.cheerFan = Math.floor(Math.random() * FANS.length);
    state.cheerText = big ? 'ナイスシュート！' : CHEER_WORDS[Math.floor(Math.random() * CHEER_WORDS.length)];
}

function updateBall(dt) {
    const { ball } = state;
    for (let t = 0; t < dt; t += DT) step(ball, HOOP, DT).forEach(handleEvent);
    ball.rot += ball.bounces === 0 && !ball.scored ? -BACKSPIN * dt : (ball.vx * dt) / BALL_RADIUS;
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
    }
    updatePlayer(dt);
    if (state.shot && state.clock - state.shot.at >= RISE_SEC) releaseShot();
    if (state.phase === 'playing' && state.timeLeft <= 0 && !state.flying && !state.shot) endGame();
    if (state.flying) updateBall(dt);
    state.readyIn = Math.max(0, state.readyIn - dt);
    state.netWobble = Math.max(0, state.netWobble - dt * 1.5);
    state.cheer = Math.max(0, state.cheer - dt / CHEER_SEC);
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

    drawFans();
    ctx.fillStyle = '#3b2f85';
    ctx.fillRect(0, sy(FENCE.top), view.w, (FENCE.top - FENCE.bottom) * view.s);
    ctx.fillStyle = '#5a4bc0';
    ctx.fillRect(0, sy(FENCE.top), view.w, 0.04 * view.s);

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

function drawFans() {
    const excitement = Math.min(1, state.cheer * 2);
    FANS.forEach((fan, i) => {
        const idle = Math.sin(state.clock * 2 + i) * 0.01;
        const hop = Math.abs(Math.sin(state.clock * 11 + i * 1.3)) * 0.2 * excitement;
        const base = FENCE.bottom + 0.15 + idle + hop;
        const shoulder = base + 0.38;
        const head = { x: fan.x, y: base + 0.52 };
        if (excitement > 0) {
            const wave = Math.sin(state.clock * 14 + i) * 0.06;
            line(fan.x - 0.08, shoulder, fan.x - 0.2 + wave, shoulder + 0.3, 0.06, '#e8b88a');
            line(fan.x + 0.08, shoulder, fan.x + 0.2 - wave, shoulder + 0.3, 0.06, '#e8b88a');
        }
        line(fan.x, base, fan.x, shoulder, 0.22, fan.shirt);
        ctx.fillStyle = '#e8b88a';
        ctx.beginPath();
        ctx.arc(sx(head.x), sy(head.y), 0.1 * view.s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = fan.hair;
        ctx.beginPath();
        ctx.arc(sx(head.x), sy(head.y + 0.03), 0.1 * view.s, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a1a05';
        ctx.beginPath();
        const mouth = excitement > 0 ? 0.035 : 0.012;
        ctx.arc(sx(head.x), sy(head.y - 0.04), mouth * view.s, 0, Math.PI * 2);
        ctx.fill();
        if (i === state.cheerFan && state.cheer > 0) drawBubble(state.cheerText, head.x, head.y + 0.35);
    });
}

function drawBubble(text, x, y) {
    ctx.font = `bold ${0.2 * view.s}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 0.24 * view.s;
    const h = 0.34 * view.s;
    const left = Math.max(4, Math.min(view.w - w - 4, sx(x) - w / 2));
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(left, sy(y) - h / 2, w, h, h / 2);
    ctx.moveTo(sx(x) - 0.06 * view.s, sy(y) + h / 2 - 1);
    ctx.lineTo(sx(x), sy(y - 0.12) + h / 2);
    ctx.lineTo(sx(x) + 0.06 * view.s, sy(y) + h / 2 - 1);
    ctx.fill();
    ctx.fillStyle = '#14102e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + w / 2, sy(y));
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

function crouchDepth() {
    if (!state.aim || !canThrow() || state.player.y > 0) return 0;
    const drag = dragInWorld(state.aim);
    return Math.min(Math.hypot(drag.x, drag.y) / 1.5, 1) * MAX_DIP;
}

// 腕や脚の関節位置を手足の先から逆算する（2 リンクの逆運動学）。bend で肘・膝が曲がる側を選ぶ
function solveLimb(root, target, { upper, lower }, bend) {
    const dx = target.x - root.x;
    const dy = target.y - root.y;
    const reach = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(upper - lower) + 1e-3), upper + lower - 1e-3);
    const angle = Math.atan2(dy, dx);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const along = (upper ** 2 - lower ** 2 + reach ** 2) / (2 * reach);
    const side = Math.sqrt(Math.max(0, upper ** 2 - along ** 2)) * bend;
    return {
        joint: { x: root.x + ux * along - uy * side, y: root.y + uy * along + ux * side },
        end: { x: root.x + ux * reach, y: root.y + uy * reach },
    };
}

function fillPolygon(points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))));
    ctx.closePath();
    ctx.fill();
}

function dot(p, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx(p.x), sy(p.y), radius * view.s, 0, Math.PI * 2);
    ctx.fill();
}

function taper(a, b, widthA, widthB, color) {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    fillPolygon(
        [
            { x: a.x + (nx * widthA) / 2, y: a.y + (ny * widthA) / 2 },
            { x: b.x + (nx * widthB) / 2, y: b.y + (ny * widthB) / 2 },
            { x: b.x - (nx * widthB) / 2, y: b.y - (ny * widthB) / 2 },
            { x: a.x - (nx * widthA) / 2, y: a.y - (ny * widthA) / 2 },
        ],
        color,
    );
    dot(a, widthA / 2, color);
    dot(b, widthB / 2, color);
}

function drawLimb(root, target, size, bend, [rootWidth, jointWidth, endWidth], color) {
    const { joint, end } = solveLimb(root, target, size, bend);
    taper(root, joint, rootWidth, jointWidth, color);
    taper(joint, end, jointWidth, endWidth, color);
    return { joint, end };
}

function drawArm(shoulder, target, color, snap) {
    const { end: hand } = drawLimb(shoulder, target, ARM, -1, [0.11, 0.085, 0.07], color);
    dot(hand, 0.05, color);
    if (snap) taper(hand, { x: hand.x + 0.08, y: hand.y - 0.06 }, 0.07, 0.04, color);
}

function armTargets(shoulder) {
    if (state.flying) {
        return { shooting: offset(shoulder, { dx: 0.18, dy: 0.56 }), guide: offset(shoulder, { dx: 0.1, dy: 0.5 }), snap: true };
    }
    if (state.readyIn > 0) {
        return { shooting: offset(shoulder, { dx: 0.08, dy: -0.55 }), guide: offset(shoulder, { dx: -0.02, dy: -0.55 }) };
    }
    const ball = heldBall();
    return {
        shooting: { x: ball.x - 0.03, y: ball.y - BALL_RADIUS * 0.9 },
        guide: { x: ball.x - BALL_RADIUS * 0.8, y: ball.y + 0.02 },
    };
}

function drawLeg(hip, side, color, shoe) {
    const k = Math.min(1, state.player.y / AIR_POSE_HEIGHT);
    const ground = { x: state.shooterX + side * 0.07 + 0.02, y: 0.06 };
    const air = { x: hip.x + side * 0.03 - 0.03, y: hip.y - 0.88 };
    const foot = { x: ground.x + (air.x - ground.x) * k, y: Math.max(ground.y, ground.y + (air.y - ground.y) * k) };
    const { joint: knee, end } = drawLimb(hip, foot, LEG, 1, [0.17, 0.12, 0.09], color);
    const toe = { x: end.x + 0.15 - 0.06 * k, y: end.y - 0.02 - 0.08 * k };
    taper(end, toe, 0.11, 0.08, shoe);
    taper({ x: end.x - 0.01, y: end.y - 0.04 }, { x: toe.x, y: toe.y - 0.03 }, 0.03, 0.03, '#c9c9d6');
    const hem = lerp(hip, knee, 0.62);
    taper(hip, hem, 0.24, 0.21, UNIFORM.trim);
    const stripeStart = lerp(hip, knee, 0.55);
    const len = Math.hypot(knee.x - hip.x, knee.y - hip.y);
    const n = { x: (-(knee.y - hip.y) / len) * 0.12, y: ((knee.x - hip.x) / len) * 0.12 };
    fillPolygon(
        [offset(stripeStart, { dx: n.x, dy: n.y }), offset(hem, { dx: n.x, dy: n.y }), offset(hem, { dx: -n.x, dy: -n.y }), offset(stripeStart, { dx: -n.x, dy: -n.y })],
        UNIFORM.main,
    );
}

function drawTorso(hip, shoulder) {
    const len = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y);
    const n = { x: -(shoulder.y - hip.y) / len, y: (shoulder.x - hip.x) / len };
    const side = (p, w) => [
        { x: p.x + n.x * w, y: p.y + n.y * w },
        { x: p.x - n.x * w, y: p.y - n.y * w },
    ];
    const torso = (grow) => {
        const [hipBack, hipFront] = side(hip, 0.13 + grow);
        const [topBack, topFront] = side(offset(shoulder, { dx: 0, dy: 0.04 + grow }), 0.15 + grow);
        return [hipFront, hipBack, topBack, topFront];
    };
    fillPolygon(torso(0.025), UNIFORM.trim);
    fillPolygon(torso(0), UNIFORM.main);
    const neckLine = offset(shoulder, { dx: 0.04, dy: 0.05 });
    dot(neckLine, 0.07, UNIFORM.trim);
    taper(offset(hip, { dx: -0.15, dy: 0 }), offset(hip, { dx: 0.15, dy: 0 }), 0.07, 0.07, UNIFORM.trim);
    ctx.font = `bold ${0.2 * view.s}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const at = lerp(hip, shoulder, 0.6);
    ctx.lineWidth = 0.045 * view.s;
    ctx.strokeStyle = UNIFORM.trim;
    ctx.strokeText('7', sx(at.x), sy(at.y));
    ctx.fillStyle = UNIFORM.number;
    ctx.fillText('7', sx(at.x), sy(at.y));
}

function drawHead(shoulder) {
    const head = offset(shoulder, { dx: 0.04, dy: 0.29 });
    taper(offset(shoulder, { dx: 0.02, dy: 0.02 }), offset(head, { dx: -0.01, dy: -0.08 }), 0.1, 0.09, SKIN);
    dot(head, 0.14, SKIN);
    dot(offset(head, { dx: 0.135, dy: -0.02 }), 0.03, SKIN);
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.arc(sx(head.x - 0.01), sy(head.y + 0.02), 0.15 * view.s, Math.PI * 0.9, Math.PI * 1.95);
    ctx.fill();
    dot(offset(head, { dx: -0.09, dy: -0.02 }), 0.07, HAIR);
    dot(offset(head, { dx: -0.01, dy: -0.01 }), 0.035, SKIN_FAR);
    dot(offset(head, { dx: 0.08, dy: 0.01 }), 0.018, HAIR);
    taper(offset(head, { dx: 0.05, dy: 0.05 }), offset(head, { dx: 0.11, dy: 0.055 }), 0.018, 0.014, HAIR);
}

function drawPlayer() {
    const dip = crouchDepth();
    const shoulder = shoulderPosition();
    const hip = { x: state.shooterX - dip * 0.5, y: HIP_Y + state.player.y - dip };
    const arms = armTargets(shoulder);

    drawLeg(hip, -1, SKIN_FAR, '#d6d6e2');
    drawArm(shoulder, arms.guide, SKIN_FAR, false);
    drawLeg(hip, 1, SKIN, '#fff');
    drawTorso(hip, shoulder);
    drawHead(shoulder);
    drawArm(shoulder, arms.shooting, SKIN, arms.snap);
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
    const hand = predictedReleasePoint();
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
    else if (state.readyIn <= 0) {
        const held = heldBall();
        drawBall(held.x, held.y, held.rot);
    }
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
    aim.x = e.clientX;
    aim.y = e.clientY;
    const crouchedBall = heldBall();
    state.aim = null;
    const drag = dragInWorld(aim);
    if (!canThrow()) return;
    if (Math.hypot(drag.x, drag.y) >= MIN_DRAG) startShot(drag, crouchedBall);
    else jump();
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
    syncBgm();
});

// 操作前の再生を許さないブラウザでは AudioContext が停止状態で作られるため、最初の操作の種類を問わず再開する
for (const type of ['pointerdown', 'touchend', 'keydown', 'click']) {
    document.addEventListener(type, () => {
        try {
            audioContext();
        } catch {}
        syncBgm();
    });
}
document.addEventListener('visibilitychange', syncBgm);

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
state.shooterX = shooterXAt(SHOT_DISTANCE.min);
renderHud();
renderSound();
requestAnimationFrame(frame);
