export const DIRS = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
};
export const BAY_COUNT = 5;
export const MAX_BAYS = 6;
export const LOOP_SIZE = 28;
export const COLOR_COUNT = 7;
const KINDS = [
    { len: 2, cap: 4 },
    { len: 3, cap: 6 },
    { len: 4, cap: 8 },
];
const PLACE_TRIES = 4000;

export function createRng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return (s >>> 0) / 4294967296;
    };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

function shuffle(rng, list) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

export function stageConfig(stage) {
    return {
        cols: 6 + Math.min(2, Math.floor(stage / 4)),
        rows: 7 + Math.min(3, Math.floor(stage / 3)),
        busCount: Math.min(8 + stage * 2, 30),
        colors: Math.min(3 + Math.floor(stage / 2), COLOR_COUNT),
        window: stage < 3 ? 2 : 3,
        maxKind: stage < 2 ? 1 : stage < 5 ? 2 : 3,
    };
}

export function cellsOf(bus) {
    const { dx, dy } = DIRS[bus.dir];
    return Array.from({ length: bus.len }, (_, i) => ({ col: bus.col - dx * i, row: bus.row - dy * i }));
}

const inside = (grid, col, row) => col >= 0 && col < grid.cols && row >= 0 && row < grid.rows;

function occupancy(grid, buses) {
    const map = new Map();
    for (const bus of buses) for (const c of cellsOf(bus)) map.set(c.row * grid.cols + c.col, bus.id);
    return map;
}

export function exitPath(grid, buses, bus) {
    const occupied = occupancy(grid, buses.filter((b) => b !== bus));
    const { dx, dy } = DIRS[bus.dir];
    let col = bus.col + dx;
    let row = bus.row + dy;
    let free = 0;
    while (inside(grid, col, row)) {
        const blocker = occupied.get(row * grid.cols + col);
        if (blocker !== undefined) return { clear: false, free, blocker };
        free++;
        col += dx;
        row += dy;
    }
    return { clear: true, free };
}

// ランダムに並べてから解けるか探索すると盤面が大きいほど遅くなるため、置く時点で「後から置いたものほど先に出られる」ことを保証する
function placeBuses(rng, cfg) {
    const grid = { cols: cfg.cols, rows: cfg.rows };
    const placed = [];
    const kinds = KINDS.slice(0, cfg.maxKind);
    for (let t = 0; t < PLACE_TRIES && placed.length < cfg.busCount; t++) {
        const kind = pick(rng, kinds);
        const bus = {
            id: placed.length,
            col: Math.floor(rng() * cfg.cols),
            row: Math.floor(rng() * cfg.rows),
            dir: pick(rng, Object.keys(DIRS)),
            len: kind.len,
            cap: kind.cap,
        };
        const cells = cellsOf(bus);
        if (!cells.every((c) => inside(grid, c.col, c.row))) continue;
        const occupied = occupancy(grid, placed);
        if (cells.some((c) => occupied.has(c.row * grid.cols + c.col))) continue;
        if (!exitPath(grid, placed, bus).clear) continue;
        placed.push(bus);
    }
    return placed;
}

// 列全体を混ぜると、のりばの数では足りず詰む並びが生まれるため、出す順の近いバスどうしの中だけで混ぜる
function buildQueue(rng, exitOrder, window) {
    const queue = [];
    for (let i = 0; i < exitOrder.length; i += window) {
        const group = exitOrder.slice(i, i + window).flatMap((bus) => Array(bus.cap).fill(bus.color));
        queue.push(...shuffle(rng, group));
    }
    return queue;
}

export function generateStage(stage) {
    const rng = createRng(stage * 7919 + 17);
    const cfg = stageConfig(stage);
    const buses = placeBuses(rng, cfg);
    const palette = shuffle(rng, Array.from({ length: COLOR_COUNT }, (_, i) => i)).slice(0, cfg.colors);
    const exitOrder = [...buses].reverse();
    exitOrder.forEach((bus, i) => {
        bus.color = palette[i < palette.length ? i : Math.floor(rng() * palette.length)];
    });
    return {
        cols: cfg.cols,
        rows: cfg.rows,
        buses,
        queue: buildQueue(rng, exitOrder, cfg.window),
        solution: exitOrder.map((bus) => bus.id),
    };
}

export function createGame(stageData, loopSize = LOOP_SIZE) {
    const waiting = [...stageData.queue];
    return {
        cols: stageData.cols,
        rows: stageData.rows,
        buses: stageData.buses.map((bus) => ({ ...bus, where: 'lot', filled: 0, bay: -1 })),
        loop: Array.from({ length: loopSize }, () => waiting.shift() ?? null),
        waiting,
        bays: Array(BAY_COUNT).fill(null),
    };
}

export const riderCount = (game) => game.waiting.length + game.loop.filter((c) => c !== null).length;

export function addBay(game) {
    if (game.bays.length >= MAX_BAYS) return false;
    game.bays.push(null);
    return true;
}

export const lotBuses = (game) => game.buses.filter((b) => b.where === 'lot');

export function tapBus(game, id) {
    const bus = game.buses[id];
    if (!bus || bus.where !== 'lot') return { ok: false, reason: 'none' };
    const path = exitPath(game, lotBuses(game), bus);
    if (!path.clear) return { ok: false, reason: 'blocked', free: path.free, blocker: path.blocker };
    const bay = game.bays.indexOf(null);
    if (bay < 0) return { ok: false, reason: 'full' };
    game.bays[bay] = bus.id;
    bus.where = 'moving';
    bus.bay = bay;
    return { ok: true, bay, free: path.free };
}

export function arrive(game, id) {
    const bus = game.buses[id];
    if (bus.where === 'moving') bus.where = 'bay';
}

function boardingTarget(game, color) {
    let best = null;
    for (const id of game.bays) {
        const bus = id === null ? null : game.buses[id];
        if (!bus || bus.where !== 'bay' || bus.color !== color || bus.filled >= bus.cap) continue;
        if (!best || bus.filled > best.filled) best = bus;
    }
    return best;
}

export function boardSlot(game, slot) {
    const color = game.loop[slot];
    const bus = color === null ? null : boardingTarget(game, color);
    if (!bus) return null;
    game.loop[slot] = null;
    bus.filled++;
    const full = bus.filled === bus.cap;
    const bay = bus.bay;
    if (full) {
        bus.where = 'done';
        game.bays[bay] = null;
    }
    return { busId: bus.id, bay, seat: bus.filled - 1, full };
}

export function feedSlot(game, slot) {
    if (game.loop[slot] !== null || game.waiting.length === 0) return null;
    game.loop[slot] = game.waiting.shift();
    return game.loop[slot];
}

// 輪の空きが埋まるとそれ以上は誰も入れないため、待機列で数えるのは空きの数までにする
function reachableColors(game) {
    const empty = game.loop.filter((c) => c === null).length;
    return new Set([...game.loop.filter((c) => c !== null), ...game.waiting.slice(0, empty)]);
}

export function status(game) {
    if (game.buses.every((b) => b.where === 'done') && riderCount(game) === 0) return 'clear';
    if (game.bays.includes(null)) return 'play';
    if (game.buses.some((b) => b.where === 'moving')) return 'play';
    const colors = reachableColors(game);
    const canBoard = game.bays.some((id) => {
        const bus = game.buses[id];
        return bus.filled < bus.cap && colors.has(bus.color);
    });
    return canBoard ? 'play' : 'stuck';
}
