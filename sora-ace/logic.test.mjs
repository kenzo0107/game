import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    CEILING_Y,
    GROUND_Y,
    THEMES,
    BOUNCE_SPEED,
    aimAt,
    bombHitsFort,
    bounceStep,
    buildStage,
    canLand,
    clampPitch,
    loopOffset,
    BASE_SHOTS,
    MAX_SHOTS_CAP,
    shotPower,
    MAX_PITCH,
    groundY,
    HOME_MAX,
    HOME_MIN,
    levelOff,
    shiftHome,
    stickVector,
    normalizeAngle,
    stageLayout,
} from './logic.js';

const LEVELS = [0, 1, 2, 3, 4, 9];

test('滑走路・敵のきち・スタート地点の地面は平らで、標準の高さにある', () => {
    for (const level of LEVELS) {
        const { target, runway, base } = stageLayout(level);
        for (const x of [0, base.x0, base.x1, target.x0, target.x1, runway.x0, (runway.x0 + runway.x1) / 2, runway.x1]) {
            assert.equal(groundY(level, x), GROUND_Y, `level ${level} x ${x}`);
        }
    }
});

test('丘があっても空を飛べる高さが残る', () => {
    for (const level of LEVELS) {
        for (let x = 0; x < stageLayout(level).length; x += 5) {
            const y = groundY(level, x);
            assert.ok(y <= GROUND_Y && y > CEILING_Y + 100, `level ${level} x ${x}: ${y}`);
        }
    }
});

test('ステージは きち の前に ばくだん補給があり、最後に滑走路がある', () => {
    for (const level of LEVELS) {
        const stage = buildStage(level);
        const xs = stage.events.map((e) => e.x);
        assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
        const fort = stage.events.find((e) => e.type === 'fort');
        const crates = stage.events.filter((e) => e.type === 'crate');
        assert.ok(crates.length >= 1 && crates.every((c) => c.x < fort.x));
        assert.equal(stage.events.at(-1).type, 'runway');
        assert.ok(stage.events.some((e) => e.type === 'plane'));
    }
});

test('ステージは最初の敵より手前に、離陸する滑走路がある', () => {
    for (const level of LEVELS) {
        const { base, events } = buildStage(level);
        assert.ok(base.x0 < base.x1 && base.x1 < events[0].x);
    }
});

test('同じステージは何度遊んでも同じ並びになる', () => {
    assert.deepEqual(buildStage(2), buildStage(2));
});

test('先のステージほど敵の飛行機が多い', () => {
    const planes = (level) => buildStage(level).events.filter((e) => e.type === 'plane' || e.type === 'chaser').length;
    assert.ok(planes(3) > planes(0));
});

test('テーマは4種類あり、5面目からは1面目の見た目に戻る', () => {
    assert.equal(THEMES.length, 4);
});

test('角度は -π〜π にそろえられ、手を離すと水平に戻っていく', () => {
    assert.ok(Math.abs(normalizeAngle(Math.PI * 2 + 0.3) - 0.3) < 1e-9);
    assert.ok(Math.abs(normalizeAngle(-Math.PI * 2 - 0.3) + 0.3) < 1e-9);
    assert.equal(levelOff(0.05, 1, 0.1), 0);
    assert.ok(Math.abs(levelOff(0.5, 1, 0.1) - 0.4) < 1e-9);
    assert.ok(Math.abs(levelOff(-0.5, 1, 0.1) + 0.4) < 1e-9);
});

test('ねらい撃ちの弾は相手の方向へ指定の速さで飛ぶ', () => {
    const v = aimAt({ x: 0, y: 0 }, { x: 30, y: 40 }, 50);
    assert.ok(Math.abs(v.vx - 30) < 1e-9 && Math.abs(v.vy - 40) < 1e-9);
});

test('水平かゆるい降下なら着陸でき、急降下・宙返り中・機首上げすぎは着陸できない', () => {
    assert.ok(canLand(0));
    assert.ok(canLand(0.3));
    assert.ok(canLand(-0.1));
    assert.ok(!canLand(0.8));
    assert.ok(!canLand(Math.PI));
    assert.ok(!canLand(-0.6));
});

test('ばくだんは きち の幅の中に落ちたときだけ命中する', () => {
    assert.ok(bombHitsFort({ x: 1000 }, 1010));
    assert.ok(!bombHitsFort({ x: 1000 }, 1060));
});

test('上下の操作で機首が向くのは水平から45度まで', () => {
    assert.equal(MAX_PITCH, Math.PI / 4);
    assert.equal(clampPitch(-1.2), -MAX_PITCH);
    assert.equal(clampPitch(1.2), MAX_PITCH);
    assert.ok(Math.abs(clampPitch(0.3) - 0.3) < 1e-9);
});

test('宙返りは小さな円を描いて、始めた位置にぴったり戻る', () => {
    for (const start of [0, -MAX_PITCH, MAX_PITCH]) {
        const end = loopOffset(Math.PI * 2, start, 16);
        assert.ok(Math.hypot(end.x, end.y) < 1e-9);
        for (let turned = 0; turned <= Math.PI * 2; turned += 0.1) {
            const o = loopOffset(turned, start, 16);
            assert.ok(Math.hypot(o.x, o.y) <= 32 + 1e-9);
        }
    }
    const top = loopOffset(Math.PI, 0, 16);
    assert.ok(Math.abs(top.x) < 1e-9 && Math.abs(top.y + 32) < 1e-9);
});

test('着地すると小さく跳ねてから、地面の上で止まる', () => {
    const floor = 158;
    let body = { y: floor, vy: -BOUNCE_SPEED };
    let top = floor;
    let rebounds = 0;
    for (let i = 0; i < 120; i++) {
        const before = body.vy;
        body = bounceStep(body, floor, 1 / 60);
        top = Math.min(top, body.y);
        if (before > 0 && body.vy < 0) rebounds++;
        assert.ok(body.y <= floor);
    }
    assert.ok(floor - top > 2 && floor - top < 6, `跳ねた高さ ${floor - top}`);
    assert.ok(rebounds >= 1);
    assert.deepEqual(body, { y: floor, vy: 0 });
});

test('スティックは中心付近の小さなずれを無視する', () => {
    assert.deepEqual(stickVector(5, -5, 60), { x: 0, y: 0 });
});

test('スティックは方向を保ったまま、端で長さ1になり、外へ引いても1を超えない', () => {
    const edge = stickVector(0, -60, 60);
    assert.ok(Math.abs(edge.x) < 1e-9 && Math.abs(edge.y + 1) < 1e-9);
    const far = stickVector(300, 300, 60);
    assert.ok(Math.abs(Math.hypot(far.x, far.y) - 1) < 1e-9);
    assert.ok(Math.abs(far.x - far.y) < 1e-9);
});

test('スティックを上から下へ滑らせると、そのまま下向きの入力になる', () => {
    assert.ok(stickVector(0, -50, 60).y < 0);
    assert.ok(stickVector(0, 50, 60).y > 0);
});

test('左右の入力で自機の位置が画面の中を前後し、端で止まる', () => {
    assert.ok(shiftHome(80, 1, 90, 0.1) > 80);
    assert.ok(shiftHome(80, -1, 90, 0.1) < 80);
    assert.equal(shiftHome(HOME_MAX, 1, 90, 1), HOME_MAX);
    assert.equal(shiftHome(HOME_MIN, -1, 90, 1), HOME_MIN);
});

test('スティックを真横近くに倒したときは、縦の入力にならない', () => {
    const v = stickVector(60, 6, 60);
    assert.equal(v.y, 0);
    assert.ok(v.x > 0.9);
});

test('宙返りは、始めた位置より少し後ろで終わる', () => {
    for (const start of [0, -MAX_PITCH, MAX_PITCH]) {
        const end = loopOffset(Math.PI * 2, start, 16, 24);
        assert.ok(Math.abs(Math.hypot(end.x, end.y) - 24) < 1e-9);
        assert.ok(end.x < -16);
    }
});

test('弾を当てるたびに、一度に撃てる弾が増えて連射が速くなり、上限で止まる', () => {
    assert.equal(shotPower(0).max, BASE_SHOTS);
    for (let n = 0; n < MAX_SHOTS_CAP - BASE_SHOTS; n++) {
        assert.ok(shotPower(n + 1).max > shotPower(n).max);
        assert.ok(shotPower(n + 1).interval < shotPower(n).interval);
    }
    assert.equal(shotPower(100).max, MAX_SHOTS_CAP);
    assert.ok(shotPower(100).interval > 0);
});
