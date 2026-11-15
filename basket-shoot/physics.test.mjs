import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    GRAVITY,
    RIM_HEIGHT,
    THREE_POINT_DISTANCE,
    createBall,
    createHoop,
    hoopCenterX,
    SHOT_DISTANCE,
    launchVelocity,
    nextShotDistance,
    shotPoints,
    step,
} from './physics.js';

const hoop = createHoop(9);
const DT = 1 / 240;

function simulate(ball, seconds = 4) {
    const events = [];
    for (let t = 0; t < seconds; t += DT) events.push(...step(ball, hoop, DT));
    return events;
}

function aimedBall(fromX, angleDeg, targetX = hoopCenterX(hoop), targetY = RIM_HEIGHT) {
    const y0 = 2.1;
    const dx = targetX - fromX;
    const dy = targetY - y0;
    const a = (angleDeg * Math.PI) / 180;
    const speed = Math.sqrt((GRAVITY * dx * dx) / (2 * Math.cos(a) ** 2 * (dx * Math.tan(a) - dy)));
    return createBall(fromX, y0, speed * Math.cos(a), speed * Math.sin(a));
}

test('リング中央をねらった弧のシュートはリングに触れずに入る', () => {
    for (const fromX of [6, 4, 2]) {
        const ball = aimedBall(fromX, 60);
        const events = simulate(ball);
        assert.equal(events.filter((e) => e === 'score').length, 1, `x=${fromX}`);
        assert.equal(ball.touchedRim, false, `x=${fromX}`);
    }
});

test('届かないシュートは入らない', () => {
    const ball = aimedBall(4, 52, hoopCenterX(hoop) - 1.2);
    simulate(ball);
    assert.equal(ball.scored, false);
});

test('バックボードに当たったボールは手前に跳ね返る', () => {
    const ball = createBall(hoop.board.x - 0.5, 3.4, 6, 0);
    const events = simulate(ball, 0.3);
    assert.ok(events.includes('board'));
    assert.ok(ball.vx < 0);
});

test('リングの下から上に抜けても得点にならない', () => {
    const ball = createBall(hoopCenterX(hoop), 2.5, 0, 4);
    simulate(ball, 0.4);
    assert.equal(ball.scored, false);
});

test('床で弾むたびに勢いが弱まり、やがて止まる', () => {
    const ball = createBall(1, 2, 0, 0);
    const events = simulate(ball, 6);
    assert.ok(events.filter((e) => e === 'floor').length >= 2);
    assert.equal(ball.vy, 0);
});

test('3ポイントラインより遠くからは3点、内側からは2点', () => {
    const center = hoopCenterX(hoop);
    assert.equal(shotPoints(center - THREE_POINT_DISTANCE, hoop), 3);
    assert.equal(shotPoints(center - THREE_POINT_DISTANCE + 0.01, hoop), 2);
});

test('ドラッグが長すぎても投げる速さは上限で止まり、向きは保たれる', () => {
    const { vx, vy } = launchVelocity(30, 30);
    assert.ok(Math.abs(Math.hypot(vx, vy) - 13) < 1e-9);
    assert.ok(Math.abs(vx - vy) < 1e-9);
    assert.deepEqual(launchVelocity(1, 2), { vx: 2.8, vy: 5.6 });
});

test('決めたら次はゴールから一歩離れる', () => {
    assert.equal(nextShotDistance(SHOT_DISTANCE.min, true), SHOT_DISTANCE.min + SHOT_DISTANCE.step);
});

test('外したら同じ場所からもう一度打つ', () => {
    assert.equal(nextShotDistance(4, false), 4);
});

test('いちばん遠い場所より先には離れない', () => {
    assert.equal(nextShotDistance(SHOT_DISTANCE.max - 0.1, true), SHOT_DISTANCE.max);
    assert.equal(nextShotDistance(SHOT_DISTANCE.max, true), SHOT_DISTANCE.max);
});

test('近くから決め続けると 3P ラインの外まで届く', () => {
    let distance = SHOT_DISTANCE.min;
    for (let i = 0; i < 10; i++) distance = nextShotDistance(distance, true);
    assert.ok(distance >= THREE_POINT_DISTANCE);
});
