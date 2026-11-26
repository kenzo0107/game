export const VIEW = { w: 320, h: 180 };
export const SCROLL = 42;
export const HOME_X = 80;
export const GROUND_Y = 162;
export const CEILING_Y = 10;
export const RESCUE_TAPS = 5;
export const MAX_LEVEL_STEP = 4;

export const THEMES = [
    {
        name: 'あさの そうげん',
        sky: ['#3a8be0', '#9fd6ff'],
        far: '#6f9fc9',
        ground: '#4caf3a',
        dirt: '#2f7a26',
        cloud: '#ffffff',
    },
    {
        name: 'ゆうやけ さばく',
        sky: ['#e8603c', '#ffc46b'],
        far: '#b8644a',
        ground: '#e0b060',
        dirt: '#b8843a',
        cloud: '#ffe2c4',
    },
    {
        name: 'ゆきの やまなみ',
        sky: ['#7aa6d6', '#e4f1ff'],
        far: '#a9bed8',
        ground: '#f4f8ff',
        dirt: '#b9c8de',
        cloud: '#ffffff',
    },
    {
        name: 'よぞらの さいごの きち',
        sky: ['#0b1234', '#2b3a78'],
        far: '#1c2550',
        ground: '#2f4a3a',
        dirt: '#1e3226',
        cloud: '#4a5590',
        stars: true,
    },
];

export function mulberry32(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const themeOf = (level) => THEMES[level % THEMES.length];

export const BASE = { x0: 50, x1: 270 };

export function stageLayout(level) {
    const step = Math.min(level, MAX_LEVEL_STEP);
    const length = 2600 + step * 250;
    const target = { x0: length - 780, x1: length - 660 };
    const runway = { x0: length - 420, x1: length - 150 };
    return { length, target, runway, base: BASE };
}

const smooth = (t) => t * t * (3 - 2 * t);

function flatness(x, zones) {
    const BLEND = 60;
    let f = 0;
    for (const z of zones) {
        if (x >= z.x0 && x <= z.x1) return 1;
        const d = x < z.x0 ? z.x0 - x : x - z.x1;
        if (d < BLEND) f = Math.max(f, smooth(1 - d / BLEND));
    }
    return f;
}

export function groundY(level, x) {
    const { target, runway } = stageLayout(level);
    const p = level * 1.7;
    const hill = Math.max(0, 16 * Math.sin(x / 110 + p) + 9 * Math.sin(x / 43 + p * 2.3) + 4);
    const flat = flatness(x, [{ x0: -400, x1: BASE.x1 }, target, runway]);
    return GROUND_Y - hill * (1 - flat);
}

export function buildStage(level) {
    const rand = mulberry32(level * 7919 + 17);
    const step = Math.min(level, MAX_LEVEL_STEP);
    const { length, target, runway, base } = stageLayout(level);
    const events = [];

    const gap = 150 - step * 18;
    for (let x = 560; x < target.x0 - 120; x += gap * (0.7 + rand() * 0.6)) {
        const kind = level >= 1 && rand() < 0.2 + step * 0.05 ? 'chaser' : 'plane';
        events.push({ type: kind, x, y: 30 + rand() * 90 });
    }
    for (let x = 520; x < target.x0 - 80; x += 260 - step * 25 + rand() * 120) {
        events.push({ type: 'gun', x });
    }
    for (const x of [target.x0 - 40, target.x1 + 40]) events.push({ type: 'gun', x });
    for (const ratio of [0.3, 0.62]) {
        events.push({ type: 'crate', x: Math.round(target.x0 * ratio), y: 20 + rand() * 30 });
    }
    events.push({ type: 'fort', x: (target.x0 + target.x1) / 2 });
    events.push({ type: 'runway', x: runway.x0 });

    return { length, target, runway, base, events: events.sort((a, b) => a.x - b.x) };
}

export function normalizeAngle(a) {
    const TAU = Math.PI * 2;
    return ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

export function levelOff(angle, rate, dt) {
    const a = normalizeAngle(angle);
    const stepSize = rate * dt;
    return Math.abs(a) <= stepSize ? 0 : a - Math.sign(a) * stepSize;
}

export const MAX_PITCH = Math.PI / 4;

export const clampPitch = (a) => Math.max(-MAX_PITCH, Math.min(MAX_PITCH, normalizeAngle(a)));

export function loopOffset(turned, start, radius) {
    const ox = radius * Math.sin(turned);
    const oy = -radius * (1 - Math.cos(turned));
    return {
        x: ox * Math.cos(start) - oy * Math.sin(start),
        y: ox * Math.sin(start) + oy * Math.cos(start),
    };
}

export function aimAt(from, to, speed) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    return { vx: (dx / d) * speed, vy: (dy / d) * speed };
}

export const hits = (a, b, r) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= r * r;

export function canLand(angle) {
    const a = normalizeAngle(angle);
    return Math.cos(a) > 0 && Math.sin(a) < 0.5 && Math.sin(a) > -0.2;
}

export const LANDING_GRAVITY = 240;
export const BOUNCE_SPEED = 40;
const BOUNCE_KEEP = 0.35;
const REST_SPEED = 12;

export function bounceStep({ y, vy }, floor, dt) {
    const fallen = { y: y + (vy + LANDING_GRAVITY * dt) * dt, vy: vy + LANDING_GRAVITY * dt };
    if (fallen.y < floor) return fallen;
    const rebound = fallen.vy * BOUNCE_KEEP;
    return { y: floor, vy: rebound < REST_SPEED ? 0 : -rebound };
}

export function bombHitsFort(bomb, fortX) {
    return Math.abs(bomb.x - fortX) <= 34;
}

export const SCORES = {
    plane: 100,
    chaser: 200,
    gun: 150,
    fort: 3000,
    landing: 1000,
    rescue: 50,
};
