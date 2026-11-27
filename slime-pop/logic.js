export const COLS = 6;
export const ROWS = 12;
export const POP_SIZE = 4;
export const SPAWN_X = 2;
export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 12;
export const PAIRS_PER_LEVEL = 20;
export const ALL_CLEAR_BONUS = 2000;

const CHILD_OFFSETS = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
];

export const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

export function createDealer(rng, colorCount) {
    const pick = () => Math.floor(rng() * colorCount);
    return () => [pick(), pick()];
}

export function spawn([pivot, child]) {
    return { x: SPAWN_X, y: 0, rot: 0, pivot, child };
}

export function cellsOf(pair) {
    const [dx, dy] = CHILD_OFFSETS[pair.rot];
    return [
        { x: pair.x, y: pair.y, color: pair.pivot },
        { x: pair.x + dx, y: pair.y + dy, color: pair.child },
    ];
}

// 出現直後の子は盤面より上にいるため、y < 0 は空きとして扱う
const blocked = (board, x, y) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x] !== null);

export const collides = (board, pair) => cellsOf(pair).some(({ x, y }) => blocked(board, x, y));

export function tryMove(board, pair, dx, dy) {
    const moved = { ...pair, x: pair.x + dx, y: pair.y + dy };
    return collides(board, moved) ? null : moved;
}

export function tryRotate(board, pair, dir) {
    const turned = { ...pair, rot: (pair.rot + dir + 4) % 4 };
    if (!collides(board, turned)) return turned;
    const [dx, dy] = CHILD_OFFSETS[turned.rot];
    const kicked = { ...turned, x: turned.x - dx, y: turned.y - dy };
    if (!collides(board, kicked)) return kicked;
    // 1列幅のすき間では横にも向けられず回せなくなるため、上下をそのまま入れかえる
    const flipped = { ...pair, rot: (pair.rot + 2) % 4 };
    if (!collides(board, flipped)) return flipped;
    const [fx, fy] = CHILD_OFFSETS[flipped.rot];
    const flippedKicked = { ...flipped, x: flipped.x - fx, y: flipped.y - fy };
    return collides(board, flippedKicked) ? null : flippedKicked;
}

export function place(board, pair) {
    const next = board.map((row) => [...row]);
    for (const { x, y, color } of cellsOf(pair)) if (y >= 0) next[y][x] = color;
    return next;
}

export function applyGravity(board) {
    const next = emptyBoard();
    const moves = [];
    for (let x = 0; x < COLS; x++) {
        let floor = ROWS - 1;
        for (let y = ROWS - 1; y >= 0; y--) {
            if (board[y][x] === null) continue;
            next[floor][x] = board[y][x];
            if (floor !== y) moves.push({ x, from: y, to: floor });
            floor--;
        }
    }
    return { board: next, moves };
}

// 盤面は常に落としきった状態なので、各列の空きの一番下に下側のセルから積めば着地点になる
export function landingCells(board, pair) {
    const freeY = Array.from({ length: COLS }, (_, x) => {
        let y = ROWS - 1;
        while (y >= 0 && board[y][x] !== null) y--;
        return y;
    });
    return cellsOf(pair)
        .sort((a, b) => b.y - a.y)
        .map(({ x, color }) => ({ x, y: freeY[x]--, color }))
        .filter(({ y }) => y >= 0);
}

export function findGroups(board) {
    const seen = board.map((row) => row.map(() => false));
    const groups = [];
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const color = board[y][x];
            if (color === null || seen[y][x]) continue;
            const group = [];
            const stack = [[x, y]];
            seen[y][x] = true;
            while (stack.length > 0) {
                const [cx, cy] = stack.pop();
                group.push([cx, cy]);
                for (const [dx, dy] of CHILD_OFFSETS) {
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
                    if (seen[ny][nx] || board[ny][nx] !== color) continue;
                    seen[ny][nx] = true;
                    stack.push([nx, ny]);
                }
            }
            if (group.length >= POP_SIZE) groups.push({ color, cells: group });
        }
    }
    return groups;
}

export function removeCells(board, groups) {
    const next = board.map((row) => [...row]);
    for (const { cells } of groups) for (const [x, y] of cells) next[y][x] = null;
    return next;
}

export function popScore(groups, chain) {
    const popped = groups.reduce((n, g) => n + g.cells.length, 0);
    const chainBonus = chain <= 1 ? 0 : 2 ** (chain + 1);
    const sizeBonus = groups.reduce((n, g) => n + (g.cells.length - POP_SIZE), 0);
    const colorBonus = (new Set(groups.map((g) => g.color)).size - 1) * 3;
    return popped * 10 * Math.max(1, chainBonus + sizeBonus + colorBonus);
}

export const isEmpty = (board) => board.every((row) => row.every((c) => c === null));

export const isDead = (board) => board[0][SPAWN_X] !== null;

export const levelFor = (pairs) => Math.floor(pairs / PAIRS_PER_LEVEL);

export const fallInterval = (level) => Math.max(110, Math.round(800 * 0.86 ** level));
