import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    BAY_COUNT,
    LOOP_SIZE,
    MAX_BAYS,
    addBay,
    arrive,
    boardSlot,
    cellsOf,
    createGame,
    exitPath,
    feedSlot,
    generateStage,
    riderCount,
    status,
    tapBus,
} from './logic.js';

const tinyStage = (buses, queue) => ({ cols: 4, rows: 4, buses, queue });
const bus = (id, col, row, dir, color, len = 2, cap = 4) => ({ id, col, row, dir, color, len, cap });
const parkAll = (game, ids) => {
    for (const id of ids) {
        tapBus(game, id);
        arrive(game, id);
    }
};

function boardAll(game) {
    let progressed = true;
    while (progressed) {
        progressed = false;
        game.loop.forEach((_, slot) => {
            if (boardSlot(game, slot)) progressed = true;
            if (feedSlot(game, slot) !== null) progressed = true;
        });
    }
}

function playSolution(stage) {
    const data = generateStage(stage);
    const game = createGame(data);
    for (const id of data.solution) {
        let result = tapBus(game, id);
        if (result.reason === 'full') {
            boardAll(game);
            result = tapBus(game, id);
        }
        if (!result.ok) return { game, failed: { id, ...result } };
        arrive(game, id);
    }
    boardAll(game);
    return { game };
}

test('バスは先頭から後ろへ長さぶんのマスを占める', () => {
    assert.deepEqual(cellsOf(bus(0, 1, 0, 'up', 0, 3)), [
        { col: 1, row: 0 },
        { col: 1, row: 1 },
        { col: 1, row: 2 },
    ]);
});

test('前に別のバスがいると出られず、そこまでのマス数がわかる', () => {
    const grid = { cols: 4, rows: 4 };
    const a = bus(0, 3, 1, 'right', 0);
    const b = bus(1, 1, 1, 'right', 1);
    assert.deepEqual(exitPath(grid, [a, b], b), { clear: false, free: 0, blocker: 0 });
    assert.deepEqual(exitPath(grid, [a, b], a), { clear: true, free: 0 });
});

test('ふさがれたバスをタップしても動かない', () => {
    const game = createGame(tinyStage([bus(0, 3, 1, 'right', 0), bus(1, 1, 1, 'right', 0)], []));
    const result = tapBus(game, 1);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'blocked');
    assert.equal(game.buses[1].where, 'lot');
});

test('出られるバスはあいている いちばん左の のりばへ向かう', () => {
    const game = createGame(tinyStage([bus(0, 0, 0, 'up', 0)], []));
    game.bays[0] = 99;
    assert.deepEqual(tapBus(game, 0), { ok: true, bay: 1, free: 0 });
    assert.equal(game.buses[0].where, 'moving');
});

test('はじめは輪に決まった人数だけ入り、残りは待機列に並ぶ', () => {
    const queue = Array.from({ length: LOOP_SIZE + 3 }, (_, i) => i % 2);
    const game = createGame(tinyStage([], queue));
    assert.deepEqual(game.loop, queue.slice(0, LOOP_SIZE));
    assert.deepEqual(game.waiting, queue.slice(LOOP_SIZE));
    assert.equal(riderCount(game), queue.length);
});

test('のりばに着くまでは乗客は乗らない', () => {
    const game = createGame(tinyStage([bus(0, 0, 0, 'up', 2)], [2, 2, 2, 2]), 4);
    tapBus(game, 0);
    assert.equal(boardSlot(game, 0), null);
    arrive(game, 0);
    assert.equal(boardSlot(game, 0).busId, 0);
});

test('先頭でなくても同じ色のバスが のりばにいれば乗る', () => {
    const game = createGame(tinyStage([bus(0, 0, 0, 'up', 1)], [2, 2, 1]), 3);
    parkAll(game, [0]);
    assert.equal(boardSlot(game, 0), null);
    assert.deepEqual(boardSlot(game, 2), { busId: 0, bay: 0, seat: 0, full: false });
    assert.deepEqual(game.loop, [2, 2, null]);
});

test('同じ色が並ぶと たくさん乗っているほうを先に満員にする', () => {
    const game = createGame(tinyStage([bus(0, 0, 0, 'up', 1), bus(1, 1, 0, 'up', 1)], [1, 1, 1]), 3);
    parkAll(game, [0, 1]);
    game.buses[1].filled = 2;
    assert.equal(boardSlot(game, 0).busId, 1);
});

test('乗って空いた所には待機列の先頭が入る', () => {
    const game = createGame(tinyStage([bus(0, 0, 0, 'up', 1)], [1, 3, 4]), 2);
    parkAll(game, [0]);
    boardSlot(game, 0);
    assert.equal(feedSlot(game, 1), null);
    assert.equal(feedSlot(game, 0), 4);
    assert.deepEqual(game.waiting, []);
});

test('満員になったバスは出発して のりばがあく', () => {
    const game = createGame(tinyStage([bus(0, 0, 0, 'up', 3)], [3, 3, 3, 3]), 4);
    parkAll(game, [0]);
    const results = [0, 1, 2, 3].map((slot) => boardSlot(game, slot));
    assert.deepEqual(results.map((r) => r.full), [false, false, false, true]);
    assert.equal(game.bays[0], null);
    assert.equal(status(game), 'clear');
});

const fullBays = (extra = []) =>
    Array.from({ length: BAY_COUNT }, (_, i) => bus(i, i % 4, Math.floor(i / 4) * 2, 'up', 0)).concat(extra);

test('のりばが埋まり、輪にも次に入れる人にも乗れる人がいないと詰み', () => {
    const game = createGame({ cols: 4, rows: 4, buses: fullBays([bus(5, 2, 2, 'up', 5)]), queue: [5, 5, 0] }, 2);
    parkAll(game, [0, 1, 2, 3, 4]);
    assert.equal(tapBus(game, 5).reason, 'full');
    assert.equal(status(game), 'stuck');
});

test('輪に空きがあり、待機列から乗れる人が入ってこられるなら まだ詰みではない', () => {
    const game = createGame({ cols: 4, rows: 4, buses: fullBays(), queue: [5, 0] }, 2);
    game.loop[1] = null;
    game.waiting = [0];
    parkAll(game, [0, 1, 2, 3, 4]);
    assert.equal(status(game), 'play');
});

test('のりばが埋まっても向かっている途中のバスがあれば まだ詰みではない', () => {
    const game = createGame({ cols: 4, rows: 4, buses: fullBays(), queue: [5] });
    for (let i = 0; i < BAY_COUNT; i++) tapBus(game, i);
    assert.equal(status(game), 'play');
});

test('のりばは決められた数まで増やせて、増やせば詰みから抜けられる', () => {
    const game = createGame({ cols: 4, rows: 4, buses: fullBays([bus(5, 2, 2, 'up', 5)]), queue: [5] });
    parkAll(game, [0, 1, 2, 3, 4]);
    assert.equal(status(game), 'stuck');
    while (addBay(game));
    assert.equal(game.bays.length, MAX_BAYS);
    assert.equal(status(game), 'play');
    assert.equal(tapBus(game, BAY_COUNT).bay, BAY_COUNT);
});

test('ステージは同じ番号なら毎回同じ盤面になる', () => {
    assert.deepEqual(generateStage(4), generateStage(4));
});

test('どのステージも乗客の色の数はバスの席の数と一致する', () => {
    for (let stage = 0; stage < 40; stage++) {
        const data = generateStage(stage);
        const seats = new Map();
        for (const b of data.buses) seats.set(b.color, (seats.get(b.color) ?? 0) + b.cap);
        const riders = new Map();
        for (const c of data.queue) riders.set(c, (riders.get(c) ?? 0) + 1);
        assert.deepEqual(riders, seats, `stage ${stage}`);
    }
});

test('3ステージめからは駐車場の6割以上がバスで埋まる', () => {
    for (let stage = 3; stage < 40; stage++) {
        const { cols, rows, buses } = generateStage(stage);
        const used = buses.reduce((sum, b) => sum + b.len, 0);
        assert.ok(used >= cols * rows * 0.6, `stage ${stage}: ${used}/${cols * rows}`);
    }
});

test('どのステージも用意した出し方で最後までクリアできる', () => {
    for (let stage = 0; stage < 40; stage++) {
        const { game, failed } = playSolution(stage);
        assert.equal(failed, undefined, `stage ${stage}`);
        assert.equal(status(game), 'clear', `stage ${stage}`);
    }
});
