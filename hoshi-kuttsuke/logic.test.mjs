import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    DANGER_MS,
    DROP_TIERS,
    HEIGHT,
    LAST_TIER_BONUS,
    LINE_Y,
    TIER_COUNT,
    WIDTH,
    addBody,
    clampDropX,
    createDealer,
    createWorld,
    drop,
    mergeScore,
    radiusOf,
    step,
} from './logic.js';

const run = (world, ms, frame = 16) => {
    const merges = [];
    let over = false;
    for (let t = 0; t < ms; t += frame) {
        const result = step(world, frame);
        merges.push(...result.merges);
        over ||= result.over;
    }
    return { merges, over };
};

test('落としたものは床の上で止まる', () => {
    const world = createWorld();
    const body = drop(world, 2, 50);
    run(world, 3000);
    assert.ok(Math.abs(body.y + body.r - HEIGHT) < 0.5);
    assert.ok(Math.abs(body.vy) < 1);
});

test('落とす位置は壁からはみ出さない', () => {
    assert.equal(clampDropX(-10, 3), radiusOf(3));
    assert.equal(clampDropX(WIDTH + 10, 3), WIDTH - radiusOf(3));
    assert.equal(clampDropX(40, 3), 40);
});

test('ちがう種類どうしは重なり合わずに積み上がる', () => {
    const world = createWorld();
    const lower = drop(world, 4, 50);
    run(world, 1500);
    const upper = drop(world, 3, 50);
    run(world, 3000);
    assert.equal(world.bodies.length, 2);
    assert.ok(upper.y < lower.y);
    assert.ok(Math.hypot(upper.x - lower.x, upper.y - lower.y) >= upper.r + lower.r - 0.5);
});

test('おなじ種類がふれると、ひとつ大きいものに合体して得点が入る', () => {
    const world = createWorld();
    drop(world, 1, 50);
    run(world, 1500);
    drop(world, 1, 50);
    const { merges } = run(world, 2000);
    assert.equal(merges.length, 1);
    assert.equal(world.bodies.length, 1);
    assert.equal(world.bodies[0].tier, 2);
    assert.equal(world.score, mergeScore(2));
});

test('合体は連鎖する', () => {
    const world = createWorld();
    addBody(world, 2, 50, HEIGHT - radiusOf(2));
    run(world, 500);
    drop(world, 1, 50);
    run(world, 1500);
    drop(world, 1, 50);
    const { merges } = run(world, 3000);
    assert.deepEqual(merges.map((m) => m.tier), [1, 2]);
    assert.equal(world.bodies.length, 1);
    assert.equal(world.bodies[0].tier, 3);
});

test('いちばん大きいものどうしは合体して消え、ボーナスが入る', () => {
    const world = createWorld();
    const last = TIER_COUNT - 1;
    const r = radiusOf(last);
    addBody(world, last, r, HEIGHT - r);
    addBody(world, last, r * 2 + 0.5, HEIGHT - r - 1);
    const { merges } = run(world, 500);
    assert.equal(merges.length, 1);
    assert.ok(merges[0].last);
    assert.equal(world.bodies.length, 0);
    assert.equal(world.score, LAST_TIER_BONUS);
});

test('ラインより上に止まり続けるとゲームオーバー', () => {
    const world = createWorld();
    const r = radiusOf(TIER_COUNT - 1);
    addBody(world, TIER_COUNT - 1, r, HEIGHT - r);
    addBody(world, TIER_COUNT - 2, WIDTH - radiusOf(TIER_COUNT - 2), HEIGHT - radiusOf(TIER_COUNT - 2));
    addBody(world, TIER_COUNT - 3, WIDTH / 2, LINE_Y - 5);
    assert.ok(run(world, DANGER_MS + 1500).over);
});

test('ラインを通りすぎて落ちていくだけならゲームオーバーにならない', () => {
    const world = createWorld();
    for (let i = 0; i < 20; i++) {
        drop(world, i % DROP_TIERS, 10 + ((i * 37) % 80));
        assert.equal(run(world, 600).over, false);
    }
});

test('落とすものは小さい種類だけで、最初は特に小さい', () => {
    const values = [0.99, 0.99, 0.99, 0.99, 0.99, 0];
    const deal = createDealer(() => values.shift());
    const dealt = Array.from({ length: 6 }, deal);
    assert.deepEqual(dealt, [2, 2, 2, 2, DROP_TIERS - 1, 0]);
});

test('たくさん積み上がってラインを越えたまま止まると、ゲームオーバー', () => {
    const world = createWorld();
    let over = false;
    for (let i = 0; i < 200 && !over; i++) {
        drop(world, 3 + (i % 2), 50);
        over = run(world, 900).over;
    }
    assert.ok(over);
    assert.ok(world.bodies.some((b) => b.y - b.r < LINE_Y));
});
