import { createBgm } from './bgm.js';
import {
    DIRS,
    MAX_BAYS,
    addBay,
    arrive,
    boardSlot,
    createGame,
    feedSlot,
    generateStage,
    riderCount,
    status,
    tapBus,
} from './logic.js';

const COLORS = [
    { base: '#ef4b4b', dark: '#a82828', light: '#ff9b9b' },
    { base: '#3d8bff', dark: '#1f56b8', light: '#9cc6ff' },
    { base: '#3cc469', dark: '#1f8040', light: '#9ce8b4' },
    { base: '#ffc928', dark: '#b88a00', light: '#ffe796' },
    { base: '#a467f0', dark: '#6a37ad', light: '#d4b5ff' },
    { base: '#ff8a2b', dark: '#b8560c', light: '#ffc38f' },
    { base: '#ff6fb5', dark: '#b83a78', light: '#ffb8da' },
];
const ANGLE = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };

const WIDTH = 100;
const TILT = 0.78;
const TOP = 7;
const SIDEWALK_H = 24;
const STREET_Y = 28;
const BAY_TOP = 32;
const BAY_FRONT = 34;
const BAY_W = WIDTH / MAX_BAYS;
const BAY_BUS_W = 11;
const BAY_BUS_H = 7;
const SEAT_GAP = 5.5;
const ROAD = 12;
const RING_TOP = 70;
const LOT_X0 = ROAD;
const LOT_Y0 = RING_TOP + ROAD / 2;
const RING_LEFT = ROAD / 2;
const RING_RIGHT = WIDTH - ROAD / 2;
const TRACK_X0 = 7;
const TRACK_X1 = 93;
const LANE_TOP = 11.5;
const LANE_BOTTOM = 20;
const TRACK_R = (LANE_BOTTOM - LANE_TOP) / 2;
const TRACK_LEN = 2 * (TRACK_X1 - TRACK_X0) + 2 * Math.PI * TRACK_R;
const ENTRANCE_S = TRACK_LEN - (Math.PI * TRACK_R) / 2;
const WAIT_X = 4;
const WAIT_Y = 4;
const WAIT_GAP = 4.6;
const WAIT_SHOWN = 19;
const GATE_X = 50;
const GATE_HALF = 4;
const GATE_S = GATE_X - TRACK_X0;
const LOOP_SPEED = 13;
const ENTER_MS = 350;
const RUSH_SPEED = 3.5;
const RUSH_RAMP_MS = 600;

const RIDER_MS = 220;
const START_SPEED = 45;
const MAX_SPEED = 140;
const ACCEL = 420;
const TURN_LOOK = 2.5;
const COMBO_MS = 5000;
const SHAKE_MS = 180;
const FLOAT_MS = 900;
const END_DELAY_MS = 700;
const RESTART_GUARD_MS = 800;
const SOUND_KEY = 'gyugyu-bus:sound';
const STAGE_KEY = 'gyugyu-bus:stage';

const $ = (id) => document.getElementById(id);
const board = $('board');
const ctx = board.getContext('2d');
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
let stage = Math.max(0, Number(storage.get(STAGE_KEY, 0)) || 0);
let game = null;
let vis = new Map();
let riders = [];
let departing = [];
let particles = [];
let floats = [];
let shown = new Map();
let clock = 0;
let loopS = 0;
let rush = 0;
let waitShift = 0;
let entering = new Map();
let endTimer = null;
let endedAt = 0;
let score = 0;
let combo = 0;
let lastDepartAt = -Infinity;
let shakeUntil = 0;
let scale = 4;
let dpr = 1;
let cell = 14;
let lotY1 = 160;
let ringBottom = 164;
let worldH = 170;

function startStage() {
    game = createGame(generateStage(stage));
    vis = new Map(game.buses.map((b) => [b.id, { mode: 'lot' }]));
    shown = new Map(game.buses.map((b) => [b.id, 0]));
    riders = [];
    departing = [];
    particles = [];
    floats = [];
    loopS = 0;
    rush = 0;
    waitShift = 0;
    entering = new Map();
    endTimer = null;
    score = 0;
    combo = 0;
    lastDepartAt = -Infinity;
    layout();
    updateHud();
}

function updateHud() {
    $('stage').textContent = stage + 1;
    $('score').textContent = score;
    $('left').textContent = game ? riderCount(game) : 0;
}

const bayLength = (cap) => 7 + (cap / 2) * SEAT_GAP;
const bayX = (bay) => BAY_W * (bay + 0.5);
const bayPose = (bay, cap) => ({
    x: bayX(bay),
    y: BAY_FRONT + bayLength(cap) / 2,
    angle: 0,
    len: bayLength(cap),
    w: BAY_BUS_W,
    h: BAY_BUS_H,
});

function lotPose(bus) {
    const { dx, dy } = DIRS[bus.dir];
    const back = (bus.len - 1) / 2;
    const w = cell * 0.78;
    return {
        x: LOT_X0 + (bus.col - dx * back + 0.5) * cell,
        y: LOT_Y0 + (bus.row - dy * back + 0.5) * cell,
        angle: ANGLE[bus.dir],
        len: bus.len * cell - cell * 0.2,
        w,
        h: w * 0.6,
    };
}

function trackPoint(d) {
    const w = TRACK_X1 - TRACK_X0;
    const arc = Math.PI * TRACK_R;
    const cy = (LANE_TOP + LANE_BOTTOM) / 2;
    const t = ((d % TRACK_LEN) + TRACK_LEN) % TRACK_LEN;
    if (t < w) return { x: TRACK_X0 + t, y: LANE_BOTTOM };
    if (t < w + arc) {
        const a = Math.PI / 2 - (t - w) / TRACK_R;
        return { x: TRACK_X1 + Math.cos(a) * TRACK_R, y: cy + Math.sin(a) * TRACK_R };
    }
    if (t < 2 * w + arc) return { x: TRACK_X1 - (t - w - arc), y: LANE_TOP };
    const a = -Math.PI / 2 - (t - 2 * w - arc) / TRACK_R;
    return { x: TRACK_X0 + Math.cos(a) * TRACK_R, y: cy + Math.sin(a) * TRACK_R };
}

const slotS = (slot) => loopS + (slot * TRACK_LEN) / game.loop.length;
const waitPos = (k) => ({ x: WAIT_X + k * WAIT_GAP, y: WAIT_Y });
const passes = (from, step, point) => (((point - from) % TRACK_LEN) + TRACK_LEN) % TRACK_LEN < step;

function seatPos(len, cap, seat) {
    return { x: seat % 2 ? 2.4 : -2.4, y: -len / 2 + 7 + Math.floor(seat / 2) * SEAT_GAP };
}

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => 1 - (1 - t) ** 3;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

function exitRoute(bus) {
    const start = lotPose(bus);
    const end = bayPose(bus.bay, bus.cap);
    const tail = [{ x: end.x, y: RING_TOP }, { x: end.x, y: end.y }];
    const side = start.x < WIDTH / 2 ? RING_LEFT : RING_RIGHT;
    const routes = {
        up: [{ x: start.x, y: RING_TOP }],
        left: [{ x: RING_LEFT, y: start.y }, { x: RING_LEFT, y: RING_TOP }],
        right: [{ x: RING_RIGHT, y: start.y }, { x: RING_RIGHT, y: RING_TOP }],
        down: [{ x: start.x, y: ringBottom }, { x: side, y: ringBottom }, { x: side, y: RING_TOP }],
    };
    return makePath([start, ...routes[bus.dir], ...tail]);
}

function departRoute(bus) {
    const start = bayPose(bus.bay, bus.cap);
    return makePath([start, { x: start.x, y: STREET_Y }, { x: WIDTH + 40, y: STREET_Y }]);
}

function makePath(points) {
    let total = 0;
    const segs = [];
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        segs.push({ a, b, from: total, len });
        total += len;
    }
    return { segs, total, start: points[0] };
}

function pathPoint(path, d) {
    const dist = Math.max(0, Math.min(path.total, d));
    for (const s of path.segs) {
        if (dist <= s.from + s.len && s.len > 0) {
            const t = (dist - s.from) / s.len;
            return { x: lerp(s.a.x, s.b.x, t), y: lerp(s.a.y, s.b.y, t) };
        }
    }
    const last = path.segs[path.segs.length - 1];
    return last ? { ...last.b } : { ...path.start };
}

function poseOnPath(path, d, from, to) {
    const p = pathPoint(path, d);
    const ahead = pathPoint(path, d + TURN_LOOK);
    const behind = pathPoint(path, d - TURN_LOOK);
    const angle = Math.atan2(ahead.x - behind.x, -(ahead.y - behind.y));
    const t = to ? clamp01((d - (path.total - 25)) / 25) : 0;
    return {
        x: p.x,
        y: p.y,
        angle: Number.isFinite(angle) && (ahead.x !== behind.x || ahead.y !== behind.y) ? angle : from.angle,
        len: lerp(from.len, to?.len ?? from.len, t),
        w: lerp(from.w, to?.w ?? from.w, t),
        h: lerp(from.h, to?.h ?? from.h, t),
    };
}

function drive(v, ms) {
    v.speed = Math.min(MAX_SPEED, v.speed + (ACCEL * ms) / 1000);
    v.d += (v.speed * ms) / 1000;
    return v.d >= v.path.total;
}

function busPose(bus) {
    const v = vis.get(bus.id);
    if (v.mode === 'lot') {
        const pose = lotPose(bus);
        if (v.bump) {
            const t = (clock - v.bump.at) / v.bump.ms;
            if (t >= 1) v.bump = null;
            else {
                const { dx, dy } = DIRS[bus.dir];
                const push = Math.sin(t * Math.PI) * v.bump.dist;
                pose.x += dx * push;
                pose.y += dy * push;
            }
        }
        if (v.shakeAt !== undefined) {
            const t = (clock - v.shakeAt) / 220;
            if (t >= 1) delete v.shakeAt;
            else if (t > 0) pose.x += Math.sin(t * Math.PI * 6) * 0.9 * (1 - t);
        }
        return pose;
    }
    if (v.mode === 'drive') return poseOnPath(v.path, v.d, lotPose(bus), bayPose(bus.bay, bus.cap));
    return bayPose(bus.bay, bus.cap);
}

function updateBuses(ms) {
    for (const bus of game.buses) {
        const v = vis.get(bus.id);
        if (v.mode === 'drive' && drive(v, ms)) {
            vis.set(bus.id, { mode: 'bay' });
            arrive(game, bus.id);
            sfx.park();
        }
    }
    departing = departing.filter((d) => !drive(d, ms));
}

const pace = () => 1 + (RUSH_SPEED - 1) * ease(rush);

function updateRush(ms) {
    if (rush > 0) {
        rush = Math.min(1, rush + ms / RUSH_RAMP_MS);
        return;
    }
    if (riderCount(game) === 0 || game.buses.some((b) => b.where === 'lot')) return;
    rush = Number.EPSILON;
    showToast('ぜんぶ でた！ いそげ〜！');
    sfx.rush();
}

function loopStep(ms) {
    updateRush(ms);
    waitShift = Math.max(0, waitShift - (ms * pace()) / ENTER_MS);
    const step = (LOOP_SPEED * pace() * ms) / 1000;
    game.loop.forEach((_, slot) => {
        const from = slotS(slot);
        if (passes(from, step, GATE_S)) {
            const color = game.loop[slot];
            const result = boardSlot(game, slot);
            if (result) {
                const bus = game.buses[result.busId];
                riders.push({ ...result, color, cap: bus.cap, at: clock, ms: RIDER_MS / pace(), from: trackPoint(from) });
                sfx.board(result.seat);
                updateHud();
            }
        }
        if (passes(from, step, ENTRANCE_S)) {
            const color = feedSlot(game, slot);
            if (color !== null) {
                entering.set(slot, { at: clock, ms: ENTER_MS / pace(), from: waitPos(0) });
                waitShift = 1;
            }
        }
    });
    loopS += step;
}

function depart(bus) {
    vis.set(bus.id, { mode: 'gone' });
    const pose = bayPose(bus.bay, bus.cap);
    departing.push({ bus, path: departRoute(bus), d: 0, speed: START_SPEED, pose });
    combo = clock - lastDepartAt < COMBO_MS ? combo + 1 : 1;
    lastDepartAt = clock;
    const gain = bus.cap * 10 * combo;
    score += gain;
    updateHud();
    addFloat(pose.x, pose.y - 4, 12, `+${gain}`, '#fff6b0');
    if (combo >= 2) addFloat(pose.x, pose.y - 4, 20, `ノリノリ ×${combo}`, '#ff8ad0');
    burst(pose.x, pose.y - pose.len / 2, 8, COLORS[bus.color].light, 16);
    sfx.depart(combo);
}

function updateRiders() {
    riders = riders.filter((r) => {
        if (clock - r.at < r.ms) return true;
        shown.set(r.busId, shown.get(r.busId) + 1);
        if (r.full) depart(game.buses[r.busId]);
        return false;
    });
}

function updateEffects(ms) {
    for (const p of particles) {
        p.x += (p.vx * ms) / 1000;
        p.y += (p.vy * ms) / 1000;
        p.z += (p.vz * ms) / 1000;
        p.vz -= (90 * ms) / 1000;
        p.life -= ms / (p.long ? 1600 : 700);
    }
    particles = particles.filter((p) => p.life > 0 && p.z > -2);
    floats = floats.filter((f) => clock - f.at < FLOAT_MS);
}

function burst(x, y, z, color, count, long = false) {
    for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 10 + Math.random() * 25;
        particles.push({
            x,
            y,
            z,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            vz: 20 + Math.random() * 40,
            life: 1,
            long,
            color: Array.isArray(color) ? color[i % color.length] : color,
        });
    }
}

function addFloat(x, y, z, text, color) {
    floats.push({ x, y, z, text, color, at: clock });
}

function checkEnd() {
    if (endTimer !== null || riders.length > 0) return;
    const s = status(game);
    if (s === 'play') return;
    endTimer = clock + END_DELAY_MS;
    phase = s === 'clear' ? 'clearing' : 'stucking';
    if (s === 'clear') {
        const colors = COLORS.map((c) => c.base);
        for (let i = 0; i < 5; i++) burst(10 + i * 20, 40, 10, colors, 24, true);
        sfx.clear();
    }
}

function finish() {
    endedAt = performance.now();
    bgm?.stop();
    if (phase === 'clearing') {
        phase = 'clear';
        stage++;
        storage.set(STAGE_KEY, stage);
        showOverlay('クリア！', `スコア <b>${score}</b><br>つぎは <b>STAGE ${stage + 1}</b>`, 'つぎへ');
    } else {
        phase = 'over';
        sfx.over();
        showOverlay(
            'ぎゅうぎゅう…',
            `のりばが いっぱいで<br>だれも のれなくなっちゃった。<br><small>のりばを あけておく じゅんばんを かんがえよう</small>`,
            'もういちど',
        );
    }
}

function update(ms) {
    clock += ms;
    updateBuses(ms);
    loopStep(ms);
    updateRiders();
    updateEffects(ms);
    if (phase === 'play') checkEnd();
    if (endTimer !== null && clock >= endTimer && departing.length === 0) finish();
}

const project = (x, y, z = 0) => ({ x, y: y * TILT - z });

function footprint(pose) {
    const f = { x: Math.sin(pose.angle), y: -Math.cos(pose.angle) };
    const r = { x: Math.cos(pose.angle), y: Math.sin(pose.angle) };
    const at = (sf, sr) => ({
        x: pose.x + f.x * sf * (pose.len / 2) + r.x * sr * (pose.w / 2),
        y: pose.y + f.y * sf * (pose.len / 2) + r.y * sr * (pose.w / 2),
    });
    return [at(1, -1), at(1, 1), at(-1, 1), at(-1, -1)];
}

function inside(poly, p) {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i];
        const b = poly[j];
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
}

function busAt(px, py) {
    const candidates = game.buses
        .filter((b) => b.where === 'lot')
        .map((b) => ({ bus: b, pose: busPose(b) }))
        .sort((a, b) => b.pose.y - a.pose.y);
    for (const { bus, pose } of candidates) {
        const ground = footprint(pose);
        const roof = ground.map((c) => project(c.x, c.y, pose.h));
        const base = ground.map((c) => project(c.x, c.y, 0));
        if (inside(roof, { x: px, y: py }) || inside(base, { x: px, y: py })) return bus;
    }
    return null;
}

function onTap(px, py) {
    if (phase !== 'play') return;
    const groundY = py / TILT;
    if (game.bays.length < MAX_BAYS && groundY > BAY_TOP && groundY < RING_TOP - ROAD / 2 && px > bayX(MAX_BAYS - 1) - BAY_W / 2) {
        addBay(game);
        sfx.unlock();
        addFloat(bayX(MAX_BAYS - 1), 40, 6, 'のりば +1', '#fff6b0');
        return;
    }
    const bus = busAt(px, py);
    if (!bus) return;
    const result = tapBus(game, bus.id);
    const v = vis.get(bus.id);
    if (result.ok) {
        vis.set(bus.id, { mode: 'drive', path: exitRoute(bus), d: 0, speed: START_SPEED });
        sfx.horn();
        return;
    }
    if (result.reason === 'blocked') {
        const dist = result.free * cell + cell * 0.22;
        v.bump = { at: clock, ms: 160 + dist * 14, dist };
        vis.get(result.blocker).shakeAt = clock + v.bump.ms / 2;
        shakeUntil = clock + v.bump.ms / 2 + SHAKE_MS;
        sfx.bump(v.bump.ms / 2000);
    } else if (result.reason === 'full') {
        v.bump = { at: clock, ms: 200, dist: cell * 0.15 };
        showToast(game.bays.length < MAX_BAYS ? 'のりばが いっぱい！ ＋で ふやせるよ' : 'のりばが いっぱい！');
        sfx.bump(0);
    }
}

function fitCanvas(canvas, w, h) {
    dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
}

function layout() {
    if (!game) return;
    cell = (WIDTH - ROAD * 2) / game.cols;
    lotY1 = LOT_Y0 + game.rows * cell;
    ringBottom = lotY1 + ROAD / 2;
    worldH = lotY1 + ROAD + 1;
    const area = $('play').getBoundingClientRect();
    const h = TOP + worldH * TILT;
    scale = Math.max(1, Math.min((area.width - 16) / WIDTH, (area.height - 8) / h, 7));
    fitCanvas(board, WIDTH * scale, h * scale);
}

function shake() {
    if (clock >= shakeUntil) return { x: 0, y: 0 };
    const k = (shakeUntil - clock) / SHAKE_MS;
    return { x: (Math.random() - 0.5) * 1.2 * k, y: (Math.random() - 0.5) * 1.2 * k };
}

let offset = { x: 0, y: 0 };

function screenSpace() {
    const s = dpr * scale;
    ctx.setTransform(s, 0, 0, s, offset.x * s, (TOP + offset.y) * s);
}

function plane(z) {
    const s = dpr * scale;
    ctx.setTransform(s, 0, 0, s * TILT, offset.x * s, (TOP + offset.y - z) * s);
}

function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
}

function quad(points) {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
}

function faceQuad(g1, g2, u0, u1, z0, z1) {
    const at = (u, z) => project(lerp(g1.x, g2.x, u), lerp(g1.y, g2.y, u), z);
    return [at(u0, z0), at(u1, z0), at(u1, z1), at(u0, z1)];
}

function drawBus(pose, color, { cap, filled = 0, arrow = false, alpha = 1 }) {
    const col = COLORS[color];
    const { h } = pose;
    ctx.globalAlpha = alpha;

    plane(0);
    ctx.save();
    ctx.translate(pose.x + 0.8, pose.y + 1.4);
    ctx.rotate(pose.angle);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    roundRect(ctx, -pose.w / 2, -pose.len / 2, pose.w, pose.len, pose.w * 0.25);
    ctx.fill();
    ctx.restore();

    screenSpace();
    const c = footprint(pose);
    const f = { x: Math.sin(pose.angle), y: -Math.cos(pose.angle) };
    const r = { x: Math.cos(pose.angle), y: Math.sin(pose.angle) };
    const faces = [
        { a: c[0], b: c[1], n: f, kind: 'front' },
        { a: c[1], b: c[2], n: r, kind: 'side' },
        { a: c[2], b: c[3], n: { x: -f.x, y: -f.y }, kind: 'back' },
        { a: c[3], b: c[0], n: { x: -r.x, y: -r.y }, kind: 'side' },
    ];
    for (const face of faces) {
        if (face.n.y <= 0.02) continue;
        const shade = 0.75 + face.n.x * 0.15;
        quad(faceQuad(face.a, face.b, 0, 1, 0, h));
        ctx.fillStyle = col.dark;
        ctx.fill();
        ctx.fillStyle = `rgba(0, 0, 0, ${(1 - shade) * 0.6})`;
        ctx.fill();
        if (face.kind === 'side') {
            quad(faceQuad(face.a, face.b, 0.08, 0.92, h * 0.45, h * 0.85));
            ctx.fillStyle = '#26323e';
            ctx.fill();
            const panes = cap / 2;
            ctx.strokeStyle = col.dark;
            ctx.lineWidth = 0.35;
            for (let i = 1; i < panes; i++) {
                const u = 0.08 + (0.84 * i) / panes;
                const p = faceQuad(face.a, face.b, u, u, h * 0.45, h * 0.85);
                ctx.beginPath();
                ctx.moveTo(p[0].x, p[0].y);
                ctx.lineTo(p[3].x, p[3].y);
                ctx.stroke();
            }
            quad(faceQuad(face.a, face.b, 0.08, 0.92, h * 0.74, h * 0.85));
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.fill();
            ctx.fillStyle = '#1d1d22';
            for (const u of [0.2, 0.8]) {
                const p = project(lerp(face.a.x, face.b.x, u), lerp(face.a.y, face.b.y, u), h * 0.1);
                ctx.beginPath();
                ctx.ellipse(p.x, p.y, h * 0.28, h * 0.24, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (face.kind === 'front') {
            quad(faceQuad(face.a, face.b, 0.12, 0.88, h * 0.42, h * 0.88));
            ctx.fillStyle = '#bfe7ff';
            ctx.fill();
            ctx.fillStyle = '#fff6b8';
            for (const u of [0.18, 0.82]) {
                const p = project(lerp(face.a.x, face.b.x, u), lerp(face.a.y, face.b.y, u), h * 0.22);
                ctx.beginPath();
                ctx.arc(p.x, p.y, h * 0.12, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            quad(faceQuad(face.a, face.b, 0.25, 0.75, h * 0.55, h * 0.85));
            ctx.fillStyle = '#26323e';
            ctx.fill();
            ctx.fillStyle = '#ff5a5a';
            for (const u of [0.15, 0.85]) {
                const p = project(lerp(face.a.x, face.b.x, u), lerp(face.a.y, face.b.y, u), h * 0.25);
                ctx.fillRect(p.x - h * 0.1, p.y - h * 0.08, h * 0.2, h * 0.16);
            }
        }
    }

    plane(h);
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.angle);
    const { len: l, w } = pose;
    ctx.fillStyle = col.base;
    roundRect(ctx, -w / 2, -l / 2, w, l, w * 0.2);
    ctx.fill();
    ctx.fillStyle = col.light;
    ctx.globalAlpha = alpha * 0.45;
    roundRect(ctx, -w / 2 + w * 0.1, -l / 2 + w * 0.12, w * 0.8, w * 0.2, w * 0.08);
    ctx.fill();
    ctx.globalAlpha = alpha;
    if (arrow) {
        const s = Math.min(w * 0.32, l * 0.2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.beginPath();
        ctx.moveTo(0, -s * 1.1);
        ctx.lineTo(s, 0);
        ctx.lineTo(s * 0.38, 0);
        ctx.lineTo(s * 0.38, s);
        ctx.lineTo(-s * 0.38, s);
        ctx.lineTo(-s * 0.38, 0);
        ctx.lineTo(-s, 0);
        ctx.closePath();
        ctx.fill();
    } else {
        for (let seat = 0; seat < cap; seat++) {
            const p = seatPos(l, cap, seat);
            const sx = p.x * (w / BAY_BUS_W);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
            roundRect(ctx, sx - 2, p.y - 2, 4, 4, 1);
            ctx.fill();
            if (seat < filled) {
                ctx.fillStyle = '#ffe0c2';
                ctx.beginPath();
                ctx.arc(sx, p.y, 1.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = col.dark;
                ctx.beginPath();
                ctx.arc(sx, p.y - 0.3, 1.55, Math.PI, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
}

const SKIN = '#ffd9b8';
const PANTS = '#3b4260';

function limb(x0, y0, x1, y1, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
}

function drawPassenger(x, y, color, { size = 1, lift = 0, phase = 0, facing = 1, pose = 'walk' } = {}) {
    const col = COLORS[color];
    screenSpace();
    const p = project(x, y, 0);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 1.6 * size, 0.6 * size, 0, 0, Math.PI * 2);
    ctx.fill();

    const swing = pose === 'stand' ? 0 : Math.sin(phase);
    const bob = pose === 'walk' ? Math.abs(Math.cos(phase)) * 0.35 : 0;
    ctx.save();
    ctx.translate(p.x, p.y - lift - bob);
    ctx.scale(size * facing, size);

    const hipY = -2.9;
    const step = swing * 1.1;
    const back = col.dark;
    limb(-0.3, hipY, -0.3 - step, -0.35, 1.05, PANTS);
    limb(0.3, hipY, 0.3 + step, -0.35, 1.05, PANTS);
    ctx.fillStyle = '#2a2a33';
    for (const fx of [-0.3 - step, 0.3 + step]) {
        ctx.beginPath();
        ctx.ellipse(fx + 0.35, -0.25, 0.75, 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    const shoulderY = -5.4;
    const armBack = pose === 'jump' ? [-1.9, -8.4] : [-0.2 + swing * 1.3, -3.1];
    limb(-0.2, shoulderY, armBack[0], armBack[1], 0.85, back);

    ctx.fillStyle = col.base;
    roundRect(ctx, -1.35, -6.1, 2.7, 3.6, [1.2, 1.2, 0.5, 0.5]);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    roundRect(ctx, -0.9, -5.8, 0.7, 2.6, 0.35);
    ctx.fill();

    let hand;
    if (pose === 'wave') hand = [1.4 + Math.sin(clock / 90) * 0.5, -8.6];
    else if (pose === 'jump') hand = [1.9, -8.4];
    else hand = [0.2 - swing * 1.3, -3.1];
    limb(0.2, shoulderY, hand[0], hand[1], 0.85, col.base);
    ctx.fillStyle = SKIN;
    for (const [hx, hy] of [hand, armBack]) {
        ctx.beginPath();
        ctx.arc(hx, hy, 0.45, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(0.15, -7.4, 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = back;
    ctx.beginPath();
    ctx.arc(-0.05, -7.65, 1.42, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-0.9, -7.2, 0.6, 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a1838';
    ctx.beginPath();
    ctx.arc(0.85, -7.25, 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 120, 140, 0.45)';
    ctx.beginPath();
    ctx.arc(0.75, -6.75, 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawGround() {
    plane(0);
    ctx.fillStyle = '#86b86e';
    ctx.fillRect(-4, -12, WIDTH + 8, worldH + 20);

    ctx.fillStyle = '#e2dac3';
    ctx.fillRect(0, 0, WIDTH, SIDEWALK_H);
    ctx.strokeStyle = 'rgba(150, 130, 100, 0.25)';
    ctx.lineWidth = 0.3;
    for (let x = 4; x < WIDTH; x += 4) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, SIDEWALK_H);
        ctx.stroke();
    }

    ctx.fillStyle = '#4a545e';
    ctx.fillRect(0, SIDEWALK_H, WIDTH, BAY_TOP - SIDEWALK_H);
    ctx.fillStyle = '#f4f1e6';
    for (let x = 2; x < WIDTH; x += 8) ctx.fillRect(x, STREET_Y - 0.3, 4, 0.6);

    ctx.fillStyle = '#56616b';
    ctx.fillRect(0, BAY_TOP, WIDTH, RING_TOP - ROAD / 2 - BAY_TOP);
    const used = game.bays.filter((b) => b !== null).length;
    for (let i = 0; i < MAX_BAYS; i++) {
        const x = BAY_W * i;
        if (i >= game.bays.length) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.fillRect(x + 1, BAY_TOP + 1, BAY_W - 2, RING_TOP - ROAD / 2 - BAY_TOP - 2);
            continue;
        }
        if (game.bays[i] === null && used >= game.bays.length - 1) {
            ctx.fillStyle = `rgba(255, 70, 70, ${0.25 + 0.15 * Math.sin(clock / 120)})`;
            ctx.fillRect(x + 1, BAY_TOP + 1, BAY_W - 2, RING_TOP - ROAD / 2 - BAY_TOP - 2);
        }
    }
    ctx.strokeStyle = '#f4f1e6';
    ctx.lineWidth = 0.6;
    for (let i = 0; i <= MAX_BAYS; i++) {
        ctx.beginPath();
        ctx.moveTo(BAY_W * i, BAY_TOP);
        ctx.lineTo(BAY_W * i, RING_TOP - ROAD / 2 - 1);
        ctx.stroke();
    }

    ctx.fillStyle = '#4a545e';
    ctx.fillRect(0, RING_TOP - ROAD / 2, WIDTH, ROAD);
    ctx.fillRect(0, RING_TOP, ROAD, ringBottom - RING_TOP + ROAD / 2);
    ctx.fillRect(WIDTH - ROAD, RING_TOP, ROAD, ringBottom - RING_TOP + ROAD / 2);
    ctx.fillRect(0, lotY1, WIDTH, ROAD);
    ctx.strokeStyle = '#ffcf3f';
    ctx.lineWidth = 0.6;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(RING_LEFT, RING_TOP, RING_RIGHT - RING_LEFT, ringBottom - RING_TOP);
    ctx.setLineDash([]);

    ctx.fillStyle = '#6b7680';
    ctx.fillRect(LOT_X0, LOT_Y0, WIDTH - ROAD * 2, lotY1 - LOT_Y0);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 0.3;
    for (let i = 0; i <= game.cols; i++) {
        ctx.beginPath();
        ctx.moveTo(LOT_X0 + i * cell, LOT_Y0);
        ctx.lineTo(LOT_X0 + i * cell, lotY1);
        ctx.stroke();
    }
    for (let i = 0; i <= game.rows; i++) {
        ctx.beginPath();
        ctx.moveTo(LOT_X0, LOT_Y0 + i * cell);
        ctx.lineTo(WIDTH - ROAD, LOT_Y0 + i * cell);
        ctx.stroke();
    }

    screenSpace();
    ctx.font = 'bold 3.6px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < MAX_BAYS; i++) {
        const p = project(bayX(i), RING_TOP - ROAD / 2 - 3);
        if (i < game.bays.length) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.fillText(String(i + 1), p.x, p.y);
        }
    }
    if (game.bays.length < MAX_BAYS) {
        const p = project(bayX(MAX_BAYS - 1), (BAY_TOP + RING_TOP - ROAD / 2) / 2);
        const pulse = 1 + Math.sin(clock / 250) * 0.06;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = '#ffcf3f';
        ctx.beginPath();
        ctx.arc(0, -2, 4.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2b2410';
        ctx.font = 'bold 7px system-ui, sans-serif';
        ctx.fillText('+', 0, -1.6);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 3px system-ui, sans-serif';
        ctx.fillText('のりば', 0, 5);
        ctx.restore();
    }
}

function wanted() {
    const colors = new Set();
    for (const id of game.bays) {
        const bus = id === null ? null : game.buses[id];
        if (bus && bus.where === 'bay' && bus.filled < bus.cap) colors.add(bus.color);
    }
    return colors;
}

function drawTrack() {
    plane(0);
    ctx.strokeStyle = '#c9b48a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(TRACK_X0 - TRACK_R, LANE_TOP, TRACK_X1 - TRACK_X0 + TRACK_R * 2, LANE_BOTTOM - LANE_TOP, TRACK_R);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    const chevrons = 14;
    for (let i = 0; i < chevrons; i++) {
        const d = (i * TRACK_LEN) / chevrons + (loopS % (TRACK_LEN / chevrons));
        const p = trackPoint(d);
        const q = trackPoint(d + 1);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(q.y - p.y, q.x - p.x));
        ctx.beginPath();
        ctx.moveTo(1.2, 0);
        ctx.lineTo(-0.8, -1.2);
        ctx.lineTo(-0.8, 1.2);
        ctx.fill();
        ctx.restore();
    }

    screenSpace();
    const ropeY = (WAIT_Y + LANE_TOP - 2.6) / 2 + 1.3;
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 1; x <= WIDTH - 1; x += 12) {
        const p = project(x, ropeY, 3);
        const n = project(Math.min(x + 12, WIDTH - 1), ropeY, 3);
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo((p.x + n.x) / 2, p.y + 1, n.x, n.y);
    }
    ctx.stroke();
    ctx.fillStyle = '#d8c070';
    for (let x = 1; x <= WIDTH - 1; x += 12) {
        const p = project(x, ropeY);
        ctx.fillRect(p.x - 0.4, p.y - 3.4, 0.8, 3.4);
    }
}

const GATE_FLARE = 11;
const GATE_NARROW = 1.5;
const GATE_WIDE = 3.4;
const FENCE_H = 2.6;

function fenceLine(side) {
    const y = (gap) => LANE_BOTTOM + side * gap;
    return [
        { x: GATE_X - GATE_FLARE, y: y(GATE_WIDE) },
        { x: GATE_X - GATE_HALF, y: y(GATE_NARROW) },
        { x: GATE_X + GATE_HALF, y: y(GATE_NARROW) },
        { x: GATE_X + GATE_FLARE, y: y(GATE_WIDE) },
    ];
}

function drawFence(side) {
    screenSpace();
    const line = fenceLine(side);
    ctx.strokeStyle = '#2f6fd6';
    ctx.lineCap = 'round';
    for (const [z, w] of [[FENCE_H, 0.9], [FENCE_H * 0.5, 0.5]]) {
        ctx.lineWidth = w;
        ctx.beginPath();
        line.forEach((p, i) => {
            const q = project(p.x, p.y, z);
            i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
        });
        ctx.stroke();
    }
    ctx.lineWidth = 0.6;
    for (let i = 0; i < line.length - 1; i++) {
        for (let t = 0; t < 1; t += 0.5) {
            const x = lerp(line[i].x, line[i + 1].x, t);
            const y = lerp(line[i].y, line[i + 1].y, t);
            const a = project(x, y, 0);
            const b = project(x, y, FENCE_H);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
    }
}

function drawGateBack() {
    plane(0);
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath();
    [...fenceLine(-1), ...fenceLine(1).reverse()].forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.fill();
    drawFence(-1);
}

function drawGateFront() {
    drawFence(1);
    screenSpace();
    const p = project(GATE_X, LANE_BOTTOM + GATE_NARROW, FENCE_H);
    ctx.fillStyle = '#2f6fd6';
    roundRect(ctx, p.x - 7, p.y - 0.5, 14, 4, 1.2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 2.8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('のりぐち ▼', p.x, p.y + 1.5);
}

function drawRiders() {
    const want = wanted();
    const people = [];
    const shown = Math.min(game.waiting.length, WAIT_SHOWN);
    for (let k = 0; k < shown; k++) {
        const a = waitPos(k + waitShift);
        const moving = waitShift > 0;
        people.push({
            x: a.x,
            y: a.y,
            color: game.waiting[k],
            opts: { facing: -1, pose: moving ? 'walk' : 'stand', phase: (k + waitShift) * 2.4, lift: moving ? 0 : Math.max(0, Math.sin(clock / 400 + k)) * 0.15 },
        });
    }
    game.loop.forEach((color, slot) => {
        if (color === null) return;
        const s = slotS(slot);
        let p = trackPoint(s);
        const next = trackPoint(s + 0.6);
        let facing = next.x >= p.x ? 1 : -1;
        const enter = entering.get(slot);
        if (enter) {
            const t = (clock - enter.at) / enter.ms;
            if (t >= 1) entering.delete(slot);
            else {
                p = { x: lerp(enter.from.x, p.x, ease(t)), y: lerp(enter.from.y, p.y, ease(t)) };
                facing = -1;
            }
        }
        const eager = want.has(color);
        people.push({ x: p.x, y: p.y, color, opts: { phase: s * 1.1, facing, pose: eager ? 'wave' : 'walk', size: eager ? 1.08 : 1 } });
    });
    people.sort((a, b) => a.y - b.y);
    for (const p of people) drawPassenger(p.x, p.y, p.color, p.opts);
    if (game.waiting.length > WAIT_SHOWN) {
        screenSpace();
        const p = project(waitPos(WAIT_SHOWN).x + 1, WAIT_Y);
        ctx.font = 'bold 3.4px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#5a4a2a';
        ctx.fillText(`+${game.waiting.length - WAIT_SHOWN}`, p.x, p.y - 2.5);
    }
}

function draw() {
    if (!game) return;
    offset = shake();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, board.width, board.height);
    drawGround();
    drawTrack();
    drawGateBack();
    drawRiders();
    drawGateFront();

    const items = [];
    for (const bus of game.buses) {
        const v = vis.get(bus.id);
        if (v.mode === 'gone') continue;
        const pose = busPose(bus);
        const opts = v.mode === 'bay' ? { cap: bus.cap, filled: shown.get(bus.id) } : { cap: bus.cap, arrow: true };
        items.push({ pose, color: bus.color, opts });
    }
    for (const d of departing) {
        const pose = poseOnPath(d.path, d.d, d.pose, null);
        items.push({ pose, color: d.bus.color, opts: { cap: d.bus.cap, filled: d.bus.cap } });
    }
    items.sort((a, b) => a.pose.y + a.pose.len * 0.3 - (b.pose.y + b.pose.len * 0.3));
    for (const it of items) drawBus(it.pose, it.color, it.opts);

    for (const r of riders) {
        const t = ease(clamp01((clock - r.at) / r.ms));
        const pose = bayPose(r.bay, r.cap);
        const seat = seatPos(pose.len, r.cap, r.seat);
        const x = lerp(r.from.x, pose.x + seat.x * (pose.w / BAY_BUS_W), t);
        const y = lerp(r.from.y, pose.y + seat.y, t);
        drawPassenger(x, y, r.color, { size: 1.1 - t * 0.3, lift: Math.sin(t * Math.PI) * 6 + t * BAY_BUS_H, pose: 'jump', facing: x >= r.from.x ? 1 : -1 });
    }

    screenSpace();
    for (const p of particles) {
        const s = project(p.x, p.y, p.z);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        if (p.long) ctx.fillRect(s.x - 0.8, s.y - 0.5, 1.6, 1);
        else {
            ctx.beginPath();
            ctx.arc(s.x, s.y, 1.1 * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of floats) {
        const t = (clock - f.at) / FLOAT_MS;
        const p = project(f.x, f.y, f.z + t * 8);
        ctx.globalAlpha = 1 - t * t;
        ctx.font = `900 ${f.text.length > 5 ? 4.2 : 5}px system-ui, sans-serif`;
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#2b2410';
        ctx.strokeText(f.text, p.x, p.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
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

const sfx = {
    horn: () => {
        for (const d of [0, 0.13]) {
            beep(466, 0.1, 'square', 0.05, d);
            beep(587, 0.1, 'square', 0.04, d);
        }
    },
    bump: (delay) => {
        beep(140, 0.18, 'sawtooth', 0.08, delay, 0.5);
        beep(90, 0.12, 'square', 0.05, delay);
    },
    rush: () => [784, 988, 1175, 1568].forEach((f, i) => beep(f, 0.1, 'square', 0.04, i * 0.05)),
    park: () => beep(880, 0.06, 'triangle', 0.05),
    unlock: () => [660, 880, 1175].forEach((f, i) => beep(f, 0.12, 'triangle', 0.07, i * 0.06)),
    board: (seat) => beep(660 * 2 ** (seat / 12), 0.07, 'sine', 0.07, 0, 1.3),
    depart: (n) => {
        const up = 2 ** (Math.min(n - 1, 7) / 12);
        [523, 659, 784].forEach((f, i) => beep(f * up, 0.14, 'triangle', 0.07, i * 0.06));
    },
    clear: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => beep(f, 0.22, 'triangle', 0.08, i * 0.1)),
    over: () => [392, 330, 262, 196].forEach((f, i) => beep(f, 0.3, 'triangle', 0.08, i * 0.2)),
};

function setSound(on) {
    soundOn = on;
    storage.set(SOUND_KEY, on ? '1' : '0');
    $('sound').setAttribute('aria-pressed', String(on));
    if (master) master.gain.value = on ? 1 : 0;
}

board.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const rect = board.getBoundingClientRect();
    onTap((e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale - TOP);
});

addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' || e.code === 'Escape') return togglePause();
    if ((e.code === 'Enter' || e.code === 'Space') && !overlay.hidden) {
        e.preventDefault();
        if ((phase === 'over' || phase === 'clear') && performance.now() - endedAt < RESTART_GUARD_MS) return;
        phase === 'pause' ? resume() : $('start').click();
    }
});
addEventListener('contextmenu', (e) => e.preventDefault());

$('sound').addEventListener('click', () => {
    ensureAudio();
    setSound(!soundOn);
});
$('pause').addEventListener('click', () => togglePause());
$('retry').addEventListener('click', () => {
    if (phase !== 'play' && phase !== 'pause') return;
    startStage();
    resume();
});

function togglePause() {
    if (phase === 'play') {
        phase = 'pause';
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
    if (phase !== 'pause') startStage();
    resume();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden && phase === 'play') togglePause();
});

let last = performance.now();

function frame(now) {
    const ms = Math.min(now - last, 50);
    last = now;
    if (phase === 'play' || phase === 'clearing' || phase === 'stucking') update(ms);
    draw();
    requestAnimationFrame(frame);
}

startStage();
setSound(soundOn);
addEventListener('resize', layout);
requestAnimationFrame(frame);
