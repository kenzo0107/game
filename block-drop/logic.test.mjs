import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    COLS,
    ROWS,
    TYPES,
    cellsOf,
    collides,
    createBag,
    dropDistance,
    emptyBoard,
    fallInterval,
    fullRows,
    levelFor,
    lineScore,
    lock,
    mulberry32,
    removeRows,
    spawn,
    tryMove,
    tryRotate,
} from './logic.js';

test('どの形も4マスで、出現位置で盤面と重ならない', () => {
    for (const type of TYPES) {
        const piece = spawn(type);
        assert.equal(cellsOf(piece).length, 4, type);
        assert.equal(collides(emptyBoard(), piece), false, type);
    }
});

test('どの形も4回まわすと元の形にもどる', () => {
    const board = emptyBoard();
    for (const type of TYPES) {
        let piece = { ...spawn(type), y: 5 };
        const start = cellsOf(piece).sort().join();
        for (let i = 0; i < 4; i++) piece = tryRotate(board, piece, 1);
        assert.equal(cellsOf(piece).sort().join(), start, type);
    }
});

test('袋は7つごとに全種類を1回ずつ配る', () => {
    const next = createBag(mulberry32(1));
    for (let round = 0; round < 3; round++) {
        const got = Array.from({ length: TYPES.length }, next).sort();
        assert.deepEqual(got, [...TYPES].sort());
    }
});

test('壁の外や積んだブロックには動けない', () => {
    const board = emptyBoard();
    const left = { ...spawn('O'), x: 0 };
    assert.equal(tryMove(board, left, -1, 0), null);
    assert.deepEqual(tryMove(board, left, 1, 0), { ...left, x: 1 });

    board[ROWS - 1][0] = 'T';
    const above = { ...left, y: ROWS - 3 };
    assert.equal(tryMove(board, above, 0, 1), null);
});

test('壁ぎわで回すと内側へずらして回せる', () => {
    const board = emptyBoard();
    const vertical = tryRotate(board, { ...spawn('I'), y: 5 }, 1);
    const atWall = { ...vertical, x: -cellsOf({ ...vertical, x: 0 })[0][0] };
    assert.equal(Math.min(...cellsOf(atWall).map(([x]) => x)), 0);
    const turned = tryRotate(board, atWall, 1);
    assert.ok(turned);
    assert.equal(collides(board, turned), false);
});

test('ハードドロップの距離は底か積んだブロックまで', () => {
    const board = emptyBoard();
    const piece = spawn('O');
    assert.equal(dropDistance(board, piece), ROWS - 2);
    board[ROWS - 1][piece.x] = 'I';
    assert.equal(dropDistance(board, piece), ROWS - 3);
});

test('盤面の上にはみ出して固定するとあふれになる', () => {
    const { overflow } = lock(emptyBoard(), { ...spawn('I'), rot: 1, y: -2 });
    assert.equal(overflow, true);
    const { board, overflow: ok } = lock(emptyBoard(), { ...spawn('O'), y: ROWS - 2 });
    assert.equal(ok, false);
    assert.equal(board[ROWS - 1].filter(Boolean).length, 2);
});

test('そろった行を消すと上の行が下がる', () => {
    const board = emptyBoard();
    board[ROWS - 1] = Array(COLS).fill('I');
    board[ROWS - 2][3] = 'T';
    assert.deepEqual(fullRows(board), [ROWS - 1]);
    const after = removeRows(board, [ROWS - 1]);
    assert.equal(after.length, ROWS);
    assert.equal(after[ROWS - 1][3], 'T');
    assert.deepEqual(fullRows(after), []);
});

test('同時に消す行が多いほど、レベルが高いほど点が高い', () => {
    assert.equal(lineScore(0, 0), 0);
    assert.ok(lineScore(4, 0) > lineScore(1, 0) * 4);
    assert.equal(lineScore(1, 2), lineScore(1, 0) * 3);
});

test('10行ごとにレベルが上がり、落ちる速さは下限まで速くなる', () => {
    assert.equal(levelFor(9), 0);
    assert.equal(levelFor(10), 1);
    assert.ok(fallInterval(1) < fallInterval(0));
    assert.equal(fallInterval(50), 70);
});
