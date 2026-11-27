import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    COLS,
    ROWS,
    SPAWN_X,
    applyGravity,
    cellsOf,
    collides,
    createDealer,
    emptyBoard,
    fallInterval,
    findGroups,
    isDead,
    isEmpty,
    landingCells,
    levelFor,
    place,
    popScore,
    removeCells,
    spawn,
    tryMove,
    tryRotate,
} from './logic.js';

const R = 0;
const G = 1;
const B = 2;

function boardFrom(...rowsFromBottom) {
    const board = emptyBoard();
    rowsFromBottom.forEach((row, i) => {
        [...row].forEach((c, x) => {
            if (c !== '.') board[ROWS - 1 - i][x] = Number(c);
        });
    });
    return board;
}

test('出現したペアは盤面と重ならず、子は軸の上にいる', () => {
    const pair = spawn([R, G]);
    assert.equal(collides(emptyBoard(), pair), false);
    assert.deepEqual(cellsOf(pair), [
        { x: SPAWN_X, y: 0, color: R },
        { x: SPAWN_X, y: -1, color: G },
    ]);
});

test('4回まわすと元の向きにもどる', () => {
    let pair = { ...spawn([R, G]), y: 5 };
    for (let i = 0; i < 4; i++) pair = tryRotate(emptyBoard(), pair, 1);
    assert.deepEqual(pair, { ...spawn([R, G]), y: 5 });
});

test('右の壁ぎわで右へまわすと、軸が左へずれて横向きになる', () => {
    const pair = { ...spawn([R, G]), x: COLS - 1, y: 5 };
    const turned = tryRotate(emptyBoard(), pair, 1);
    assert.equal(turned.rot, 1);
    assert.equal(turned.x, COLS - 2);
});

test('床の上で子を下へまわすと、軸が1つ上がる', () => {
    const pair = { ...spawn([R, G]), rot: 1, y: ROWS - 1 };
    const turned = tryRotate(emptyBoard(), pair, 1);
    assert.equal(turned.rot, 2);
    assert.equal(turned.y, ROWS - 2);
});

test('左右がふさがった1列のすき間では、上下を入れかえる', () => {
    const board = boardFrom('11.111', '11.111', '11.111', '11.111');
    const pair = { ...spawn([R, G]), y: ROWS - 2 };
    const turned = tryRotate(board, pair, 1);
    assert.equal(turned.rot, 2);
    assert.equal(collides(board, turned), false);
    assert.deepEqual(
        cellsOf(turned).map(({ x, y, color }) => [x, y, color]),
        [
            [2, ROWS - 2, R],
            [2, ROWS - 1, G],
        ],
    );
});

test('壁や他のスライムがあると動けない', () => {
    const pair = { ...spawn([R, G]), x: 0, y: 5 };
    assert.equal(tryMove(emptyBoard(), pair, -1, 0), null);
    const board = boardFrom('1.....');
    assert.equal(tryMove(board, { ...pair, y: ROWS - 2 }, 0, 1), null);
});

test('横向きで置くと、浮いた方は下まで落ちる', () => {
    const board = boardFrom('..1...');
    const pair = { ...spawn([R, G]), rot: 1, y: ROWS - 2 };
    const { board: settled, moves } = applyGravity(place(board, pair));
    assert.equal(settled[ROWS - 2][2], R);
    assert.equal(settled[ROWS - 1][3], G);
    assert.deepEqual(moves, [{ x: 3, from: ROWS - 2, to: ROWS - 1 }]);
});

test('着地点の予告は落ちきった位置になる', () => {
    const board = boardFrom('..1...');
    const pair = { ...spawn([R, G]), rot: 1, y: 3 };
    assert.deepEqual(
        landingCells(board, pair).sort((a, b) => a.x - b.x),
        [
            { x: 2, y: ROWS - 2, color: R },
            { x: 3, y: ROWS - 1, color: G },
        ],
    );
    const vertical = { ...spawn([R, G]), y: 3 };
    assert.deepEqual(landingCells(board, vertical), [
        { x: 2, y: ROWS - 2, color: R },
        { x: 2, y: ROWS - 3, color: G },
    ]);
});

test('同じ色が4つつながると消える組になり、3つでは消えない', () => {
    assert.equal(findGroups(boardFrom('000...')).length, 0);
    const groups = findGroups(boardFrom('00....', '.00...'));
    assert.equal(groups.length, 1);
    assert.equal(groups[0].cells.length, 4);
});

test('ななめはつながりに数えない', () => {
    assert.equal(findGroups(boardFrom('0.0...', '.0.0..')).length, 0);
});

test('消して落とすと次の組ができ、れんさになる', () => {
    let board = boardFrom('1110..', '0000..', '1.....');
    let chain = 0;
    let groups;
    while ((groups = findGroups(board)).length > 0) {
        chain++;
        board = applyGravity(removeCells(board, groups)).board;
    }
    assert.equal(chain, 2);
    assert.ok(isEmpty(board));
});

test('れんさが続くほど、同じ数を消しても点が大きくなる', () => {
    const groups = [{ color: R, cells: [[0, 0], [1, 0], [2, 0], [3, 0]] }];
    assert.equal(popScore(groups, 1), 40);
    assert.ok(popScore(groups, 2) > popScore(groups, 1));
    assert.ok(popScore(groups, 3) > popScore(groups, 2));
});

test('出現する場所がうまるとおしまい', () => {
    const board = emptyBoard();
    assert.equal(isDead(board), false);
    board[0][SPAWN_X] = B;
    assert.equal(isDead(board), true);
});

test('配る色は指定した色数の中におさまる', () => {
    let seed = 0;
    const deal = createDealer(() => (seed = (seed + 0.37) % 1), 3);
    for (let i = 0; i < 50; i++) for (const c of deal()) assert.ok(c >= 0 && c < 3);
});

test('レベルが上がるほど速く落ち、下限より速くはならない', () => {
    assert.equal(levelFor(0), 0);
    assert.ok(fallInterval(5) < fallInterval(0));
    assert.equal(fallInterval(100), 110);
});
