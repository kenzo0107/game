import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TAP_MAX_MS, createGesture } from './gesture.js';

const STEP = 20;

function swipe(points) {
    const g = createGesture(STEP);
    const [first, ...rest] = points;
    g.start(...first);
    const last = rest.pop();
    const moved = rest.flatMap((p) => g.move(...p));
    return [...moved, ...g.end(...last)];
}

test('すばやく軽くタップすると回転する', () => {
    assert.deepEqual(swipe([[100, 100, 0], [102, 101, 100]]), ['cw']);
});

test('長く押しただけでは回転しない', () => {
    assert.deepEqual(swipe([[100, 100, 0], [101, 100, TAP_MAX_MS + 100]]), []);
});

test('横になぞると、なぞったマス数だけ左右に動く', () => {
    assert.deepEqual(swipe([[100, 100, 0], [125, 102, 100], [165, 104, 200], [165, 104, 600]]), ['right', 'right', 'right']);
    assert.deepEqual(swipe([[100, 100, 0], [55, 100, 300], [55, 100, 600]]), ['left', 'left']);
});

test('行って戻ると、戻った分だけ逆に動く', () => {
    assert.deepEqual(swipe([[100, 100, 0], [145, 100, 200], [100, 100, 400], [100, 100, 800]]), ['right', 'right', 'left', 'left']);
});

test('横になぞっている途中で下へずれても下には動かない', () => {
    assert.deepEqual(swipe([[100, 100, 0], [130, 105, 100], [132, 160, 400], [132, 160, 900]]), ['right']);
});

test('ゆっくり下へなぞると1マスずつ下がり、いっきには落ちない', () => {
    assert.deepEqual(swipe([[100, 100, 0], [100, 130, 300], [100, 165, 700], [100, 165, 1000]]), ['down', 'down', 'down']);
});

test('下へはじくと、いっきに落とす', () => {
    const actions = swipe([[100, 100, 0], [100, 130, 30], [100, 170, 60], [100, 200, 90]]);
    assert.equal(actions.at(-1), 'drop');
});

test('上へはじくとホールドする', () => {
    assert.deepEqual(swipe([[100, 200, 0], [100, 170, 30], [100, 130, 60], [100, 100, 90]]), ['hold']);
});

test('上へゆっくり動かしてもホールドしない', () => {
    assert.deepEqual(swipe([[100, 200, 0], [100, 150, 400], [100, 100, 800], [100, 100, 1200]]), []);
});
