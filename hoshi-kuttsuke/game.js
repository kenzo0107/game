import { createBgm } from './bgm.js';
import {
    DANGER_MS,
    DROP_COOLDOWN_MS,
    DROP_TIERS,
    HEIGHT,
    HOLD_Y,
    LINE_Y,
    TIER_COUNT,
    WIDTH,
    clampDropX,
    createDealer,
    createWorld,
    drop,
    radiusOf,
    step,
} from './logic.js';

const STARS = [
    { name: 'ほしくず', light: '#fff6ff', base: '#d9c8ff', dark: '#8f7bd0' },
    { name: 'いんせき', light: '#e6d2bd', base: '#a8876a', dark: '#5e4636', craters: 2 },
    { name: 'つき', light: '#ffffff', base: '#d8d8e0', dark: '#8c8ca0', craters: 3 },
    { name: 'すいせい', light: '#f3dcc4', base: '#c09676', dark: '#6e5040', craters: 3 },
    { name: 'かせい', light: '#ffc29a', base: '#e2603a', dark: '#8c2d18' },
    { name: 'きんせい', light: '#fff7cf', base: '#f2cc6e', dark: '#b2852e' },
    { name: 'ちきゅう', light: '#bfe6ff', base: '#3d8fe0', dark: '#1b4f99', land: '#4fc36b' },
    { name: 'かいおうせい', light: '#b9d4ff', base: '#4366e8', dark: '#1d2a8f' },
    { name: 'もくせい', light: '#ffe8cc', base: '#dba274', dark: '#8f5a36', stripes: '#b5704a' },
    { name: 'どせい', light: '#fff1c9', base: '#e8c77e', dark: '#9c7a3a', ring: true },
    { name: 'たいよう', light: '#fffbe0', base: '#ffc928', dark: '#ff7a1a', sun: true },
];
const FACE = '#2a1838';
const SPAWN_POP_MS = 220;
const KEY_SPEED = 70;
const ANNOUNCE_FROM = 6;
const CHAIN_H = 40;
const RESTART_GUARD_MS = 1000;
const SOUND_KEY = 'hoshi-kuttsuke:sound';
const HI_KEY = 'hoshi-kuttsuke:hi';

const $ = (id) => document.getElementById(id);
const board = $('board');
const ctx = board.getContext('2d');
const nextCanvas = $('next');
const chainCanvas = $('chain');
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

let phase = 'title';
let world = createWorld();
let deal = createDealer();
let current = 0;
let next = 0;
let aimX = WIDTH / 2;
let cooldown = 0;
let best = 0;
let hi = Number(storage.get(HI_KEY, 0));
let scale = 4;
let elapsed = 0;
let overAt = 0;
let particles = [];
const spawnedAt = new Map();
const keysHeld = new Set();

function newGame() {
    world = createWorld();
    deal = createDealer();
    current = deal();
    next = deal();
    aimX = WIDTH / 2;
    cooldown = 0;
    best = 0;
    particles = [];
    spawnedAt.clear();
    updateHud();
}

function updateHud() {
    $('score').textContent = world.score;
    $('hi').textContent = hi;
    drawNext();
}

function release() {
    if (phase !== 'play' || cooldown > 0) return;
    drop(world, current, aimX);
    sfx.drop();
    current = next;
    next = deal();
    cooldown = DROP_COOLDOWN_MS;
    aimX = clampDropX(aimX, current);
    drawNext();
}

function onMerge(event) {
    const tier = event.last ? TIER_COUNT : event.tier + 1;
    if (event.body) spawnedAt.set(event.body.id, elapsed);
    burst(event.x, event.y, STARS[Math.min(tier, TIER_COUNT - 1)].base, 8 + tier * 2, radiusOf(Math.min(tier, TIER_COUNT - 1)));
    if (event.last) {
        sfx.bigBang();
        showToast('たいようが ふたつで ビッグバン！');
        return;
    }
    sfx.merge(tier);
    if (tier > best) {
        best = tier;
        if (tier >= ANNOUNCE_FROM) showToast(`${STARS[tier].name} できた！`);
        drawChain();
    }
}

function burst(x, y, color, count, r) {
    for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 20 + Math.random() * 40;
        particles.push({
            x: x + Math.cos(a) * r * 0.6,
            y: y + Math.sin(a) * r * 0.6,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            life: 1,
            color: Math.random() < 0.4 ? '#fff6b0' : color,
        });
    }
}

function gameOver() {
    phase = 'over';
    overAt = performance.now();
    bgm?.stop();
    sfx.over();
    const record = world.score > hi;
    if (record) {
        hi = world.score;
        storage.set(HI_KEY, hi);
    }
    updateHud();
    const reached = best > 0 ? `いちばん おおきいのは <b>${STARS[best].name}</b>` : '';
    showOverlay(
        record ? 'ハイスコア！' : 'おしまい',
        `スコア <b>${world.score}</b><br>${reached}`,
        'もういちど',
    );
}

function update(ms) {
    elapsed += ms;
    cooldown = Math.max(0, cooldown - ms);
    const dir = (keysHeld.has('right') ? 1 : 0) - (keysHeld.has('left') ? 1 : 0);
    if (dir) aimX = clampDropX(aimX + (dir * KEY_SPEED * ms) / 1000, current);

    const before = world.score;
    const result = step(world, ms);
    result.merges.forEach(onMerge);
    if (world.score !== before) updateHud();

    for (const p of particles) {
        p.x += (p.vx * ms) / 1000;
        p.y += (p.vy * ms) / 1000;
        p.vy += (60 * ms) / 1000;
        p.life -= ms / 700;
    }
    particles = particles.filter((p) => p.life > 0);

    if (result.over) gameOver();
}


function fitCanvas(canvas, w, h) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
}

function layout() {
    const area = $('play').getBoundingClientRect();
    const w = Math.min(area.width - 16, 460);
    const h = area.height - CHAIN_H - 20;
    scale = Math.max(1, Math.min(w / WIDTH, h / HEIGHT));
    fitCanvas(board, WIDTH * scale, HEIGHT * scale);
    fitCanvas(nextCanvas, 32, 32);
    drawNext();
    drawChain();
}

function face(c, r, tier) {
    const eyeX = r * 0.32;
    const eyeY = -r * 0.08;
    const eyeR = Math.max(r * 0.1, 0.6);
    c.fillStyle = FACE;
    if (tier === 0) {
        c.strokeStyle = FACE;
        c.lineWidth = eyeR * 0.9;
        c.lineCap = 'round';
        for (const sx of [-1, 1]) {
            c.beginPath();
            c.arc(sx * eyeX, eyeY + eyeR * 0.4, eyeR, Math.PI * 1.1, Math.PI * 1.9);
            c.stroke();
        }
    } else {
        for (const sx of [-1, 1]) {
            c.beginPath();
            c.arc(sx * eyeX, eyeY, eyeR, 0, Math.PI * 2);
            c.fill();
        }
        c.fillStyle = '#fff';
        for (const sx of [-1, 1]) {
            c.beginPath();
            c.arc(sx * eyeX + eyeR * 0.35, eyeY - eyeR * 0.35, eyeR * 0.35, 0, Math.PI * 2);
            c.fill();
        }
    }
    c.fillStyle = 'rgba(255, 110, 150, 0.45)';
    for (const sx of [-1, 1]) {
        c.beginPath();
        c.ellipse(sx * r * 0.52, r * 0.16, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
        c.fill();
    }
    c.strokeStyle = FACE;
    c.lineWidth = Math.max(r * 0.06, 0.5);
    c.lineCap = 'round';
    c.beginPath();
    c.arc(0, r * 0.1, r * 0.16, Math.PI * 0.15, Math.PI * 0.85);
    c.stroke();
}

function features(c, r, star) {
    if (star.craters) {
        c.fillStyle = star.dark;
        c.globalAlpha = 0.35;
        const spots = [[-0.45, -0.5, 0.18], [0.5, 0.45, 0.22], [-0.2, 0.62, 0.13]];
        for (const [x, y, s] of spots.slice(0, star.craters)) {
            c.beginPath();
            c.arc(x * r, y * r, s * r, 0, Math.PI * 2);
            c.fill();
        }
        c.globalAlpha = 1;
    }
    if (star.land) {
        c.fillStyle = star.land;
        const blobs = [[-0.5, -0.45, 0.35, 0.22], [0.55, 0.15, 0.25, 0.4], [-0.35, 0.6, 0.3, 0.18]];
        for (const [x, y, w, h] of blobs) {
            c.beginPath();
            c.ellipse(x * r, y * r, w * r, h * r, 0.4, 0, Math.PI * 2);
            c.fill();
        }
    }
    if (star.stripes) {
        c.fillStyle = star.stripes;
        c.globalAlpha = 0.55;
        for (const y of [-0.62, -0.3, 0.42, 0.7]) c.fillRect(-r, y * r - r * 0.06, r * 2, r * 0.12);
        c.globalAlpha = 1;
        c.fillStyle = '#c4553a';
        c.beginPath();
        c.ellipse(r * 0.4, r * 0.55, r * 0.17, r * 0.09, 0, 0, Math.PI * 2);
        c.fill();
    }
}

function ring(c, r, front) {
    c.strokeStyle = front ? 'rgba(255, 232, 170, 0.95)' : 'rgba(200, 170, 110, 0.8)';
    c.lineWidth = r * 0.16;
    c.beginPath();
    c.ellipse(0, 0, r * 1.45, r * 0.38, -0.25, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    c.stroke();
}

function drawStar(c, x, y, r, tier, { angle = 0, alpha = 1 } = {}) {
    const star = STARS[tier];
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    if (star.sun) {
        c.fillStyle = 'rgba(255, 190, 60, 0.35)';
        c.beginPath();
        for (let i = 0; i < 24; i++) {
            const a = angle + (i * Math.PI) / 12;
            const rr = i % 2 ? r * 1.08 : r * 1.25;
            c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        c.fill();
    }
    if (star.ring) ring(c, r, false);
    c.save();
    c.rotate(angle);
    const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    g.addColorStop(0, star.light);
    g.addColorStop(0.45, star.base);
    g.addColorStop(1, star.dark);
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    c.clip();
    features(c, r, star);
    c.restore();
    if (star.ring) ring(c, r, true);
    c.rotate(angle * 0.15);
    face(c, r, tier);
    c.restore();
}

function drawBoard() {
    const s = scale;
    const w = WIDTH * s;
    const h = HEIGHT * s;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b0824');
    bg.addColorStop(1, '#221a55');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const danger = world.dangerMs / DANGER_MS;
    const blink = danger > 0 && Math.floor(elapsed / 150) % 2 === 0;
    ctx.strokeStyle = blink ? '#ff4f6d' : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = danger > 0 ? 3 : 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(0, LINE_Y * s);
    ctx.lineTo(w, LINE_Y * s);
    ctx.stroke();
    ctx.setLineDash([]);

    if (phase === 'play' || phase === 'pause') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(aimX * s, HOLD_Y * s);
        ctx.lineTo(aimX * s, h);
        ctx.stroke();
        const ready = cooldown === 0;
        drawStar(ctx, aimX * s, HOLD_Y * s, radiusOf(current) * s, current, { alpha: ready ? 1 : 0.35 });
    }

    for (const b of world.bodies) {
        const born = spawnedAt.get(b.id);
        let grow = 1;
        if (born !== undefined) {
            const t = (elapsed - born) / SPAWN_POP_MS;
            if (t >= 1) spawnedAt.delete(b.id);
            else grow = 0.6 + 0.4 * Math.sin((Math.min(t, 1) * Math.PI) / 2) + 0.12 * Math.sin(t * Math.PI);
        }
        drawStar(ctx, b.x * s, b.y * s, b.r * s * grow, b.tier, { angle: b.angle });
    }

    for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x * s, p.y * s, Math.max(1.5, s * 0.6) * p.life, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function drawNext() {
    const c = nextCanvas.getContext('2d');
    c.clearRect(0, 0, 32, 32);
    const r = 6 + (radiusOf(next) / radiusOf(4)) * 9;
    drawStar(c, 16, 16, r, next);
}

function drawChain() {
    const w = WIDTH * scale;
    const c = fitCanvas(chainCanvas, w, CHAIN_H);
    const gap = w / TIER_COUNT;
    for (let i = 0; i < TIER_COUNT; i++) {
        const r = Math.min(gap * 0.45, 5 + i * 1.4);
        const known = i < DROP_TIERS || i <= best;
        drawStar(c, gap * (i + 0.5), CHAIN_H / 2, r, i, { alpha: known ? 1 : 0.2 });
    }
}

function draw() {
    drawBoard();
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
    for (const el of document.querySelectorAll('.howto')) el.hidden = phase !== 'title';
    overlay.hidden = false;
}


let audio = null;
let bgm = null;
let master = null;
let soundOn = storage.get(SOUND_KEY, '1') === '1';

function ensureAudio() {
    if (audio) return;
    audio = new AudioContext();
    master = audio.createGain();
    master.gain.value = soundOn ? 1 : 0;
    master.connect(audio.destination);
    bgm = createBgm(audio, master);
}

function beep(freq, len, type = 'sine', vol = 0.08, delay = 0, slide = 0) {
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

const PENTATONIC = [0, 2, 4, 7, 9];
const sfx = {
    drop: () => beep(330, 0.12, 'sine', 0.1, 0, 0.5),
    merge: (tier) => {
        const semis = 12 * Math.floor(tier / 5) + PENTATONIC[tier % 5];
        const base = 523 * 2 ** (semis / 12);
        beep(base, 0.18, 'sine', 0.13, 0, 1.5);
        beep(base * 1.5, 0.16, 'triangle', 0.06, 0.06);
        if (tier >= ANNOUNCE_FROM) beep(base * 2, 0.3, 'triangle', 0.05, 0.12);
    },
    bigBang: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => beep(f, 0.25, 'triangle', 0.08, i * 0.08)),
    over: () => [392, 330, 262, 196].forEach((f, i) => beep(f, 0.3, 'triangle', 0.08, i * 0.2)),
};

function setSound(on) {
    soundOn = on;
    storage.set(SOUND_KEY, on ? '1' : '0');
    $('sound').setAttribute('aria-pressed', String(on));
    if (master) master.gain.value = on ? 1 : 0;
}


function aimFromPointer(e) {
    const rect = board.getBoundingClientRect();
    aimX = clampDropX((e.clientX - rect.left) / scale, current);
}

const playArea = $('play');
let pointer = null;

playArea.addEventListener('pointerdown', (e) => {
    if (phase !== 'play' || pointer !== null) return;
    e.preventDefault();
    pointer = e.pointerId;
    playArea.setPointerCapture(e.pointerId);
    aimFromPointer(e);
});

playArea.addEventListener('pointermove', (e) => {
    if (phase !== 'play') return;
    if (pointer === e.pointerId || (pointer === null && e.pointerType === 'mouse')) aimFromPointer(e);
});

playArea.addEventListener('pointerup', (e) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    aimFromPointer(e);
    release();
});

playArea.addEventListener('pointercancel', (e) => {
    if (e.pointerId === pointer) pointer = null;
});

const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', KeyA: 'left', KeyD: 'right' };

addEventListener('keydown', (e) => {
    if (e.repeat) {
        if (KEYS[e.code] || e.code === 'Space') e.preventDefault();
        return;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') return togglePause();
    if ((e.code === 'Enter' || e.code === 'Space') && !overlay.hidden) {
        e.preventDefault();
        // 落とすつもりで連打したスペースで、結果を見る前に次のゲームが始まらないようにする
        if (phase === 'over' && performance.now() - overAt < RESTART_GUARD_MS) return;
        phase === 'pause' ? resume() : $('start').click();
        return;
    }
    if (KEYS[e.code]) {
        e.preventDefault();
        keysHeld.add(KEYS[e.code]);
    } else if (e.code === 'Space' || e.code === 'ArrowDown') {
        e.preventDefault();
        release();
    }
});

addEventListener('keyup', (e) => keysHeld.delete(KEYS[e.code]));
addEventListener('blur', () => keysHeld.clear());
addEventListener('contextmenu', (e) => e.preventDefault());

$('sound').addEventListener('click', () => {
    ensureAudio();
    setSound(!soundOn);
});

$('pause').addEventListener('click', () => togglePause());

function togglePause() {
    if (phase === 'play') {
        phase = 'pause';
        keysHeld.clear();
        pointer = null;
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
    if (phase !== 'pause') newGame();
    drawChain();
    resume();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden && phase === 'play') togglePause();
});


let last = performance.now();

function frame(now) {
    // タブ復帰直後などで一度に大きく進めると、ほしが壁や床をすり抜けるため上限を設ける
    const ms = Math.min(now - last, 33);
    last = now;
    if (phase === 'play') update(ms);
    draw();
    requestAnimationFrame(frame);
}

newGame();
setSound(soundOn);
addEventListener('resize', layout);
layout();
requestAnimationFrame(frame);
