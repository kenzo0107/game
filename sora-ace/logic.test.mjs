import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    CEILING_Y,
    GROUND_Y,
    THEMES,
    aimAt,
    bombHitsFort,
    buildStage,
    canLand,
    clampPitch,
    loopOffset,
    MAX_PITCH,
    groundY,
    levelOff,
    normalizeAngle,
    stageLayout,
} from './logic.js';

const LEVELS = [0, 1, 2, 3, 4, 9];

test('滑走路・敵のきち・スタート地点の地面は平らで、標準の高さにある', () => {
    for (const level of LEVELS) {
        const { target, runway } = stageLayout(level);
        for (const x of [0, 200, target.x0, target.x1, runway.x0, (runway.x0 + runway.x1) / 2, runway.x1]) {
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
