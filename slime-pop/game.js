import { createBgm } from './bgm.js';
import { createGesture } from './gesture.js';
import {
    ALL_CLEAR_BONUS,
    COLS,
    LOCK_DELAY_MS,
    MAX_LOCK_RESETS,
    ROWS,
    SPAWN_X,
    applyGravity,
    cellsOf,
    collides,
    createDealer,
    emptyBoard,
    fallInterval,
    findGroups,
    isDead,
    isEmpty,
    landingCells,
    levelFor,
    place,
    popScore,
    removeCells,
    spawn,
    tryMove,
    tryRotate,
} from './logic.js';

const SLIMES = [
    { body: '#ff5d73', dark: '#c23250', eyes: 'dot' },
    { body: '#5fe07a', dark: '#2e9e4a', eyes: 'happy' },
    { body: '#4fa8ff', dark: '#2366c4', eyes: 'big' },
    { body: '#ffd84a', dark: '#c79a12', eyes: 'sleepy' },
    { body: '#b77bff', dark: '#7a3fd0', eyes: 'wink' },
];
const NEXT_COUNT = 2;
const GRAVITY_CELLS_PER_MS2 = 1e-4;
const FLASH_MS = 260;
const SHRINK_MS = 200;
const DAS_MS = 170;
const ARR_MS = 55;
const SOFT_DROP_MS = 40;
const MAX_CELL_PX = 52;
const SIDE_W = 64;
const NEXT_H = 132;
const SOUND_KEY = 'slime-pop:sound';
const hiKey = (colors) => `slime-pop:hi:${colors}`;
const CHAIN_WORDS = ['', '', '2れんさ！', '3れんさ！', '4れんさ！すごい！'];

const $ = (id) => document.getElementById(id);
const boardCanvas = $('board');
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

let state = null;
let phase = 'title';
let cell = 32;
let colors = 4;
let hi = Number(storage.get(hiKey(colors), 0));
let particles = [];

function newGame(colorCount) {
    colors = colorCount;
    hi = Number(storage.get(hiKey(colors), 0));
    const deal = createDealer(Math.random, colors);
    state = {
        board: emptyBoard(),
        deal,
        queue: Array.from({ length: NEXT_COUNT }, deal),
        pair: null,
        score: 0,
        chain: 0,
        bestChain: 0,
        pairs: 0,
        level: 0,
        fallAcc: 0,
        lockAcc: 0,
        lockResets: 0,
        lowestY: 0,
        softDrop: false,
        anim: null,
    };
    particles = [];
    spawnNext();
}

function spawnNext() {
    const s = state;
    s.pair = spawn(s.queue.shift());
    s.queue.push(s.deal());
    s.fallAcc = 0;
    s.lockAcc = 0;
    s.lockResets = 0;
    s.lowestY = s.pair.y;
    if (collides(s.board, s.pair)) gameOver();
}

const grounded = () => tryMove(state.board, state.pair, 0, 1) === null;

function afterShift(moved) {
    if (!moved) return false;
    state.pair = moved;
    if (grounded() && state.lockResets < MAX_LOCK_RESETS) {
        state.lockAcc = 0;
        state.lockResets++;
    }
    return true;
}

const actions = {
    left: () => afterShift(tryMove(state.board, state.pair, -1, 0)) && sfx.move(),
    right: () => afterShift(tryMove(state.board, state.pair, 1, 0)) && sfx.move(),
    cw: () => afterShift(tryRotate(state.board, state.pair, 1)) && sfx.rotate(),
    ccw: () => afterShift(tryRotate(state.board, state.pair, -1)) && sfx.rotate(),
    down: () => {
        const moved = tryMove(state.board, state.pair, 0, 1);
        if (!moved) return;
        state.pair = moved;
        state.score += 1;
        state.fallAcc = 0;
    },
    drop: () => {
        let moved;
        while ((moved = tryMove(state.board, state.pair, 0, 1))) {
            state.pair = moved;
            state.score += 2;
        }
        lockPair();
    },
};

function lockPair() {
    const s = state;
    s.board = place(s.board, s.pair);
    s.pair = null;
    s.chain = 0;
    s.pairs++;
    sfx.land();
    startSettle();
}

function startSettle() {
    const s = state;
    const { board, moves } = applyGravity(s.board);
    s.board = board;
    if (moves.length === 0) return resolve();
    const falls = new Map(moves.map((m) => [`${m.x},${m.to}`, m.from]));
    const longest = Math.max(...moves.map((m) => m.to - m.from));
    s.anim = { kind: 'settle', t: 0, falls, duration: Math.sqrt(longest / GRAVITY_CELLS_PER_MS2) };
}

function resolve() {
    const s = state;
    const groups = findGroups(s.board);
    if (groups.length > 0) {
        s.chain++;
        s.bestChain = Math.max(s.bestChain, s.chain);
        s.score += popScore(groups, s.chain);
        if (s.chain >= 2) showToast(CHAIN_WORDS[s.chain] ?? `${s.chain}れんさ！！`);
        sfx.pop(s.chain);
        s.anim = { kind: 'pop', t: 0, groups, keys: new Set(groups.flatMap((g) => g.cells.map(([x, y]) => `${x},${y}`))) };
        return;
    }
    s.anim = null;
    if (s.chain > 0 && isEmpty(s.board)) {
        s.score += ALL_CLEAR_BONUS;
        showToast('ぜんぶ けした！');
        sfx.allClear();
    }
    if (isDead(s.board)) return gameOver();
    const level = levelFor(s.pairs);
    if (level > s.level) {
        s.level = level;
        bgm?.setRate(1 + Math.min(level, 10) * 0.04);
        sfx.levelUp();
        if (s.chain < 2) showToast(`レベル ${level + 1}！`);
    }
    spawnNext();
}

function burst(groups) {
    for (const { color, cells } of groups) {
        for (const [x, y] of cells) {
            for (let i = 0; i < 6; i++) {
                const a = Math.random() * Math.PI * 2;
                const v = 0.08 + Math.random() * 0.12;
                particles.push({
                    x: x + 0.5,
                    y: y + 0.5,
                    vx: Math.cos(a) * v,
                    vy: Math.sin(a) * v - 0.05,
                    life: 1,
                    color: SLIMES[color].body,
                });
            }
        }
    }
}

function gameOver() {
    phase = 'over';
    releaseAll();
    bgm?.stop();
    sfx.over();
    const best = state.score > hi;
    if (best) {
        hi = state.score;
        storage.set(hiKey(colors), hi);
    }
    showOverlay(
        'おしまい！',
        `スコア <b>${state.score}</b> ／ さいだい <b>${state.bestChain}</b> れんさ<br>${best ? '🎉 ハイスコア こうしん！' : `ハイスコア ${hi}`}`,
        'modes',
    );
}

function update(dt) {
    const s = state;
    for (const p of particles) {
        p.x += p.vx * dt * 0.06;
        p.y += p.vy * dt * 0.06;
        p.vy += 0.0006 * dt;
        p.life -= dt / 600;
    }
    particles = particles.filter((p) => p.life > 0);

    if (s.anim?.kind === 'settle') {
        s.anim.t += dt;
        if (s.anim.t >= s.anim.duration) {
            s.anim = null;
            sfx.land();
            resolve();
        }
        return;
    }
    if (s.anim?.kind === 'pop') {
        const before = s.anim.t;
        s.anim.t += dt;
        if (before < FLASH_MS && s.anim.t >= FLASH_MS) burst(s.anim.groups);
        if (s.anim.t >= FLASH_MS + SHRINK_MS) {
            s.board = removeCells(s.board, s.anim.groups);
            s.anim = null;
            startSettle();
        }
        return;
    }
    if (!s.pair) return;

    const interval = s.softDrop ? Math.min(SOFT_DROP_MS, fallInterval(s.level)) : fallInterval(s.level);
    s.fallAcc += dt;
    while (s.fallAcc >= interval) {
        s.fallAcc -= interval;
        const moved = tryMove(s.board, s.pair, 0, 1);
        if (!moved) {
            s.fallAcc = 0;
            break;
        }
        s.pair = moved;
        if (s.softDrop) s.score += 1;
    }

    // 浮いただけで猶予を戻すと、床で回転を往復させていつまでも置かれなくなるため、より低い行に届いたときだけ戻す
    if (s.pair.y > s.lowestY) {
        s.lowestY = s.pair.y;
        s.lockAcc = 0;
        s.lockResets = 0;
    }
    if (grounded()) {
        s.lockAcc += dt;
        if (s.lockAcc >= LOCK_DELAY_MS) lockPair();
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
let nextCtx;

function layout() {
    const hud = $('hud').offsetHeight;
    const pad = $('pad').offsetHeight;
    const availH = window.innerHeight - hud - pad - 24;
    const availW = window.innerWidth - SIDE_W - 36;
    cell = Math.max(14, Math.min(MAX_CELL_PX, Math.floor(Math.min(availW / COLS, availH / (ROWS + 1)))));
    boardCtx = fitCanvas(boardCanvas, cell * COLS, cell * (ROWS + 1));
    nextCtx = fitCanvas(nextCanvas, SIDE_W, NEXT_H);
    draw();
}

function eyes(ctx, cx, cy, r, style) {
    const ex = r * 0.38;
    const ey = cy - r * 0.08;
    const lw = Math.max(1.5, r * 0.14);
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1b1530';
    ctx.fillStyle = '#1b1530';
    for (const side of [-1, 1]) {
        const x = cx + side * ex;
        ctx.beginPath();
        if (style === 'dot') {
            ctx.arc(x, ey, r * 0.13, 0, Math.PI * 2);
            ctx.fill();
        } else if (style === 'happy') {
            ctx.arc(x, ey + r * 0.08, r * 0.16, Math.PI * 1.1, Math.PI * 1.9);
            ctx.stroke();
        } else if (style === 'big') {
            ctx.fillStyle = '#fff';
            ctx.arc(x, ey, r * 0.22, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.fillStyle = '#1b1530';
            ctx.arc(x + r * 0.04, ey + r * 0.04, r * 0.11, 0, Math.PI * 2);
            ctx.fill();
        } else if (style === 'sleepy') {
            ctx.moveTo(x - r * 0.15, ey);
            ctx.lineTo(x + r * 0.15, ey);
            ctx.stroke();
        } else if (side === -1) {
            ctx.arc(x, ey, r * 0.13, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.moveTo(x - r * 0.15, ey - r * 0.1);
            ctx.lineTo(x + r * 0.1, ey);
            ctx.lineTo(x - r * 0.15, ey + r * 0.1);
            ctx.stroke();
        }
    }
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.2, r * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
}

function slime(ctx, px, py, size, color, { scale = 1, alpha = 1, white = false, pivot = false } = {}) {
    const def = SLIMES[color];
    const cx = px + size / 2;
    const cy = py + size / 2;
    const r = (size / 2 - 1.5) * scale;
    if (r <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.04, r, r * 0.94, 0, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    grad.addColorStop(0, white ? '#ffffff' : '#ffffffaa');
    grad.addColorStop(0.25, white ? '#ffffff' : def.body);
    grad.addColorStop(1, white ? '#e8e8ff' : def.dark);
    ctx.fillStyle = grad;
    ctx.fill();
    if (pivot) {
        ctx.lineWidth = Math.max(2, size * 0.07);
        ctx.strokeStyle = '#ffffffcc';
        ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.42, cy - r * 0.5, r * 0.18, r * 0.11, -0.6, 0, Math.PI * 2);
    ctx.fill();
    if (scale > 0.5) eyes(ctx, cx, cy, r, def.eyes);
    ctx.globalAlpha = 1;
}

function bridge(ctx, x1, y1, x2, y2, color) {
    const w = cell * 0.56;
    ctx.fillStyle = SLIMES[color].body;
    if (x1 === x2) ctx.fillRect(x1 + (cell - w) / 2, y1 + cell / 2, w, y2 - y1);
    else ctx.fillRect(x1 + cell / 2, y1 + (cell - w) / 2, x2 - x1, w);
}

const rowPx = (y) => (y + 1) * cell;

function boardPositions(s) {
    const settle = s.anim?.kind === 'settle' ? s.anim : null;
    const out = [];
    s.board.forEach((row, y) =>
        row.forEach((color, x) => {
            if (color === null) return;
            const key = `${x},${y}`;
            let drawY = y;
            const from = settle?.falls.get(key);
            if (from !== undefined) drawY = Math.min(y, from + GRAVITY_CELLS_PER_MS2 * settle.t ** 2);
            out.push({ x, y, drawY, color, key, resting: from === undefined || drawY === y });
        }),
    );
    return out;
}

function drawBoard() {
    const ctx = boardCtx;
    const s = state;
    const w = cell * COLS;
    ctx.clearRect(0, 0, w, cell * (ROWS + 1));

    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let x = 0; x < COLS; x += 2) ctx.fillRect(x * cell, cell, cell, ROWS * cell);
    ctx.strokeStyle = 'rgba(255,120,140,0.45)';
    ctx.lineWidth = Math.max(2, cell * 0.08);
    const mx = SPAWN_X * cell + cell / 2;
    const my = rowPx(0) + cell / 2;
    const m = cell * 0.22;
    ctx.beginPath();
    ctx.moveTo(mx - m, my - m);
    ctx.lineTo(mx + m, my + m);
    ctx.moveTo(mx + m, my - m);
    ctx.lineTo(mx - m, my + m);
    ctx.stroke();
    if (!s) return;

    const pop = s.anim?.kind === 'pop' ? s.anim : null;
    const cells = boardPositions(s);
    const at = new Map(cells.map((c) => [c.key, c]));
    for (const c of cells) {
        if (!c.resting) continue;
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
            const n = at.get(`${c.x + dx},${c.y + dy}`);
            if (!n || !n.resting || n.color !== c.color) continue;
            if (pop && pop.t >= FLASH_MS && (pop.keys.has(c.key) || pop.keys.has(n.key))) continue;
            bridge(ctx, c.x * cell, rowPx(c.y), n.x * cell, rowPx(n.y), c.color);
        }
    }

    if (s.pair) {
        for (const { x, y, color } of landingCells(s.board, s.pair)) {
            slime(ctx, x * cell, rowPx(y), cell, color, { scale: 0.45, alpha: 0.45 });
        }
    }

    for (const c of cells) {
        const popping = pop?.keys.has(c.key);
        if (!popping) {
            slime(ctx, c.x * cell, rowPx(c.drawY), cell, c.color);
            continue;
        }
        if (pop.t < FLASH_MS) {
            slime(ctx, c.x * cell, rowPx(c.y), cell, c.color, { white: Math.floor(pop.t / 65) % 2 === 0 });
        } else {
            const k = 1 - (pop.t - FLASH_MS) / SHRINK_MS;
            slime(ctx, c.x * cell, rowPx(c.y), cell, c.color, { scale: 1 + (1 - k) * 0.3, alpha: Math.max(0, k) });
        }
    }

    if (s.pair) {
        const [pivot, child] = cellsOf(s.pair);
        slime(ctx, child.x * cell, rowPx(child.y), cell, child.color);
        slime(ctx, pivot.x * cell, rowPx(pivot.y), cell, pivot.color, { pivot: true });
    }

    for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x * cell, rowPx(p.y - 0.5), cell * 0.12 * p.life + 1, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function drawNext() {
    const ctx = nextCtx;
    ctx.clearRect(0, 0, SIDE_W, NEXT_H);
    if (!state) return;
    const sizes = [26, 20];
    let top = 10;
    state.queue.forEach(([pivot, child], i) => {
        const size = sizes[i];
        const x = (SIDE_W - size) / 2;
        slime(ctx, x, top, size, child, { alpha: i === 0 ? 1 : 0.7 });
        slime(ctx, x, top + size, size, pivot, { alpha: i === 0 ? 1 : 0.7 });
        top += size * 2 + 14;
    });
}

function draw() {
    if (!boardCtx) return;
    drawBoard();
    drawNext();
    if (!state) return;
    $('score').textContent = state.score;
    $('hi').textContent = Math.max(hi, state.score);
    $('best-chain').textContent = state.bestChain;
    $('level').textContent = state.level + 1;
}

function showToast(text) {
    toast.textContent = text;
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
}

function showOverlay(title, html, buttons) {
    $('overlay-title').textContent = title;
    $('overlay-text').innerHTML = html;
    $('modes').hidden = buttons !== 'modes';
    $('resume').hidden = buttons !== 'resume';
    for (const el of document.querySelectorAll('.gestures, .keys')) el.hidden = phase !== 'title';
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
    rotate: () => beep(700, 0.06, 'sine', 0.08, 0, 1.4),
    land: () => beep(180, 0.1, 'sine', 0.14, 0, 0.6),
    pop: (chain) => {
        const base = 440 * 2 ** ((Math.min(chain, 12) - 1) * 2 / 12);
        beep(base, 0.12, 'sine', 0.12, 0, 2);
        beep(base * 1.5, 0.12, 'triangle', 0.07, 0.07, 2);
        if (chain >= 2) beep(base * 2, 0.18, 'square', 0.04, 0.14);
    },
    allClear: () => [784, 988, 1175, 1568, 1976].forEach((f, i) => beep(f, 0.14, 'triangle', 0.08, 0.3 + i * 0.07)),
    levelUp: () => [659, 784, 1047].forEach((f, i) => beep(f, 0.12, 'triangle', 0.07, 0.2 + i * 0.08)),
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
const controllable = () => phase === 'play' && state?.pair;

function press(action, source) {
    if (!controllable()) return;
    release(source);
    if (action === 'down') state.softDrop = true;
    actions[action]();
    if (!REPEATS.has(action)) return;
    const tick = () => {
        if (controllable() && action !== 'down') actions[action]();
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
};

addEventListener('keydown', (e) => {
    if (e.repeat) {
        if (KEYS[e.code]) e.preventDefault();
        return;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') return togglePause();
    if ((e.code === 'Enter' || e.code === 'Space') && !overlay.hidden) {
        e.preventDefault();
        const button = $('resume').hidden ? document.querySelector('#modes .primary') : $('resume');
        return button.click();
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
    for (const action of list) if (controllable()) actions[action]();
};

playArea.addEventListener('pointerdown', (e) => {
    if (gesturePointer !== null || phase !== 'play') return;
    e.preventDefault();
    gesturePointer = e.pointerId;
    playArea.setPointerCapture(e.pointerId);
    // 盤面が小さい端末で1マス分の指の移動が短すぎると、触れただけで動いてしまうため下限を設ける
    gesture = createGesture(Math.max(22, cell));
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
        showOverlay('ひとやすみ', 'つづきから あそべるよ。', 'resume');
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

$('resume').addEventListener('click', resume);

for (const button of document.querySelectorAll('#modes button')) {
    button.addEventListener('click', () => {
        ensureAudio();
        audio.resume();
        newGame(Number(button.dataset.colors));
        bgm.setRate(1);
        resume();
    });
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden && phase === 'play') togglePause();
});


let last = performance.now();

function frame(now) {
    // タブ復帰直後などで一度に大きく進めると、スライムが一気に落ちて置かれてしまうため上限を設ける
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
