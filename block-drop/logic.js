export const COLS = 10;
export const ROWS = 20;
export const LINES_PER_LEVEL = 10;
export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;

export const SHAPES = {
    I: ['....', '####', '....', '....'],
    O: ['##', '##'],
    T: ['.#.', '###', '...'],
    S: ['.##', '##.', '...'],
    Z: ['##.', '.##', '...'],
    J: ['#..', '###', '...'],
    L: ['..#', '###', '...'],
};

export const TYPES = Object.keys(SHAPES);

const KICKS = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [-2, 0],
    [2, 0],
    [-1, -1],
    [1, -1],
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

// 完全ランダムだと同じ形が続いたり長く来なかったりするため、7種を1袋ずつ混ぜて配る
export function createBag(rng) {
    let bag = [];
    return () => {
        if (bag.length === 0) {
            bag = [...TYPES];
            for (let i = bag.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [bag[i], bag[j]] = [bag[j], bag[i]];
            }
        }
        return bag.pop();
    };
}

export const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

const rotateCells = (cells, size, turns) => {
    let out = cells;
    for (let i = 0; i < ((turns % 4) + 4) % 4; i++) out = out.map(([x, y]) => [size - 1 - y, x]);
    return out;
};

const baseCells = (type) =>
    SHAPES[type].flatMap((row, y) => [...row].flatMap((c, x) => (c === '#' ? [[x, y]] : [])));

export function spawn(type) {
    const size = SHAPES[type].length;
    return { type, rot: 0, x: Math.floor((COLS - size) / 2), y: type === 'I' ? -1 : 0 };
}

export function cellsOf(piece) {
    const size = SHAPES[piece.type].length;
    return rotateCells(baseCells(piece.type), size, piece.rot).map(([x, y]) => [piece.x + x, piece.y + y]);
}

// 盤面より上（y < 0）は出現直後の回転のために空きとして扱う
export const collides = (board, piece) =>
    cellsOf(piece).some(([x, y]) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x] !== null));

export function tryMove(board, piece, dx, dy) {
    const moved = { ...piece, x: piece.x + dx, y: piece.y + dy };
    return collides(board, moved) ? null : moved;
}

export function tryRotate(board, piece, dir) {
    if (piece.type === 'O') return piece;
    const turned = { ...piece, rot: (piece.rot + dir + 4) % 4 };
    for (const [dx, dy] of KICKS) {
        const kicked = { ...turned, x: turned.x + dx * dir, y: turned.y + dy };
        if (!collides(board, kicked)) return kicked;
    }
    return null;
}

export function dropDistance(board, piece) {
    let d = 0;
    while (!collides(board, { ...piece, y: piece.y + d + 1 })) d++;
    return d;
}

export function lock(board, piece) {
    const next = board.map((row) => [...row]);
    let overflow = false;
    for (const [x, y] of cellsOf(piece)) {
        if (y < 0) overflow = true;
        else next[y][x] = piece.type;
    }
    return { board: next, overflow };
}

export const fullRows = (board) => board.flatMap((row, y) => (row.every((c) => c !== null) ? [y] : []));

export function removeRows(board, rows) {
    const kept = board.filter((_, y) => !rows.includes(y));
    return [...Array.from({ length: ROWS - kept.length }, () => Array(COLS).fill(null)), ...kept];
}

const LINE_POINTS = [0, 100, 300, 500, 800];

export const lineScore = (count, level) => LINE_POINTS[count] * (level + 1);

export const levelFor = (lines) => Math.floor(lines / LINES_PER_LEVEL);

export const fallInterval = (level) => Math.max(70, Math.round(900 * 0.82 ** level));
