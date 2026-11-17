import { createBgm } from './bgm.js';
import {
    POSES,
    ROUNDS,
    ROWS,
    STAGES,
    WORLD,
    cpuDisguise,
    disguiseLevel,
    pickStages,
    poseOf,
    propAt,
    propBox,
    shuffle,
    spotChance,
} from './logic.js';

const PREP_SEC = { hide: 10, oni: 3 };
const SEARCH_SEC = { hide: 15, oni: 20 };
const ROUND_END_SEC = 3;
const HIDERS = { hide: 3, oni: 4 };
const CPU_SKILL = { hide: 0.6, oni: 0.8 };
const EXTRA_SHOTS = 3;
const ONI_MOVE_SEC = 0.7;
const ONI_LOOK_SEC = 0.8;
const ONI_DECOYS = 3;
const MOVE_SPOTTED_RANGE = 2.5;
const HOP_SEC = 0.35;
const START_X = 8;
const CPU_WAIT_X = [5.5, 10.5, 3, 13];
const FOUND_POINTS = 100;
const ESCAPE_POINTS = 100;
const PAINT = '#ff3ea5';
const ONI_GUN = { x: 14.6, y: 1.9 };
const SCOPE = { zoom: 2.4, radius: 0.2, touchLift: 90 };
const LYRICS = [
    'いろを かえて へんしん',
    'ポーズを きめて じっとして',
    'めっちゃ かくれる カメレオン',
    'みつからないで ラララ',
];
const LYRIC_SEC = 2.2;

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const bestText = document.getElementById('best-text');
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const soundButton = document.getElementById('sound');
const roundEl = document.getElementById('round');
const timeEl = document.getElementById('time');
const scoreEl = document.getElementById('score');
const ammoBox = document.getElementById('ammo-box');
const ammoEl = document.getElementById('ammo');
const controls = document.getElementById('controls');
const posesEl = document.getElementById('poses');
const palette = document.getElementById('palette');

const view = { w: 0, h: 0, s: 1, ox: 0, oy: 0, dpr: 1 };
const rand = (min, max) => min + Math.random() * (max - min);
const ease = (t) => t * t * (3 - 2 * t);

const state = {
    mode: 'hide',
    phase: 'title',
    clock: 0,
    round: 0,
    timer: 0,
    score: 0,
    escapes: 0,
    stage: STAGES[0],
    hiders: [],
    oni: null,
    shots: 0,
    splats: [],
    bullets: [],
    popups: [],
    banner: null,
    scope: null,
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

const bestKey = (mode) => `mecchaKamereonBest-${mode}`;
let soundOn = (() => {
    try {
        return localStorage.getItem('mecchaKamereonSound') !== 'off';
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

const SOUNDS = {
    hop: () => tone(400, 0.12, 'sine', 0.2, 0, 900),
    change: () => tone(600, 0.15, 'sine', 0.12, 0, 1200),
    pose: () => [880, 1320].forEach((f, i) => tone(f, 0.08, 'square', 0.05, i * 0.06)),
    shot: () => tone(900, 0.15, 'sawtooth', 0.08, 0, 120),
    splat: () => tone(160, 0.25, 'sine', 0.3, 0, 60),
    found: () => [988, 784, 523].forEach((f, i) => tone(f, 0.14, 'square', 0.06, i * 0.09)),
    escape: () => [659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, 'triangle', 0.15, i * 0.08)),
    whistle: () => tone(1500, 0.4, 'sine', 0.12, 0, 2200),
    tick: () => tone(1200, 0.05, 'square', 0.04),
    over: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.15, i * 0.18)),
};

let bgm = null;
function syncBgm() {
    if (!audio) return;
    bgm ??= createBgm(audio);
    const playing = state.phase === 'prep' || state.phase === 'search';
    if (soundOn && playing && !document.hidden) bgm.start();
    else bgm.stop();
}

function play(name) {
    if (!soundOn) return;
    if (state.clock - (lastSound[name] ?? -1) < 0.05) return;
    lastSound[name] = state.clock;
    try {
        SOUNDS[name]();
    } catch {}
}

function hiderSpot(h) {
    if (h.propIndex === null) return { x: h.waitX, row: 1 };
    const prop = state.stage.props[h.propIndex];
    return { x: prop.x, row: prop.row };
}

function hiderPlace(h) {
    const to = hiderSpot(h);
    const toY = ROWS[to.row].y;
    const toScale = ROWS[to.row].scale;
    if (!h.hop) return { x: to.x, y: toY, scale: toScale, lift: 0 };
    const k = ease(Math.min(1, h.hop.t / HOP_SEC));
    const from = h.hop.from;
    return {
        x: from.x + (to.x - from.x) * k,
        y: ROWS[from.row].y + (toY - ROWS[from.row].y) * k,
        scale: ROWS[from.row].scale + (toScale - ROWS[from.row].scale) * k,
        lift: Math.sin(Math.PI * k) * 1.2,
    };
}

function moveHider(h, propIndex) {
    h.hop = { from: hiderSpot(h), t: 0 };
    h.propIndex = propIndex;
}

function makeHider(player, waitX = START_X) {
    return { player, waitX, propIndex: null, color: 0, pose: 'maru', found: false, hop: null, hideIn: 0, blink: rand(1, 4) };
}

const player = () => state.hiders.find((h) => h.player);
const popup = (x, y, text, color = '#fff', size = 1) => state.popups.push({ x, y, text, color, size, t: 0 });

function renderHud() {
    roundEl.textContent = `${Math.min(state.round + 1, ROUNDS)}/${ROUNDS}`;
    timeEl.textContent = Math.ceil(Math.max(0, state.timer));
    scoreEl.textContent = state.score;
    ammoBox.hidden = state.mode !== 'oni';
    ammoEl.textContent = '●'.repeat(state.shots) || '-';
}

function startGame(mode) {
    Object.assign(state, { mode, round: 0, score: 0, escapes: 0, stages: pickStages() });
    overlay.hidden = true;
    startRound();
}

function startRound() {
    const { mode } = state;
    const stage = state.stages[state.round];
    const cpuCount = HIDERS[mode];
    const spots = shuffle([...stage.props.keys()]);
    const cpus = spots.slice(0, cpuCount).map((propIndex, i) => {
        const h = makeHider(false, CPU_WAIT_X[i]);
        Object.assign(h, cpuDisguise(stage.props[propIndex], cpuSkill()));
        h.target = propIndex;
        h.hideIn = rand(0.4, mode === 'oni' ? 1.5 : PREP_SEC[mode] - 2);
        return h;
    });
    Object.assign(state, {
        phase: 'prep',
        stage,
        timer: PREP_SEC[mode],
        hiders: mode === 'hide' ? [makeHider(true), ...cpus] : cpus,
        oni: null,
        shots: 0,
        splats: [],
        bullets: [],
        popups: [],
        banner: { text: `ROUND ${state.round + 1}  ${stage.name}`, t: 0 },
    });
    controls.hidden = mode !== 'hide';
    renderControls();
    renderHud();
    play('whistle');
    syncBgm();
}

const cpuSkill = () => CPU_SKILL[state.mode] + state.round * 0.03;

function retarget(h, avoid) {
    const used = new Set(state.hiders.flatMap((c) => [c.propIndex, c.target]).concat(avoid));
    const free = shuffle([...state.stage.props.keys()].filter((i) => !used.has(i)));
    h.target = free[0];
    Object.assign(h, cpuDisguise(state.stage.props[h.target], cpuSkill()));
}

function startSearch() {
    state.phase = 'search';
    state.timer = SEARCH_SEC[state.mode];
    for (const h of state.hiders) {
        if (!h.player && h.propIndex === null) moveHider(h, h.target);
        h.hop = null;
    }
    if (state.mode === 'hide') {
        state.oni = { x: 8, y: 3, from: { x: 8, y: 3 }, queue: [], target: null, sub: 'idle', t: 0 };
        state.banner = { text: 'ポーズ！ うごいちゃダメ！', t: 0 };
    } else {
        state.shots = state.hiders.length + EXTRA_SHOTS;
        state.banner = { text: 'さがせ！ おして ねらって はなすと うつ', t: 0 };
    }
    play('pose');
    renderHud();
}

function endRound(text, color) {
    if (state.phase !== 'search') return;
    state.phase = 'roundEnd';
    state.timer = ROUND_END_SEC;
    state.banner = { text, t: 0, color };
    controls.hidden = true;
    renderHud();
    syncBgm();
}

function finishSearchTime() {
    if (state.mode === 'hide') {
        const me = player();
        if (!me.found) {
            state.escapes += 1;
            state.score += ESCAPE_POINTS;
            play('escape');
            endRound('にげきった！', '#7cf06b');
        }
    } else {
        endRound('じかんぎれ！', '#ffd23f');
    }
}

function finishGame() {
    state.phase = 'over';
    const key = bestKey(state.mode);
    const best = loadNumber(key);
    const isBest = state.score > best;
    if (isBest) save(key, state.score);
    overlayTitle.textContent = isBest ? 'ハイスコア！' : 'おしまい！';
    const detail = state.mode === 'hide' ? `${ROUNDS}かいせん中 ${state.escapes}かい にげきった！` : 'みつけた かずで スコアが きまるよ';
    overlayText.innerHTML = `${detail}<br>スコア<br><b>${state.score}</b>`;
    renderBest();
    overlay.hidden = false;
    play('over');
    syncBgm();
}

function renderBest() {
    bestText.textContent = `ベスト　かくれる ${loadNumber(bestKey('hide'))} ／ おに ${loadNumber(bestKey('oni'))}`;
}

function oniTargets() {
    const { props } = state.stage;
    const alive = state.hiders.filter((h) => !h.found);
    const taken = new Set(alive.map((h) => h.propIndex));
    const decoys = shuffle([...props.keys()].filter((i) => !taken.has(i))).slice(0, ONI_DECOYS);
    const spots = [...new Set(alive.map((h) => h.propIndex)), ...decoys];
    return shuffle(spots).map((propIndex) => ({ propIndex }));
}

function targetPoint(target) {
    if (target.propIndex === null) return { x: START_X, y: ROWS[1].y - 0.6 };
    const b = propBox(state.stage.props[target.propIndex]);
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
}

function fire(from, to, onHit) {
    state.bullets.push({ from, to, t: 0, onHit });
    play('shot');
}

function hiderHit(h, at) {
    h.found = true;
    state.splats.push({ x: at.x, y: at.y, r: rand(0.45, 0.6), seed: Math.random() * 10 });
    popup(at.x, at.y - 1, h.player ? 'みつかった！' : 'みつけた！', h.player ? '#ff4d4d' : '#ffd23f', 1.1);
    play('splat');
    play('found');
}

function oniShoot(h) {
    const place = hiderPlace(h);
    const at = { x: place.x, y: place.y - (poseOf(h.pose).h * place.scale) / 2 };
    h.targeted = true;
    fire({ ...ONI_GUN }, at, () => {
        hiderHit(h, at);
        if (h.player) endRound('つかまった…', '#ff4d4d');
    });
}

function updateOni(dt) {
    const oni = state.oni;
    if (!oni) return;
    oni.t += dt;
    if (oni.sub === 'idle' || (oni.sub === 'look' && oni.t >= ONI_LOOK_SEC)) {
        if (oni.sub === 'look') {
            for (const h of state.hiders) {
                if (h.found || h.targeted || h.propIndex !== oni.target.propIndex) continue;
                if (Math.random() < spotChance(disguiseLevel(h, state.stage.props), state.round)) oniShoot(h);
            }
        }
        if (!oni.queue.length) oni.queue = oniTargets();
        oni.target = oni.queue.shift();
        oni.from = { x: oni.x, y: oni.y };
        oni.sub = 'move';
        oni.t = 0;
    } else if (oni.sub === 'move') {
        const to = targetPoint(oni.target);
        const k = ease(Math.min(1, oni.t / ONI_MOVE_SEC));
        oni.x = oni.from.x + (to.x - oni.from.x) * k;
        oni.y = oni.from.y + (to.y - oni.from.y) * k;
        if (oni.t >= ONI_MOVE_SEC) {
            oni.sub = 'look';
            oni.t = 0;
        }
    }
}

function playerFidget() {
    const me = player();
    if (state.phase !== 'search' || !state.oni || me.found || me.targeted) return;
    const place = hiderPlace(me);
    if (Math.hypot(state.oni.x - place.x, state.oni.y - (place.y - 0.8)) < MOVE_SPOTTED_RANGE) {
        popup(place.x, place.y - 2.4, 'うごいたな！', '#ff4d4d');
        oniShoot(me);
    }
}

function playerShoot(x, y) {
    if (state.shots <= 0) return;
    state.shots -= 1;
    renderHud();
    const index = propAt(state.stage.props, x, y);
    fire({ x: 8, y: WORLD.height + 0.5 }, { x, y }, () => {
        const h = state.hiders.find((c) => !c.found && c.propIndex === index && index !== null);
        if (h) {
            hiderHit(h, { x, y });
            state.score += FOUND_POINTS;
            renderHud();
            if (state.hiders.every((c) => c.found)) {
                const bonus = Math.ceil(state.timer) * 10;
                state.score += bonus;
                renderHud();
                play('escape');
                endRound(`ぜんいん みつけた！ +${bonus}`, '#7cf06b');
            }
        } else {
            state.splats.push({ x, y, r: rand(0.25, 0.35), seed: Math.random() * 10, miss: true });
            popup(x, y - 0.6, 'ハズレ', '#fff', 0.8);
            play('splat');
        }
        if (state.shots <= 0 && state.phase === 'search' && state.bullets.length <= 1) endRound('たまぎれ！', '#ffd23f');
    });
}

function update(dt) {
    state.clock += dt;
    for (const p of state.popups) p.t += dt;
    state.popups = state.popups.filter((p) => p.t < 1.4);
    if (state.banner) state.banner.t += dt;
    for (const h of state.hiders) {
        if (h.hop) {
            h.hop.t += dt;
            if (h.hop.t >= HOP_SEC) h.hop = null;
        }
        h.blink -= dt;
        if (h.blink < -0.15) h.blink = rand(1.5, 4);
    }
    for (const b of state.bullets) b.t += dt;
    for (const b of state.bullets.filter((b) => b.t >= 0.2)) b.onHit();
    state.bullets = state.bullets.filter((b) => b.t < 0.2);

    if (state.phase === 'prep') {
        state.timer -= dt;
        for (const h of state.hiders) {
            if (h.player || h.propIndex !== null) continue;
            h.hideIn -= dt;
            if (h.hideIn <= 0) moveHider(h, h.target);
        }
        if (state.timer <= 3 && Math.ceil(state.timer) !== Math.ceil(state.timer + dt)) play('tick');
        if (state.timer <= 0) startSearch();
        renderHud();
    } else if (state.phase === 'search') {
        state.timer -= dt;
        updateOni(dt);
        if (state.timer <= 0) finishSearchTime();
        renderHud();
    } else if (state.phase === 'roundEnd') {
        state.timer -= dt;
        if (state.timer <= 0) {
            state.round += 1;
            if (state.round >= ROUNDS) finishGame();
            else startRound();
        }
    }
}

function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const mix = (v) => Math.round(v * (1 - amount));
    return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

function shapePath(pose, wiggle) {
    const { w, h } = poseOf(pose);
    ctx.beginPath();
    if (pose === 'maru') {
        ctx.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (pose === 'hoshi') {
        const R = h / 2;
        for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            const r = i % 2 ? R * 0.45 : R;
            ctx.lineTo(Math.cos(a) * r, -h / 2 + Math.sin(a) * r);
        }
        ctx.closePath();
    } else if (pose === 'tako') {
        ctx.ellipse(0, -h * 0.62, w * 0.36, h * 0.36, 0, 0, Math.PI * 2);
        for (let i = 0; i < 6; i++) {
            const x0 = -w * 0.3 + i * w * 0.12;
            const sway = Math.sin(wiggle + i) * 0.06;
            ctx.moveTo(x0 - 0.08, -h * 0.4);
            ctx.quadraticCurveTo(x0 * 1.3 + sway - 0.08, -h * 0.15, x0 * 1.6 + sway, 0);
            ctx.quadraticCurveTo(x0 * 1.3 + sway + 0.08, -h * 0.15, x0 + 0.08, -h * 0.4);
        }
    } else if (pose === 'noppo') {
        ctx.roundRect(-w * 0.3, -h, w * 0.6, h, w * 0.3);
        for (const side of [-1, 1]) {
            ctx.moveTo(side * w * 0.25, -h * 0.55);
            ctx.lineTo(side * w * 0.55, -h * 0.82);
            ctx.lineTo(side * w * 0.42, -h * 0.88);
            ctx.lineTo(side * w * 0.22, -h * 0.68);
        }
    } else if (pose === 'kaeru') {
        ctx.ellipse(0, -h * 0.4, w / 2, h * 0.4, 0, 0, Math.PI * 2);
        for (const side of [-1, 1]) {
            ctx.moveTo(side * w * 0.25 + w * 0.17, -h * 0.82);
            ctx.arc(side * w * 0.25, -h * 0.82, w * 0.17, 0, Math.PI * 2);
        }
    } else if (pose === 'neko') {
        ctx.ellipse(0, -h * 0.4, w / 2, h * 0.4, 0, 0, Math.PI * 2);
        ctx.moveTo(-w * 0.4, -h * 0.55);
        ctx.lineTo(-w * 0.32, -h);
        ctx.lineTo(-w * 0.05, -h * 0.75);
        ctx.lineTo(w * 0.05, -h * 0.75);
        ctx.lineTo(w * 0.32, -h);
        ctx.lineTo(w * 0.4, -h * 0.55);
        ctx.closePath();
    } else if (pose === 'roketto') {
        ctx.moveTo(0, -h);
        ctx.quadraticCurveTo(w * 0.32, -h * 0.75, w * 0.3, -h * 0.25);
        ctx.lineTo(w / 2, 0);
        ctx.lineTo(-w / 2, 0);
        ctx.lineTo(-w * 0.3, -h * 0.25);
        ctx.quadraticCurveTo(-w * 0.32, -h * 0.75, 0, -h);
        ctx.closePath();
    } else if (pose === 'haato') {
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-w * 0.55, -h * 0.45, -w * 0.55, -h, -w * 0.25, -h);
        ctx.bezierCurveTo(-w * 0.08, -h, 0, -h * 0.85, 0, -h * 0.75);
        ctx.bezierCurveTo(0, -h * 0.85, w * 0.08, -h, w * 0.25, -h);
        ctx.bezierCurveTo(w * 0.55, -h, w * 0.55, -h * 0.45, 0, 0);
        ctx.closePath();
    } else {
        ctx.roundRect(-w / 2, -h, w, h, h / 2);
    }
}

function drawShape(pose, x, baseY, scale, color, wiggle = 0) {
    ctx.save();
    ctx.translate(x, baseY);
    ctx.scale(scale, scale);
    shapePath(pose, wiggle);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = shade(color, 0.35);
    ctx.lineWidth = 0.06;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
}

function drawFeatures(h, place) {
    const { w, h: height } = poseOf(h.pose);
    const color = state.stage.colors[h.color];
    ctx.save();
    ctx.translate(place.x, place.y - place.lift);
    ctx.scale(place.scale, place.scale);
    ctx.fillStyle = color;
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * w * 0.22, 0, 0.16, 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const tx = w * 0.42;
    for (let i = 0; i <= 20; i++) {
        const a = (i / 20) * Math.PI * 2.4;
        const r = 0.2 * (1 - i / 26);
        ctx.lineTo(tx + Math.cos(a) * r, -0.2 + Math.sin(a) * r);
    }
    ctx.stroke();
    const ex = w * 0.16;
    const ey = -height * 0.72;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ex, ey, 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 0.05;
    if (h.found) {
        ctx.beginPath();
        ctx.moveTo(ex - 0.08, ey - 0.08);
        ctx.lineTo(ex + 0.08, ey + 0.08);
        ctx.moveTo(ex + 0.08, ey - 0.08);
        ctx.lineTo(ex - 0.08, ey + 0.08);
        ctx.stroke();
    } else if (h.blink < 0) {
        ctx.beginPath();
        ctx.moveTo(ex - 0.1, ey);
        ctx.lineTo(ex + 0.1, ey);
        ctx.stroke();
    } else {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex, ey, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(ex + Math.sin(state.clock * 1.3 + h.color) * 0.04, ey, 0.05, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawHider(h) {
    const place = hiderPlace(h);
    const color = state.stage.colors[h.color];
    drawShape(h.pose, place.x, place.y - place.lift, place.scale, color, state.clock * 3);
    drawFeatures(h, place);
    if (h.player && state.phase !== 'roundEnd') {
        const top = place.y - place.lift - poseOf(h.pose).h * place.scale - 0.35;
        const bob = Math.sin(state.clock * 6) * 0.08;
        ctx.fillStyle = '#ffd23f';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        ctx.moveTo(place.x, top + bob);
        ctx.lineTo(place.x - 0.22, top - 0.3 + bob);
        ctx.lineTo(place.x + 0.22, top - 0.3 + bob);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
}

const STAGE_DECOR = {
    yuki: () => {
        ctx.fillStyle = '#dfeaf5';
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(i * 4 - 2, 5.6);
            ctx.lineTo(i * 4, 2.6 + (i % 2) * 0.8);
            ctx.lineTo(i * 4 + 2.4, 5.6);
            ctx.fill();
        }
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 30; i++) {
            const y = ((i * 0.37 + state.clock * 0.5) % 6 + 6) % 6;
            ctx.beginPath();
            ctx.arc((i * 2.3 + Math.sin(state.clock + i) * 0.3) % 16, y, 0.06, 0, Math.PI * 2);
            ctx.fill();
        }
    },
    omocha: () => {
        const colors = ['#ff4d4d', '#3f7cff', '#ffd23f', '#3fae4a'];
        for (let i = 0; i < 8; i++) {
            ctx.fillStyle = colors[i % 4];
            ctx.globalAlpha = 0.35;
            ctx.fillRect(i * 2.1, 4.4 - (i % 3) * 0.5, 1.2, 1.2);
        }
        ctx.globalAlpha = 1;
    },
    uchu: () => {
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 40; i++) {
            const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(state.clock * 2 + i));
            ctx.globalAlpha = twinkle;
            ctx.fillRect((i * 3.3) % 16, (i * 0.53) % 5.4, 0.06, 0.06);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ff8a2b';
        ctx.beginPath();
        ctx.arc(3, 1.6, 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 0.08;
        ctx.beginPath();
        ctx.ellipse(3, 1.6, 1.2, 0.3, -0.3, 0, Math.PI * 2);
        ctx.stroke();
    },
    mori: () => {
        ctx.fillStyle = 'rgba(40, 110, 50, 0.35)';
        for (let i = 0; i < 9; i++) {
            ctx.beginPath();
            ctx.arc(i * 2 - 0.5, 4.6, 1.4, Math.PI, 0);
            ctx.fill();
        }
    },
    umi: () => {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 0.05;
        for (let i = 0; i < 14; i++) {
            const y = ((i * 0.83 - state.clock * 0.6) % 5 + 5) % 5;
            ctx.beginPath();
            ctx.arc((i * 3.7) % 16, y, 0.1 + (i % 3) * 0.06, 0, Math.PI * 2);
            ctx.stroke();
        }
    },
    hana: () => {
        for (let i = 0; i < 24; i++) {
            ctx.fillStyle = ['#ff6fb1', '#ffd23f', '#ffffff'][i % 3];
            ctx.beginPath();
            ctx.arc((i * 2.3) % 16, 5.9 + ((i * 7) % 30) / 10, 0.09, 0, Math.PI * 2);
            ctx.fill();
        }
    },
    okashi: () => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        for (let i = 0; i < 30; i++) {
            ctx.beginPath();
            ctx.arc((i * 1.7) % 16, ((i * 0.9) % 5) + 0.2, 0.12, 0, Math.PI * 2);
            ctx.fill();
        }
    },
    machi: () => {
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 25; i++) ctx.fillRect((i * 2.9) % 16, (i * 0.7) % 3.5, 0.05, 0.05);
        ctx.fillStyle = '#1c1a40';
        for (let i = 0; i < 8; i++) ctx.fillRect(i * 2.1, 5.6 - 1.2 - (i % 3) * 0.6, 1.6, 3);
        ctx.fillStyle = 'rgba(255, 210, 63, 0.7)';
        for (let i = 0; i < 8; i++) ctx.fillRect(i * 2.1 + 0.4, 4.8 - (i % 3) * 0.6, 0.25, 0.3);
    },
};

function drawStage() {
    const left = -view.ox / view.s;
    const top = -view.oy / view.s;
    const width = view.w / view.s;
    const height = view.h / view.s;
    const { stage } = state;
    const sky = ctx.createLinearGradient(0, top, 0, 5.6);
    sky.addColorStop(0, stage.sky[0]);
    sky.addColorStop(1, stage.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(left, top, width, height);
    STAGE_DECOR[stage.id]();
    ctx.fillStyle = stage.ground;
    ctx.fillRect(left, 5.6, width, height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(left, 5.6, width, ROWS[0].y - 5.6 + 0.3);
}

function drawSplat(s) {
    ctx.fillStyle = s.miss ? 'rgba(255, 62, 165, 0.7)' : PAINT;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 7; i++) {
        const a = s.seed + i * 0.9;
        const d = s.r * (1 + ((s.seed * (i + 1)) % 0.6));
        ctx.beginPath();
        ctx.arc(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, s.r * 0.22, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawWorld() {
    const { props, colors } = state.stage;
    const hidersAt = (row) => state.hiders.filter((h) => !h.hop && h.propIndex !== null && props[h.propIndex].row === row);
    for (const row of [0, 1]) {
        props.forEach((p, i) => {
            if (p.row !== row) return;
            const { y, scale } = ROWS[row];
            drawShape(p.pose, p.x, y, scale, colors[p.color], state.clock * 3 + i);
        });
        for (const h of hidersAt(row)) drawHider(h);
    }
    for (const h of state.hiders.filter((h) => h.hop || h.propIndex === null)) drawHider(h);
    for (const s of state.splats) drawSplat(s);
}

function drawOniCharacter() {
    const oni = state.oni;
    const bx = 15.2;
    const by = 2.6;
    ctx.save();
    ctx.translate(bx, by);
    ctx.fillStyle = '#f2e6c9';
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 0.3, -0.55);
        ctx.lineTo(side * 0.45, -1.05);
        ctx.lineTo(side * 0.12, -0.65);
        ctx.fill();
    }
    ctx.fillStyle = '#e8453c';
    ctx.beginPath();
    ctx.arc(0, 0, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(side * 0.25, -0.15, 0.17, 0, Math.PI * 2);
        ctx.fill();
    }
    const look = oni ? Math.atan2(oni.y - by, oni.x - bx) : Math.PI;
    ctx.fillStyle = '#111';
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(side * 0.25 + Math.cos(look) * 0.07, -0.15 + Math.sin(look) * 0.07, 0.08, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(ONI_GUN.x, ONI_GUN.y + 0.4);
    ctx.rotate(look);
    ctx.fillStyle = '#29e7ff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.roundRect(-0.1, -0.15, 0.9, 0.3, 0.1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PAINT;
    ctx.beginPath();
    ctx.arc(0.1, -0.28, 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawCrosshair(x, y, looking) {
    const r = 0.6 + (looking ? Math.sin(state.clock * 14) * 0.06 : 0);
    ctx.strokeStyle = looking ? '#ff2a2a' : 'rgba(255, 60, 60, 0.8)';
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(x + dx * r * 0.5, y + dy * r * 0.5);
        ctx.lineTo(x + dx * r * 1.35, y + dy * r * 1.35);
    }
    ctx.stroke();
}

function drawBullets() {
    ctx.fillStyle = PAINT;
    for (const b of state.bullets) {
        const k = Math.min(1, b.t / 0.2);
        ctx.beginPath();
        ctx.arc(b.from.x + (b.to.x - b.from.x) * k, b.from.y + (b.to.y - b.from.y) * k - Math.sin(Math.PI * k) * 0.6, 0.16, 0, Math.PI * 2);
        ctx.fill();
    }
}

const toScreen = (x, y) => ({ x: view.ox + x * view.s, y: view.oy + y * view.s });

function screenText(x, y, text, color, px, alpha = 1) {
    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${px}px system-ui, 'Hiragino Sans', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, px / 5);
    ctx.strokeStyle = '#000';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
}

function drawTexts() {
    const big = Math.max(20, view.s * 0.6);
    const small = Math.max(14, view.s * 0.36);
    if (state.phase === 'prep' && state.mode === 'hide') {
        const line = LYRICS[Math.floor(state.clock / LYRIC_SEC) % LYRICS.length];
        screenText(view.w / 2, toScreen(0, 1.2).y, `♪ ${line} ♪`, '#fff', small);
        screenText(view.w / 2, toScreen(0, 2.0).y, '物を タップして いどう → 色と ポーズを そろえよう', '#ffd23f', small * 0.8);
    }
    if (state.phase === 'roundEnd' && state.mode === 'oni') {
        for (const h of state.hiders.filter((h) => !h.found)) {
            const place = hiderPlace(h);
            const at = toScreen(place.x, place.y - poseOf(h.pose).h * place.scale - 0.4);
            screenText(at.x, at.y, 'ここ！', '#ffd23f', small);
        }
    }
    for (const p of state.popups) {
        const at = toScreen(p.x, p.y - p.t);
        screenText(at.x, at.y, p.text, p.color, small * 1.2 * p.size, Math.min(1, 2 * (1.4 - p.t)));
    }
    const b = state.banner;
    if (b && (b.t < 1.8 || state.phase === 'roundEnd')) {
        const pop = Math.min(1, b.t / 0.15);
        screenText(view.w / 2, toScreen(0, 3.6).y, b.text, b.color ?? '#fff', big * (0.6 + 0.4 * pop), state.phase === 'roundEnd' ? 1 : Math.min(1, (1.8 - b.t) * 3));
    }
}

function drawCurtain() {
    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#0a061e';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.restore();
    const size = Math.max(18, view.s * 0.5);
    screenText(view.w / 2, view.h * 0.42, 'おには めを つぶってね…', '#fff', size);
    screenText(view.w / 2, view.h * 0.55, `${Math.ceil(state.timer)}`, '#ffd23f', size * 1.6);
    const line = LYRICS[Math.floor(state.clock / LYRIC_SEC) % LYRICS.length];
    screenText(view.w / 2, view.h * 0.68, `♪ ${line} ♪`, '#a7d6ad', size * 0.7);
}

function drawScope() {
    const { scope } = state;
    if (!scope || state.phase !== 'search') return;
    const r = Math.min(view.w, view.h) * SCOPE.radius;
    const k = view.s * SCOPE.zoom;
    const wx = (scope.x - view.ox) / view.s;
    const wy = (scope.y - view.oy) / view.s;
    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.rect(0, 0, view.w, view.h);
    ctx.arc(scope.x, scope.y, r, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(scope.x, scope.y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.setTransform(view.dpr * k, 0, 0, view.dpr * k, view.dpr * (scope.x - wx * k), view.dpr * (scope.y - wy * k));
    drawStage();
    drawWorld();
    ctx.restore();
    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(scope.x, scope.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ff2a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(scope.x + dx * r * 0.12, scope.y + dy * r * 0.12);
        ctx.lineTo(scope.x + dx * r * 0.9, scope.y + dy * r * 0.9);
    }
    ctx.stroke();
    ctx.restore();
}

function draw() {
    ctx.setTransform(view.dpr * view.s, 0, 0, view.dpr * view.s, view.dpr * view.ox, view.dpr * view.oy);
    drawStage();
    drawWorld();
    if (state.mode === 'hide' && state.phase !== 'title') {
        drawOniCharacter();
        if (state.oni && state.phase === 'search') drawCrosshair(state.oni.x, state.oni.y, state.oni.sub === 'look');
    }
    drawBullets();
    drawScope();
    if (state.mode === 'oni' && state.phase === 'prep') drawCurtain();
    else drawTexts();
}

function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    view.s = Math.min(view.w / WORLD.width, view.h / WORLD.height);
    view.ox = (view.w - WORLD.width * view.s) / 2;
    view.oy = (view.h - WORLD.height * view.s) / 2;
}

const POSE_ICON = Object.fromEntries(
    POSES.map((p) => {
        const icons = {
            maru: '<ellipse cx="16" cy="18" rx="12" ry="10"/>',
            hoshi: '<path d="M16 3 L20 13 L30 13 L22 19 L25 29 L16 23 L7 29 L10 19 L2 13 L12 13 Z"/>',
            tako: '<ellipse cx="16" cy="12" rx="10" ry="9"/><path d="M7 18 Q5 26 3 30 M12 19 Q11 26 10 30 M16 20 V30 M20 19 Q21 26 22 30 M25 18 Q27 26 29 30" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>',
            noppo: '<rect x="11" y="2" width="10" height="28" rx="5"/><path d="M11 14 L4 7 M21 14 L28 7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
            nagai: '<rect x="1" y="12" width="30" height="10" rx="5"/>',
            kaeru: '<ellipse cx="16" cy="21" rx="14" ry="9"/><circle cx="9" cy="10" r="5"/><circle cx="23" cy="10" r="5"/>',
            neko: '<ellipse cx="16" cy="21" rx="11" ry="10"/><path d="M6 15 L8 2 L14 10 L18 10 L24 2 L26 15 Z"/>',
            roketto: '<path d="M16 1 Q24 9 22 22 L27 31 H5 L10 22 Q8 9 16 1 Z"/>',
            haato: '<path d="M16 29 C4 20 2 6 10 5 C13 5 16 8 16 11 C16 8 19 5 22 5 C30 6 28 20 16 29 Z"/>',
        };
        return [p.id, `<svg viewBox="0 0 32 32" fill="currentColor">${icons[p.id]}</svg>`];
    }),
);

const poseButtons = POSES.map((p) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pose';
    button.innerHTML = `${POSE_ICON[p.id]}${p.name}`;
    button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        changeLook({ pose: p.id });
    });
    posesEl.append(button);
    return button;
});

let swatches = [];
function renderControls() {
    if (state.mode !== 'hide' || !player()) return;
    const me = player();
    const colors = state.stage.colors;
    if (swatches.length !== colors.length || swatches.some((b, i) => b.dataset.color !== colors[i])) {
        palette.replaceChildren();
        swatches = colors.map((c, i) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'swatch';
            button.dataset.color = c;
            button.style.setProperty('--swatch', c);
            button.setAttribute('aria-label', `いろ ${i + 1}`);
            button.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                changeLook({ color: i });
            });
            palette.append(button);
            return button;
        });
    }
    swatches.forEach((b, i) => b.setAttribute('aria-pressed', String(me.color === i)));
    poseButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(me.pose === POSES[i].id)));
}

function changeLook(change) {
    const me = player();
    if (!me || me.found || (state.phase !== 'prep' && state.phase !== 'search')) return;
    if ((change.color ?? me.color) === me.color && (change.pose ?? me.pose) === me.pose) return;
    Object.assign(me, change);
    play(change.pose ? 'pose' : 'change');
    renderControls();
    playerFidget();
}

canvas.addEventListener('pointerdown', (e) => {
    const x = (e.clientX - view.ox) / view.s;
    const y = (e.clientY - view.oy) / view.s;
    if (state.mode === 'oni') {
        if (state.phase === 'search' && !state.scope && state.shots > 0) {
            canvas.setPointerCapture(e.pointerId);
            state.scope = { id: e.pointerId, lift: e.pointerType === 'touch' ? SCOPE.touchLift : 0 };
            aimScope(e);
        }
        return;
    }
    const me = player();
    if (!me || me.found || (state.phase !== 'prep' && state.phase !== 'search')) return;
    const index = propAt(state.stage.props, x, y);
    if (index === null || index === me.propIndex) return;
    if (state.hiders.some((h) => !h.player && h.propIndex === index)) {
        popup(state.stage.props[index].x, ROWS[state.stage.props[index].row].y - 2, 'もう だれか いる！', '#fff', 0.8);
        return;
    }
    const rival = state.hiders.find((h) => !h.player && h.target === index);
    if (rival) retarget(rival, index);
    moveHider(me, index);
    play('hop');
    playerFidget();
});

function aimScope(e) {
    state.scope.x = e.clientX;
    state.scope.y = e.clientY - state.scope.lift;
}

canvas.addEventListener('pointermove', (e) => {
    if (state.scope?.id === e.pointerId) aimScope(e);
});

canvas.addEventListener('pointerup', (e) => {
    const { scope } = state;
    if (scope?.id !== e.pointerId) return;
    state.scope = null;
    if (state.phase === 'search') playerShoot((scope.x - view.ox) / view.s, (scope.y - view.oy) / view.s);
});

canvas.addEventListener('pointercancel', (e) => {
    if (state.scope?.id === e.pointerId) state.scope = null;
});

const KEY_POSES = Object.fromEntries(POSES.map((p, i) => ['qwertyuio'[i], p.id]));
document.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '5') changeLook({ color: Number(e.key) - 1 });
    else if (KEY_POSES[e.key]) changeLook({ pose: KEY_POSES[e.key] });
});

for (const button of modeButtons) button.addEventListener('click', () => startGame(button.dataset.mode));

function renderSound() {
    soundButton.setAttribute('aria-pressed', String(soundOn));
}

soundButton.addEventListener('click', () => {
    soundOn = !soundOn;
    save('mecchaKamereonSound', soundOn ? 'on' : 'off');
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
    // タブ切り替えなどで間が空いたとき、戻った瞬間に制限時間が一気に減らないよう上限を設ける
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
renderHud();
renderBest();
renderSound();
requestAnimationFrame(frame);
