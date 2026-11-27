export const WIDTH = 100;
export const HEIGHT = 150;
export const HOLD_Y = 9;
export const LINE_Y = 22;
export const DROP_TIERS = 5;
export const DROP_COOLDOWN_MS = 450;
export const DANGER_MS = 2500;
export const LAST_TIER_BONUS = 200;

const BASE_RADIUS = 3.4;
const GROWTH = 1.27;
const GRAVITY = 260;
const RESTITUTION = 0.15;
const WALL_RESTITUTION = 0.2;
const FRICTION = 0.04;
const SUBSTEPS = 4;
const ITERATIONS = 6;
const MAX_STEP_SEC = 1 / 30;
const SETTLE_SPEED = 12;
const SPAWN_GRACE_MS = 900;
const MERGE_MARGIN = 0.4;

export const TIER_COUNT = 11;
export const radiusOf = (tier) => BASE_RADIUS * GROWTH ** tier;
export const mergeScore = (tier) => ((tier + 1) * (tier + 2)) / 2;

export function createWorld() {
    return { bodies: [], nextId: 1, score: 0, dangerMs: 0 };
}

export function clampDropX(x, tier) {
    const r = radiusOf(tier);
    return Math.min(WIDTH - r, Math.max(r, x));
}

export function addBody(world, tier, x, y, { vx = 0, vy = 0, age = 0 } = {}) {
    const body = { id: world.nextId++, tier, x, y, vx, vy, r: radiusOf(tier), angle: 0, age, speed: Infinity };
    world.bodies.push(body);
    return body;
}

export function drop(world, tier, x) {
    return addBody(world, tier, clampDropX(x, tier), HOLD_Y);
}

export function createDealer(random = Math.random) {
    // 序盤から大きいものが続くと即座に詰むため、最初の数個は小さいものに限る
    let dealt = 0;
    return () => {
        const limit = dealt < 4 ? 3 : DROP_TIERS;
        dealt++;
        return Math.floor(random() * limit);
    };
}

function resolveWalls(b) {
    if (b.x - b.r < 0) {
        b.x = b.r;
        if (b.vx < 0) b.vx = -b.vx * WALL_RESTITUTION;
    } else if (b.x + b.r > WIDTH) {
        b.x = WIDTH - b.r;
        if (b.vx > 0) b.vx = -b.vx * WALL_RESTITUTION;
    }
    if (b.y + b.r > HEIGHT) {
        b.y = HEIGHT - b.r;
        if (b.vy > 0) b.vy = -b.vy * WALL_RESTITUTION;
        b.vx *= 1 - FRICTION;
    }
}

// 押し合いの順序しだいで同じ種類どうしがわずかに離されたまま止まるため、合体だけは少し離れていても触れたとみなす
const touching = (a, b) => (b.x - a.x) ** 2 + (b.y - a.y) ** 2 < (a.r + b.r + MERGE_MARGIN) ** 2;

function resolvePair(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const min = a.r + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) return;
    const d = Math.sqrt(d2) || 1e-6;
    const nx = d2 ? dx / d : 0;
    const ny = d2 ? dy / d : 1;
    const ma = a.r * a.r;
    const mb = b.r * b.r;
    const wa = mb / (ma + mb);
    const wb = ma / (ma + mb);
    const overlap = min - d;
    a.x -= nx * overlap * wa;
    a.y -= ny * overlap * wa;
    b.x += nx * overlap * wb;
    b.y += ny * overlap * wb;

    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
        const j = -(1 + RESTITUTION) * vn;
        a.vx -= nx * j * wa;
        a.vy -= ny * j * wa;
        b.vx += nx * j * wb;
        b.vy += ny * j * wb;
        const tx = rvx - vn * nx;
        const ty = rvy - vn * ny;
        a.vx += tx * FRICTION * wa;
        a.vy += ty * FRICTION * wa;
        b.vx -= tx * FRICTION * wb;
        b.vy -= ty * FRICTION * wb;
    }
}

function substep(world, dt, merges, merged) {
    const { bodies } = world;
    for (const b of bodies) {
        b.vy += GRAVITY * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.angle += (b.vx * dt) / b.r;
    }
    for (let it = 0; it < ITERATIONS; it++) {
        for (let i = 0; i < bodies.length; i++) {
            const a = bodies[i];
            if (merged.has(a)) continue;
            for (let k = i + 1; k < bodies.length; k++) {
                const b = bodies[k];
                if (merged.has(b)) continue;
                if (a.tier === b.tier && touching(a, b)) {
                    merged.add(a).add(b);
                    merges.push({ a, b });
                    break;
                }
                resolvePair(a, b);
            }
        }
        for (const b of bodies) resolveWalls(b);
    }
}

function applyMerges(world, pairs) {
    const events = [];
    const gone = new Set();
    for (const { a, b } of pairs) {
        gone.add(a).add(b);
        const x = (a.x + b.x) / 2;
        const y = (a.y + b.y) / 2;
        const last = a.tier === TIER_COUNT - 1;
        world.score += last ? LAST_TIER_BONUS : mergeScore(a.tier + 1);
        const body = last ? null : addBody(world, a.tier + 1, x, y, { vx: (a.vx + b.vx) / 2, vy: Math.min(a.vy, b.vy, 0) });
        if (body) resolveWalls(body);
        events.push({ tier: a.tier, x, y, last, body });
    }
    world.bodies = world.bodies.filter((b) => !gone.has(b));
    return events;
}

export function isOverLine(body) {
    return body.age >= SPAWN_GRACE_MS && body.y - body.r < LINE_Y && body.speed < SETTLE_SPEED;
}

export function step(world, frameMs) {
    const ms = Math.min(frameMs, MAX_STEP_SEC * 1000);
    const dt = ms / 1000 / SUBSTEPS;
    const pairs = [];
    const merged = new Set();
    const before = world.bodies.map((b) => [b.x, b.y]);
    for (let i = 0; i < SUBSTEPS; i++) substep(world, dt, pairs, merged);
    // 積み上がった星は押し戻しで位置は止まっても重力ぶんの速度が残るため、静止の判定には実際の移動量を使う
    world.bodies.forEach((b, i) => {
        b.speed = Math.hypot(b.x - before[i][0], b.y - before[i][1]) / (ms / 1000);
        b.age += ms;
    });
    const merges = applyMerges(world, pairs);
    const danger = world.bodies.some(isOverLine);
    world.dangerMs = danger ? world.dangerMs + ms : 0;
    return { merges, over: world.dangerMs >= DANGER_MS };
}
