import { createBgm } from './bgm.js';
import {
    CEILING_Y,
    GROUND_Y,
    HOME_X,
    MAX_LEVEL_STEP,
    RESCUE_TAPS,
    SCORES,
    SCROLL,
    VIEW,
    aimAt,
    bombHitsFort,
    buildStage,
    canLand,
    clampPitch,
    groundY,
    hits,
    levelOff,
    loopOffset,
    normalizeAngle,
    themeOf,
} from './logic.js';
import { render } from './render.js';

const PITCH_RATE = 4.5;
const LEVEL_RATE = 1.6;
const CLIMB_SPEED = 70;
const FORWARD_SPEED = 30;
const HOME_PULL = 0.6;
const LOOP_SEC = 0.4;
const LOOP_RADIUS = 16;
const SHOT_SPEED = 190;
const SHOT_SEC = 0.13;
const MAX_SHOTS = 5;
const BOMB_GRAVITY = 90;
const SPIN_GRAVITY = 55;
const RESPAWN_SEC = 2;
const INVULNERABLE_SEC = 2.5;
const LANDED_SEC = 2.5;
const EXTEND_EVERY = 10000;
const START_LIVES = 3;
const END_WAIT_SEC = 6;
const GLIDE_ANGLE = 0.3;
const APPROACH_X = 40;
const APPROACH_HEIGHT = 60;

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const startButton = document.getElementById('start');
const soundButton = document.getElementById('sound');
const scoreEl = document.getElementById('score');
const hiEl = document.getElementById('hi');
const stageEl = document.getElementById('stage-no');
const livesEl = document.getElementById('lives');
const bombBox = document.getElementById('bomb-box');
const bombButton = document.getElementById('bomb-button');
const pad = document.getElementById('pad');

const view = { s: 1, ox: 0, oy: 0 };
const rand = (min, max) => min + Math.random() * (max - min);

function load(key, fallback) {
    try {
        return localStorage.getItem(key) ?? fallback;
    } catch {
        return fallback;
    }
}

function save(key, value) {
    try {
        localStorage.setItem(key, String(value));
    } catch {}
}

const state = {
    phase: 'title',
    clock: 0,
    level: 0,
    score: 0,
    hi: Number(load('soraAceHi', 0)) || 0,
    nextExtend: EXTEND_EVERY,
    lives: START_LIVES,
    rescueTaps: RESCUE_TAPS,
    cam: 0,
    stage: buildStage(0),
    nextEvent: 0,
    player: null,
    enemies: [],
    guns: [],
    crates: [],
    fort: { x: 0, alive: true },
    shots: [],
    eshots: [],
    bombs: [],
    particles: [],
    popups: [],
    banner: null,
    phaseT: 0,
    bgmAt: 0,
};

let soundOn = load('soraAceSound', 'on') !== 'off';
let audio = null;

function audioContext() {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    return audio;
}

function tone(freq, length, type, volume, delay = 0, slideTo = null) {
    const ac = audioContext();
    const t = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + length);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + length);
}

const FANFARE = [[67, 0.14], [67, 0.14], [72, 0.14], [76, 0.28], [72, 0.14], [76, 0.14], [79, 0.7]];
const FANFARE_SEC = FANFARE.reduce((sum, [, len]) => sum + len, 0) + 0.2;

function bugle(notes) {
    let at = 0;
    for (const [note, len] of notes) {
        const freq = 440 * 2 ** ((note - 69) / 12);
        tone(freq, len * 0.95, 'sawtooth', 0.07, at);
        tone(freq / 2, len * 0.95, 'square', 0.03, at);
        at += len;
    }
}

const SOUNDS = {
    shot: () => tone(1400, 0.05, 'square', 0.04, 0, 700),
    boom: () => tone(220, 0.3, 'sawtooth', 0.12, 0, 40),
    bigBoom: () => [0, 0.12, 0.25].forEach((d) => tone(160, 0.5, 'sawtooth', 0.16, d, 30)),
    hit: () => tone(900, 0.6, 'square', 0.08, 0, 120),
    crash: () => tone(120, 0.8, 'sawtooth', 0.2, 0, 30),
    drop: () => tone(1200, 0.5, 'sine', 0.08, 0, 300),
    pickup: () => [784, 988, 1319].forEach((f, i) => tone(f, 0.1, 'square', 0.06, i * 0.07)),
    rescue: () => [523, 784, 1047].forEach((f, i) => tone(f, 0.1, 'triangle', 0.15, i * 0.06)),
    tap: () => tone(600, 0.04, 'square', 0.04),
    land: () => bugle([[72, 0.12], [72, 0.12], [72, 0.12], [76, 0.36], [72, 0.12], [76, 0.12], [79, 0.8]]),
    fanfare: () => bugle(FANFARE),
    extend: () => [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.08, 'square', 0.05, i * 0.06)),
    over: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, i * 0.25)),
};

function vibrate(ms) {
    try {
        navigator.vibrate?.(ms);
    } catch {}
}

function play(name) {
    if (!soundOn || !audio) return;
    try {
        SOUNDS[name]();
    } catch {}
}

let bgm = null;
function syncBgm() {
    if (!audio) return;
    bgm ??= createBgm(audio);
    if (soundOn && state.phase === 'play' && state.clock >= state.bgmAt && !document.hidden) bgm.start();
    else bgm.stop();
}

const held = { up: false, down: false, fire: false, loop: false, bomb: false };
const pressed = new Set();

function press(key) {
    if (!held[key]) pressed.add(key);
    held[key] = true;
}

function release(key) {
    held[key] = false;
}

const KEYS = {
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    KeyZ: 'fire',
    Space: 'fire',
    KeyX: 'loop',
    KeyC: 'bomb',
};

window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && state.phase !== 'play') {
        startGame();
        return;
    }
    const key = KEYS[e.code];
    if (!key) return;
    e.preventDefault();
    press(key);
});
window.addEventListener('keyup', (e) => {
    const key = KEYS[e.code];
    if (key) release(key);
});
window.addEventListener('blur', () => Object.keys(held).forEach(release));

for (const button of pad.querySelectorAll('[data-key]')) {
    const key = button.dataset.key;
    const down = (e) => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        button.classList.add('held');
        press(key);
    };
    const up = () => {
        button.classList.remove('held');
        release(key);
    };
    button.addEventListener('pointerdown', down);
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, up);
    button.addEventListener('contextmenu', (e) => e.preventDefault());
}

function newPlayer(x, y) {
    return { x, y, a: 0, mode: 'fly', loopT: 0, loopStart: 0, vy: 0, rescue: 0, inv: INVULNERABLE_SEC, fireCD: 0, hasBomb: false, t: 0 };
}

function startStage() {
    state.stage = buildStage(state.level);
    state.cam = 0;
    state.nextEvent = 0;
    state.player = newPlayer(HOME_X, 70);
    state.enemies = [];
    state.guns = [];
    state.crates = [];
    state.shots = [];
    state.eshots = [];
    state.bombs = [];
    state.particles = [];
    state.popups = [];
    state.fort = { x: state.stage.events.find((e) => e.type === 'fort').x, alive: true };
    state.banner = { text: `STAGE ${state.level + 1}`, sub: themeOf(state.level).name, t: 2.5 };
    state.phase = 'play';
    state.phaseT = 0;
    state.bgmAt = state.clock + FANFARE_SEC;
    bgm?.stop();
    play('fanfare');
    renderHud();
}

function startGame() {
    try {
        audioContext();
    } catch {}
    state.level = 0;
    state.score = 0;
    state.lives = START_LIVES;
    state.nextExtend = EXTEND_EVERY;
    overlay.hidden = true;
    pad.classList.remove('off');
    startStage();
}

function addScore(points, x, y) {
    state.score += points;
    if (x !== undefined) state.popups.push({ x, y, text: String(points), t: 1 });
    if (state.score >= state.nextExtend) {
        state.nextExtend += EXTEND_EVERY;
        state.lives++;
        play('extend');
    }
    if (state.score > state.hi) {
        state.hi = state.score;
        save('soraAceHi', state.hi);
    }
    renderHud();
}

function burst(x, y, count, colors, speed = 60) {
    for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(speed * 0.3, speed);
        state.particles.push({
            x,
            y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            t: rand(0.3, 0.8),
            size: Math.random() < 0.3 ? 2 : 1,
            color: colors[i % colors.length],
        });
    }
}

const FIRE = ['#fff36b', '#ff9a2e', '#ff5a3c', '#555'];

function renderHud() {
    scoreEl.textContent = state.score;
    hiEl.textContent = state.hi;
    stageEl.textContent = state.level + 1;
    livesEl.textContent = '✈'.repeat(Math.max(0, state.lives - 1));
    const hasBomb = Boolean(state.player?.hasBomb);
    bombBox.hidden = !hasBomb;
    bombButton.setAttribute('aria-disabled', String(!hasBomb));
}

function renderSound() {
    soundButton.setAttribute('aria-pressed', String(soundOn));
}


const screenX = (x) => x - state.cam;
const onScreen = (x, margin = 0) => screenX(x) > -margin && screenX(x) < VIEW.w + margin;
const difficulty = () => Math.min(state.level, MAX_LEVEL_STEP);

function hitPlayer() {
    const p = state.player;
    p.mode = 'spin';
    p.rescue = 0;
    p.vy = 10;
    play('hit');
    vibrate(120);
}

function crash() {
    const p = state.player;
    burst(p.x, p.y, 40, FIRE, 80);
    play('crash');
    vibrate([80, 40, 200]);
    p.mode = 'down';
    p.t = 0;
    p.hasBomb = false;
    state.lives--;
    renderHud();
}

function land() {
    const p = state.player;
    p.mode = 'landed';
    p.a = 0;
    p.y = groundY(state.level, p.x) - 4;
    p.t = 0;
    addScore(SCORES.landing, p.x, p.y - 12);
    state.banner = { text: 'ちゃくりく せいこう！', sub: `ボーナス ${SCORES.landing}`, t: 3 };
    play('land');
}

function flightVelocity(p) {
    const vx = SCROLL + (HOME_X - screenX(p.x)) * HOME_PULL + Math.cos(p.a) * FORWARD_SPEED;
    return { vx, vy: Math.sin(p.a) * CLIMB_SPEED };
}

function approaching(p) {
    const { runway } = state.stage;
    return p.x >= runway.x0 - APPROACH_X && p.x <= runway.x1 && p.y > GROUND_Y - APPROACH_HEIGHT;
}

function touchdown(p) {
    const { runway } = state.stage;
    if (p.x >= runway.x0 && p.x <= runway.x1 && canLand(p.a) && p.mode === 'fly') land();
    else crash();
}

function updatePlayer(dt) {
    const p = state.player;
    p.inv = Math.max(0, p.inv - dt);
    p.fireCD -= dt;
    p.t += dt;

    if (p.mode === 'down') {
        if (p.t < RESPAWN_SEC) return;
        if (state.lives <= 0) return gameOver();
        state.player = newPlayer(state.cam + HOME_X, 60);
        renderHud();
        return;
    }

    if (p.mode === 'landed') {
        const airborne = p.y < groundY(state.level, p.x) - 5;
        p.x += (airborne ? SCROLL + FORWARD_SPEED : Math.max(0, 40 - p.t * 30)) * dt;
        if (airborne) p.a = levelOff(p.a, LEVEL_RATE, dt);
        if (p.t > LANDED_SEC) nextStage();
        return;
    }

    if (p.mode === 'spin') {
        for (const key of ['fire', 'loop', 'up', 'down']) {
            if (!pressed.has(key)) continue;
            p.rescue++;
            play('tap');
        }
        p.a += 12 * dt;
        p.vy += SPIN_GRAVITY * dt;
        p.x += SCROLL * dt;
        p.y += p.vy * dt;
        if (Math.random() < 0.6) state.particles.push({ x: p.x, y: p.y, vx: -10, vy: -8, t: 0.6, size: 2, color: '#777' });
        if (p.rescue >= RESCUE_TAPS) {
            p.mode = 'fly';
            p.a = 0;
            p.inv = 1.5;
            addScore(SCORES.rescue, p.x, p.y - 10);
            play('rescue');
        } else if (p.y >= groundY(state.level, p.x) - 3) {
            crash();
        }
        return;
    }

    if (pressed.has('loop') && p.mode === 'fly') {
        p.mode = 'loop';
        p.loopT = 0;
        p.loopStart = p.a;
        p.loopOrigin = { sx: screenX(p.x), y: p.y };
    }

    if (p.mode === 'loop') {
        p.loopT = Math.min(p.loopT + dt, LOOP_SEC);
        const turned = (Math.PI * 2 * p.loopT) / LOOP_SEC;
        const offset = loopOffset(turned, p.loopStart, LOOP_RADIUS);
        p.a = p.loopStart - turned;
        p.x = state.cam + p.loopOrigin.sx + offset.x;
        p.y = Math.max(CEILING_Y, p.loopOrigin.y + offset.y);
        if (p.loopT >= LOOP_SEC) {
            p.mode = 'fly';
            p.a = p.loopStart;
        }
    } else {
        if (held.up && !held.down) p.a -= PITCH_RATE * dt;
        else if (held.down && !held.up) p.a += PITCH_RATE * dt;
        else {
            const target = approaching(p) ? GLIDE_ANGLE : 0;
            p.a = target + levelOff(p.a - target, LEVEL_RATE, dt);
        }
        p.a = clampPitch(p.a);
    }

    const { vx, vy } = flightVelocity(p);
    if (p.mode === 'fly') {
        p.x += vx * dt;
        p.y = Math.max(CEILING_Y, p.y + vy * dt);
    }
    p.x = Math.max(state.cam + 12, p.x);

    if (held.fire && p.fireCD <= 0 && state.shots.length < MAX_SHOTS) {
        p.fireCD = SHOT_SEC;
        state.shots.push({
            x: p.x + Math.cos(p.a) * 9,
            y: p.y + Math.sin(p.a) * 9,
            vx: vx + Math.cos(p.a) * SHOT_SPEED,
            vy: Math.sin(p.a) * SHOT_SPEED,
            t: 1,
        });
        play('shot');
    }

    if (pressed.has('bomb') && p.hasBomb) {
        p.hasBomb = false;
        state.bombs.push({ x: p.x, y: p.y + 6, vx, vy: Math.max(vy, 0) + 10 });
        renderHud();
        play('drop');
    }

    if (p.y >= groundY(state.level, p.x) - 4) touchdown(p);
    else if (p.x > state.stage.runway.x1 + 10) passRunway();
}

function spawnEvents() {
    const events = state.stage.events;
    while (state.nextEvent < events.length && events[state.nextEvent].x <= state.cam + VIEW.w + 30) {
        const ev = events[state.nextEvent++];
        const fireCD = rand(1.2, 2.6);
        if (ev.type === 'plane') {
            state.enemies.push({ kind: 'plane', x: state.cam + VIEW.w + 20, y: ev.y, baseY: ev.y, t: rand(0, 6), fireCD });
        } else if (ev.type === 'chaser') {
            state.enemies.push({ kind: 'chaser', x: state.cam - 60, y: ev.y, baseY: ev.y, t: 0, fireCD });
        } else if (ev.type === 'gun') {
            state.guns.push({ x: ev.x, y: groundY(state.level, ev.x), alive: true, fireCD });
        } else if (ev.type === 'crate') {
            state.crates.push({ x: ev.x, y: ev.y });
        }
    }
}

function enemyFire(from, speed) {
    const p = state.player;
    if (p.mode !== 'fly' && p.mode !== 'loop') return;
    const v = aimAt(from, p, speed);
    state.eshots.push({ x: from.x, y: from.y, vx: v.vx + SCROLL * 0.5, vy: v.vy });
}

function updateEnemies(dt) {
    const step = difficulty();
    const p = state.player;
    for (const e of state.enemies) {
        e.t += dt;
        e.fireCD -= dt;
        if (e.kind === 'plane') {
            e.x -= (36 + step * 4) * dt;
            e.y = e.baseY + Math.sin(e.t * 2) * 12;
            if (e.fireCD <= 0 && onScreen(e.x, -40) && e.x > p.x + 30) {
                enemyFire(e, 72 + step * 8);
                e.fireCD = rand(2.2, 3.4) - step * 0.3;
            }
        } else {
            e.x += (SCROLL + 70) * dt;
            e.y += Math.sign(p.y - e.y) * Math.min(Math.abs(p.y - e.y), 20 * dt);
        }
    }
    state.enemies = state.enemies.filter((e) => !e.dead && screenX(e.x) > -80 && screenX(e.x) < VIEW.w + 80);

    for (const gun of state.guns) {
        if (!gun.alive) continue;
        gun.fireCD -= dt;
        if (gun.fireCD <= 0 && onScreen(gun.x, -30)) {
            enemyFire({ x: gun.x, y: gun.y - 10 }, 66 + step * 6);
            gun.fireCD = rand(2.2, 3.2) - step * 0.3;
        }
    }
    state.guns = state.guns.filter((gun) => screenX(gun.x) > -30);
}

function destroy(target, kind) {
    target.dead = true;
    target.alive = false;
    burst(target.x, target.y, 16, FIRE);
    addScore(SCORES[kind], target.x, target.y - 8);
    play('boom');
}

function updateShots(dt) {
    for (const s of state.shots) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.t -= dt;
        if (s.y >= groundY(state.level, s.x)) s.t = 0;
        for (const e of state.enemies) {
            if (!e.dead && s.t > 0 && hits(s, e, 8)) {
                destroy(e, e.kind);
                s.t = 0;
            }
        }
        for (const gun of state.guns) {
            if (gun.alive && s.t > 0 && hits(s, { x: gun.x, y: gun.y - 4 }, 8)) {
                destroy(gun, 'gun');
                s.t = 0;
            }
        }
    }
    state.shots = state.shots.filter((s) => s.t > 0 && onScreen(s.x, 10));

    const p = state.player;
    const vulnerable = p.mode === 'fly' && p.inv <= 0;
    for (const s of state.eshots) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.y >= groundY(state.level, s.x) || s.y < 0) s.dead = true;
        if (!s.dead && vulnerable && hits(s, p, 5)) {
            s.dead = true;
            hitPlayer();
        }
    }
    state.eshots = state.eshots.filter((s) => !s.dead && onScreen(s.x, 10));

    if (p.mode === 'fly' && p.inv <= 0) {
        const rammed = state.enemies.find((e) => !e.dead && hits(e, p, 10));
        if (rammed) {
            destroy(rammed, rammed.kind);
            hitPlayer();
        }
    }
}

function updateBombs(dt) {
    for (const b of state.bombs) {
        b.vy += BOMB_GRAVITY * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.y < groundY(state.level, b.x)) continue;
        b.dead = true;
        if (state.fort.alive && bombHitsFort(b, state.fort.x)) {
            state.fort.alive = false;
            burst(state.fort.x, b.y - 10, 80, FIRE, 110);
            addScore(SCORES.fort, state.fort.x, b.y - 40);
            state.banner = { text: 'きち はかい！', sub: `ボーナス ${SCORES.fort}`, t: 2.5 };
            play('bigBoom');
            vibrate(250);
        } else {
            burst(b.x, b.y, 20, FIRE);
            play('boom');
        }
        for (const gun of state.guns) if (gun.alive && Math.abs(gun.x - b.x) < 24) destroy(gun, 'gun');
    }
    state.bombs = state.bombs.filter((b) => !b.dead);
}

function updateCrates(dt) {
    const p = state.player;
    for (const c of state.crates) {
        if (c.y < groundY(state.level, c.x) - 8) c.y += 10 * dt;
        if (p.mode === 'fly' || p.mode === 'loop') {
            if (hits(p, c, 12)) {
                c.taken = true;
                if (p.hasBomb) addScore(500, c.x, c.y - 10);
                p.hasBomb = true;
                state.popups.push({ x: c.x, y: c.y - 20, text: 'ばくだん ゲット！', t: 1.2, color: '#ff9a2e' });
                renderHud();
                play('pickup');
            }
        }
    }
    state.crates = state.crates.filter((c) => !c.taken && screenX(c.x) > -30);
}

function updateEffects(dt) {
    for (const q of state.particles) {
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vy += 40 * dt;
        q.t -= dt;
    }
    state.particles = state.particles.filter((q) => q.t > 0);
    for (const pop of state.popups) {
        pop.y -= 14 * dt;
        pop.t -= dt;
    }
    state.popups = state.popups.filter((pop) => pop.t > 0);
    if (state.banner && (state.banner.t -= dt) <= 0) state.banner = null;
}

function passRunway() {
    state.player.mode = 'landed';
    state.player.t = 0;
    state.banner = { text: 'ステージ クリア', sub: 'つぎは かっそうろに おりてみよう', t: 3 };
}

function nextStage() {
    state.level++;
    startStage();
}

function gameOver() {
    state.phase = 'over';
    syncBgm();
    play('over');
    pad.classList.add('off');
    overlayTitle.textContent = 'ゲームオーバー';
    overlayText.innerHTML = `スコア ${state.score}（STAGE ${state.level + 1}）<br>ハイスコア ${state.hi}`;
    startButton.textContent = 'もういちど';
    overlay.hidden = false;
}

function update(dt) {
    state.clock += dt;
    updateEffects(dt);
    if (state.phase !== 'play') return;
    const p = state.player;
    const camEnd = state.stage.length - VIEW.w;
    if (p.mode !== 'landed') state.cam = Math.min(state.cam + SCROLL * dt, camEnd);
    state.phaseT = state.cam >= camEnd ? state.phaseT + dt : 0;
    if (state.phaseT > END_WAIT_SEC && p.mode === 'fly') passRunway();
    spawnEvents();
    updatePlayer(dt);
    if (state.phase !== 'play') return;
    updateEnemies(dt);
    updateShots(dt);
    updateBombs(dt);
    updateCrates(dt);
}

function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    view.s = Math.min(canvas.width / VIEW.w, canvas.height / VIEW.h);
    view.ox = (canvas.width - VIEW.w * view.s) / 2;
    view.oy = (canvas.height - VIEW.h * view.s) / 2;
}

startButton.addEventListener('click', startGame);

soundButton.addEventListener('click', () => {
    soundOn = !soundOn;
    save('soraAceSound', soundOn ? 'on' : 'off');
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
    // タブ切り替えなどで間が空いたとき、戻った瞬間に敵や弾が一気に進まないよう上限を設ける
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt);
    syncBgm();
    pressed.clear();
    if (state.player) render(state, canvas, ctx, view);
    else renderTitle();
    requestAnimationFrame(frame);
}

function renderTitle() {
    state.cam += SCROLL * 0.016;
    if (state.cam > state.stage.length - VIEW.w) state.cam = 0;
    const demo = newPlayer(state.cam + HOME_X, 60 + Math.sin(state.clock) * 20);
    demo.inv = 0;
    render({ ...state, player: demo, fort: { x: state.stage.events.find((e) => e.type === 'fort').x, alive: true } }, canvas, ctx, view);
}

window.addEventListener('resize', resize);
resize();
renderHud();
renderSound();
pad.classList.add('off');
requestAnimationFrame(frame);
