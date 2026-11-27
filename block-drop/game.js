import { createBgm } from './bgm.js';
import { createGesture } from './gesture.js';
import {
    COLS,
    LOCK_DELAY_MS,
    MAX_LOCK_RESETS,
    ROWS,
    cellsOf,
    collides,
    createBag,
    dropDistance,
    emptyBoard,
    fallInterval,
    fullRows,
    levelFor,
    lineScore,
    lock,
    removeRows,
    spawn,
    tryMove,
    tryRotate,
} from './logic.js';

const COLORS = {
    I: '#4dd8ff',
    O: '#ffd23f',
    T: '#b46bff',
    S: '#5ee06a',
    Z: '#ff5a6a',
    J: '#4d7cff',
    L: '#ff9d3a',
};
const NEXT_COUNT = 3;
const CLEAR_MS = 320;
const DAS_MS = 170;
const ARR_MS = 50;
const SOFT_DROP_MS = 35;
const HI_KEY = 'block-drop:hi';
const SOUND_KEY = 'block-drop:sound';
const CLEAR_WORDS = ['', 'ナイス！', 'ダブル！', 'トリプル！', 'よんれつ！すごい！'];

const $ = (id) => document.getElementById(id);
const boardCanvas = $('board');
const holdCanvas = $('hold');
const nextCanvas = $('next');
const overlay = $('overlay');
const toast = $('toast');

const storage = {
    get(key, fallback) {
        try {
            return localStorage.getItem(key) ?? fallback;
        } catch {
            return fallback;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, String(value));
        } catch {}
    },
};

let state;
let hi = Number(storage.get(HI_KEY, 0));
let phase = 'title';
let cell = 24;

function newGame() {
    const next = createBag(Math.random);
    state = {
        board: emptyBoard(),
        bag: next,
        queue: Array.from({ length: NEXT_COUNT }, next),
        piece: null,
        hold: null,
        holdUsed: false,
        score: 0,
        lines: 0,
        level: 0,
        fallAcc: 0,
        lockAcc: 0,
        lockResets: 0,
        lowestY: 0,
        softDrop: false,
        clearing: null,
    };
    spawnNext();
}

function spawnNext(type = null) {
    const s = state;
    if (type === null) {
        type = s.queue.shift();
        s.queue.push(s.bag());
    }
    s.piece = spawn(type);
    s.fallAcc = 0;
    s.lockAcc = 0;
    s.lockResets = 0;
    s.lowestY = s.piece.y;
    if (collides(s.board, s.piece)) gameOver();
}

const grounded = () => tryMove(state.board, state.piece, 0, 1) === null;

function afterShift(moved) {
    if (!moved) return false;
    state.piece = moved;
    if (grounded() && state.lockResets < MAX_LOCK_RESETS) {
        state.lockAcc = 0;
        state.lockResets++;
    }
    return true;
}

const actions = {
    left: () => afterShift(tryMove(state.board, state.piece, -1, 0)) && sfx.move(),
    right: () => afterShift(tryMove(state.board, state.piece, 1, 0)) && sfx.move(),
    cw: () => afterShift(tryRotate(state.board, state.piece, 1)) && sfx.rotate(),
    ccw: () => afterShift(tryRotate(state.board, state.piece, -1)) && sfx.rotate(),
    down: () => {
        const moved = tryMove(state.board, state.piece, 0, 1);
        if (moved) {
            state.piece = moved;
            state.score += 1;
            state.fallAcc = 0;
        }
    },
    drop: () => {
        const d = dropDistance(state.board, state.piece);
        state.piece = { ...state.piece, y: state.piece.y + d };
        state.score += d * 2;
        lockPiece();
    },
    hold: () => {
        if (state.holdUsed) return;
        const current = state.piece.type;
        const held = state.hold;
        state.hold = current;
        state.holdUsed = true;
        sfx.hold();
        spawnNext(held);
    },
};

function lockPiece() {
    const s = state;
    const { board, overflow } = lock(s.board, s.piece);
    s.board = board;
    s.piece = null;
    if (overflow) return gameOver();
    s.holdUsed = false;
    const rows = fullRows(board);
    if (rows.length === 0) {
        sfx.lock();
        return spawnNext();
    }
    s.score += lineScore(rows.length, s.level);
    s.clearing = { rows, t: 0 };
    sfx.clear(rows.length);
    showToast(CLEAR_WORDS[rows.length]);
}

function finishClear() {
    const s = state;
    s.board = removeRows(s.board, s.clearing.rows);
    s.lines += s.clearing.rows.length;
    s.clearing = null;
    const level = levelFor(s.lines);
    if (level > s.level) {
        s.level = level;
        bgm?.setRate(1 + Math.min(level, 10) * 0.04);
        sfx.levelUp();
        showToast(`レベル ${level + 1}！`);
    }
    spawnNext();
}

function gameOver() {
    phase = 'over';
    releaseAll();
    bgm?.stop();
    sfx.over();
    const best = state.score > hi;
    if (best) {
        hi = state.score;
        storage.set(HI_KEY, hi);
    }
    showOverlay(
        'おしまい！',
        `スコア <b>${state.score}</b> ／ ${state.lines} れつ けした<br>${best ? '🎉 ハイスコア こうしん！' : `ハイスコア ${hi}`}`,
        'もういちど',
    );
}

function update(dt) {
    const s = state;
    if (s.clearing) {
        s.clearing.t += dt;
        if (s.clearing.t >= CLEAR_MS) finishClear();
        return;
    }
    if (!s.piece) return;

    const interval = s.softDrop ? Math.min(SOFT_DROP_MS, fallInterval(s.level)) : fallInterval(s.level);
    s.fallAcc += dt;
    while (s.fallAcc >= interval) {
        s.fallAcc -= interval;
        const moved = tryMove(s.board, s.piece, 0, 1);
        if (!moved) {
            s.fallAcc = 0;
            break;
        }
        s.piece = moved;
        if (s.softDrop) s.score += 1;
    }

    // 浮いただけで猶予を戻すと、床で回転を往復させていつまでも固定されなくなるため、より低い行に届いたときだけ戻す
    if (s.piece.y > s.lowestY) {
        s.lowestY = s.piece.y;
        s.lockAcc = 0;
        s.lockResets = 0;
    }
    if (grounded()) {
        s.lockAcc += dt;
        if (s.lockAcc >= LOCK_DELAY_MS) lockPiece();
    }
}


function fitCanvas(canvas, w, h) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
}

let boardCtx;
let holdCtx;
let nextCtx;

function layout() {
    const hud = $('hud').offsetHeight;
    const pad = $('pad').offsetHeight;
    const availH = window.innerHeight - hud - pad - 24;
    const availW = window.innerWidth - 64 * 2 - 40;
    cell = Math.max(10, Math.floor(Math.min(availW / COLS, availH / ROWS)));
    boardCtx = fitCanvas(boardCanvas, cell * COLS, cell * ROWS);
    holdCtx = fitCanvas(holdCanvas, 64, 56);
    nextCtx = fitCanvas(nextCanvas, 64, 56 * NEXT_COUNT);
    draw();
}

function block(ctx, x, y, size, color, alpha = 1) {
    const r = Math.max(2, size * 0.18);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 1, size - 2, size - 2, r);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.roundRect(x + 3, y + 3, size - 6, size * 0.28, r * 0.6);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x + 3, y + size * 0.78, size - 6, size * 0.12);
    ctx.globalAlpha = 1;
}

function face(ctx, x, y, size) {
    ctx.fillStyle = '#1a1033';
    const e = Math.max(1.5, size * 0.09);
    ctx.beginPath();
    ctx.arc(x + size * 0.34, y + size * 0.5, e, 0, Math.PI * 2);
    ctx.arc(x + size * 0.66, y + size * 0.5, e, 0, Math.PI * 2);
    ctx.fill();
}

function drawBoard() {
    const ctx = boardCtx;
    const s = state;
    ctx.clearRect(0, 0, cell * COLS, cell * ROWS);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cell + 0.5, 0);
        ctx.lineTo(x * cell + 0.5, ROWS * cell);
        ctx.stroke();
    }
    for (let y = 1; y < ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cell + 0.5);
        ctx.lineTo(COLS * cell, y * cell + 0.5);
        ctx.stroke();
    }
    if (!s) return;

    const flash = s.clearing && Math.floor(s.clearing.t / 60) % 2 === 0;
    s.board.forEach((row, y) =>
        row.forEach((type, x) => {
            if (!type) return;
            const clearingRow = s.clearing?.rows.includes(y);
            block(ctx, x * cell, y * cell, cell, clearingRow && flash ? '#ffffff' : COLORS[type]);
        }),
    );

    if (s.piece) {
        const ghostY = dropDistance(s.board, s.piece);
        for (const [x, y] of cellsOf({ ...s.piece, y: s.piece.y + ghostY })) {
            if (y < 0) continue;
            ctx.strokeStyle = COLORS[s.piece.type];
            ctx.globalAlpha = 0.5;
            ctx.lineWidth = 2;
            ctx.strokeRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
            ctx.globalAlpha = 1;
        }
        const cells = cellsOf(s.piece);
        for (const [x, y] of cells) {
            if (y >= 0) block(ctx, x * cell, y * cell, cell, COLORS[s.piece.type]);
        }
        const [fx, fy] = cells.reduce((a, b) => (b[1] < a[1] || (b[1] === a[1] && b[0] < a[0]) ? b : a));
        if (fy >= 0) face(ctx, fx * cell, fy * cell, cell);
    }
}

function drawMini(ctx, type, top, dim) {
    if (!type) return;
    const size = 13;
    const cells = cellsOf({ type, rot: 0, x: 0, y: 0 });
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const w = (Math.max(...xs) - Math.min(...xs) + 1) * size;
    const h = (Math.max(...ys) - Math.min(...ys) + 1) * size;
    const ox = (64 - w) / 2 - Math.min(...xs) * size;
    const oy = top + (56 - h) / 2 - Math.min(...ys) * size;
    for (const [x, y] of cells) block(ctx, ox + x * size, oy + y * size, size, COLORS[type], dim ? 0.35 : 1);
}

function draw() {
    if (!boardCtx) return;
    drawBoard();
    holdCtx.clearRect(0, 0, 64, 56);
    nextCtx.clearRect(0, 0, 64, 56 * NEXT_COUNT);
    if (!state) return;
    drawMini(holdCtx, state.hold, 0, state.holdUsed);
    state.queue.forEach((type, i) => drawMini(nextCtx, type, i * 56, false));
    $('score').textContent = state.score;
    $('hi').textContent = Math.max(hi, state.score);
    $('level').textContent = state.level + 1;
    $('lines').textContent = state.lines;
}

function showToast(text) {
    toast.textContent = text;
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
}

function showOverlay(title, html, button) {
    $('overlay-title').textContent = title;
    $('overlay-text').innerHTML = html;
    $('start').textContent = button;
    overlay.hidden = false;
}


let audio = null;
let bgm = null;
let soundOn = storage.get(SOUND_KEY, '1') === '1';
let master = null;

function ensureAudio() {
    if (audio) return;
    audio = new AudioContext();
    master = audio.createGain();
    master.gain.value = soundOn ? 1 : 0;
    master.connect(audio.destination);
    bgm = createBgm(audio, master);
}

function beep(freq, len, type = 'square', vol = 0.06, delay = 0, slide = 0) {
    if (!audio) return;
    const t = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + len);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + len);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + len);
}

const sfx = {
    move: () => beep(520, 0.03, 'square', 0.025),
    rotate: () => beep(780, 0.05, 'triangle', 0.06),
    lock: () => beep(140, 0.09, 'triangle', 0.12),
    hold: () => beep(660, 0.08, 'sine', 0.08, 0, 1.5),
    clear: (n) => [523, 659, 784, 1047].slice(0, n + 1).forEach((f, i) => beep(f, 0.14, 'square', 0.05, i * 0.06)),
    levelUp: () => [784, 988, 1175, 1568].forEach((f, i) => beep(f, 0.12, 'triangle', 0.07, 0.25 + i * 0.08)),
    over: () => [392, 330, 262, 196].forEach((f, i) => beep(f, 0.25, 'triangle', 0.08, i * 0.18)),
};

function setSound(on) {
    soundOn = on;
    storage.set(SOUND_KEY, on ? '1' : '0');
    $('sound').setAttribute('aria-pressed', String(on));
    if (master) master.gain.value = on ? 1 : 0;
}


const REPEATS = new Set(['left', 'right', 'down']);
const held = new Map();

function press(action, source) {
    if (phase !== 'play' || !state.piece) return;
    release(source);
    if (action === 'down') state.softDrop = true;
    actions[action]();
    if (!REPEATS.has(action)) return;
    const tick = () => {
        if (phase === 'play' && state.piece && action !== 'down') actions[action]();
        held.set(source, { action, timer: setTimeout(tick, ARR_MS) });
    };
    held.set(source, { action, timer: setTimeout(tick, DAS_MS) });
}

function release(source) {
    const h = held.get(source);
    if (!h) return;
    clearTimeout(h.timer);
    held.delete(source);
    if (h.action === 'down' && state && ![...held.values()].some((v) => v.action === 'down')) state.softDrop = false;
}

function releaseAll() {
    for (const source of [...held.keys()]) release(source);
    if (state) state.softDrop = false;
}

const KEYS = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowDown: 'down',
    ArrowUp: 'cw',
    KeyX: 'cw',
    KeyZ: 'ccw',
    Space: 'drop',
    KeyC: 'hold',
    ShiftLeft: 'hold',
    ShiftRight: 'hold',
};

addEventListener('keydown', (e) => {
    if (e.repeat) {
        if (KEYS[e.code]) e.preventDefault();
        return;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') return togglePause();
    if ((e.code === 'Enter' || e.code === 'Space') && !overlay.hidden) {
        e.preventDefault();
        return $('start').click();
    }
    const action = KEYS[e.code];
    if (!action) return;
    e.preventDefault();
    press(action, `key:${e.code}`);
});

addEventListener('keyup', (e) => release(`key:${e.code}`));
addEventListener('blur', releaseAll);
addEventListener('contextmenu', (e) => e.preventDefault());

for (const button of document.querySelectorAll('#pad button')) {
    const action = button.dataset.action;
    const source = `pad:${action}`;
    button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        ensureAudio();
        button.classList.add('pressed');
        press(action, source);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
        button.addEventListener(type, () => {
            button.classList.remove('pressed');
            release(source);
        });
    }
}

const playArea = $('play');
let gesture = null;
let gesturePointer = null;

const runGesture = (list) => {
    for (const action of list) if (phase === 'play' && state.piece) actions[action]();
};

playArea.addEventListener('pointerdown', (e) => {
    if (gesturePointer !== null || phase !== 'play') return;
    e.preventDefault();
    gesturePointer = e.pointerId;
    playArea.setPointerCapture(e.pointerId);
    // 盤面が小さい端末で1マス分の指の移動が短すぎると、触れただけで動いてしまうため下限を設ける
    gesture = createGesture(Math.max(18, cell));
    gesture.start(e.clientX, e.clientY, e.timeStamp);
});

playArea.addEventListener('pointermove', (e) => {
    if (e.pointerId !== gesturePointer) return;
    runGesture(gesture.move(e.clientX, e.clientY, e.timeStamp));
});

playArea.addEventListener('pointerup', (e) => {
    if (e.pointerId !== gesturePointer) return;
    gesturePointer = null;
    runGesture(gesture.end(e.clientX, e.clientY, e.timeStamp));
});

playArea.addEventListener('pointercancel', (e) => {
    if (e.pointerId !== gesturePointer) return;
    gesturePointer = null;
    gesture.cancel();
});

$('sound').addEventListener('click', () => {
    ensureAudio();
    setSound(!soundOn);
});

$('pause').addEventListener('click', () => togglePause());

function togglePause() {
    if (phase === 'play') {
        phase = 'pause';
        releaseAll();
        bgm?.stop();
        showOverlay('ひとやすみ', 'つづきから あそべるよ。', 'つづける');
    } else if (phase === 'pause') {
        resume();
    }
}

function resume() {
    overlay.hidden = true;
    phase = 'play';
    last = performance.now();
    bgm?.start();
}

$('start').addEventListener('click', () => {
    ensureAudio();
    audio.resume();
    if (phase === 'pause') return resume();
    newGame();
    bgm.setRate(1);
    resume();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden && phase === 'play') togglePause();
});


let last = performance.now();

function frame(now) {
    // タブ復帰直後などで一度に大きく進めると、ブロックが一気に落ちて固定されてしまうため上限を設ける
    const dt = Math.min(now - last, 100);
    last = now;
    if (phase === 'play') update(dt);
    draw();
    requestAnimationFrame(frame);
}

setSound(soundOn);
$('hi').textContent = hi;
addEventListener('resize', layout);
layout();
requestAnimationFrame(frame);
