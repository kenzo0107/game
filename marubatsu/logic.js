export const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
];

export const other = (mark) => (mark === 'o' ? 'x' : 'o');

export function judge(board) {
    for (const line of LINES) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return { winner: board[a], line };
        }
    }
    if (board.every(Boolean)) return { winner: 'draw', line: null };
    return null;
}

const emptyCells = (board) => board.flatMap((v, i) => (v ? [] : [i]));

const pick = (cells, random) => cells[Math.floor(random() * cells.length)];

function finishingMove(board, mark) {
    return emptyCells(board).find((i) => {
        const next = board.slice();
        next[i] = mark;
        return judge(next)?.winner === mark;
    });
}

const memo = new Map();

function minimax(board, me, turn, depth) {
    const key = `${board.map((v) => v ?? '.').join('')}${me}${turn}${depth}`;
    if (memo.has(key)) return memo.get(key);
    const score = evaluate(board, me, turn, depth);
    memo.set(key, score);
    return score;
}

// 勝敗だけで評価すると、すぐ勝てる局面でも勝ちを先延ばしにする手を選んで手加減しているように見えるため、手数で差をつける
function evaluate(board, me, turn, depth) {
    const result = judge(board);
    if (result) {
        if (result.winner === 'draw') return 0;
        return result.winner === me ? 10 - depth : depth - 10;
    }
    const scores = emptyCells(board).map((i) => {
        const next = board.slice();
        next[i] = turn;
        return minimax(next, me, other(turn), depth + 1);
    });
    return turn === me ? Math.max(...scores) : Math.min(...scores);
}

function bestMoves(board, me) {
    let best = -Infinity;
    let moves = [];
    for (const i of emptyCells(board)) {
        const next = board.slice();
        next[i] = me;
        const score = minimax(next, me, other(me), 1);
        if (score > best) {
            best = score;
            moves = [i];
        } else if (score === best) {
            moves.push(i);
        }
    }
    return moves;
}

export function cpuMove(board, me, level, random = Math.random) {
    const empty = emptyCells(board);
    if (empty.length === 0) return undefined;
    if (level === 'easy') return pick(empty, random);
    if (level === 'normal') {
        const win = finishingMove(board, me);
        if (win !== undefined) return win;
        const block = finishingMove(board, other(me));
        if (block !== undefined) return block;
        if (!board[4]) return 4;
        return pick(empty, random);
    }
    return pick(bestMoves(board, me), random);
}
