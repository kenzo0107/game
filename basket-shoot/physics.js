export const GRAVITY = 9.8;
export const BALL_RADIUS = 0.12;
export const RIM_HEIGHT = 3.05;
export const RIM_DIAMETER = 0.46;
export const THREE_POINT_DISTANCE = 6.75;

const RIM_TUBE = 0.02;
const RIM_RESTITUTION = 0.55;
const BOARD_RESTITUTION = 0.65;
const FLOOR_RESTITUTION = 0.6;
const FLOOR_FRICTION = 0.8;
const MIN_BOUNCE_SPEED = 1;
const LAUNCH_GAIN = 2.8;
const MAX_SPEED = 13;

export function createHoop(backX) {
    return {
        front: { x: backX - RIM_DIAMETER, y: RIM_HEIGHT },
        back: { x: backX, y: RIM_HEIGHT },
        board: { x: backX + 0.15, bottom: 2.9, top: 3.95 },
    };
}

export const hoopCenterX = (hoop) => (hoop.front.x + hoop.back.x) / 2;

export function shotPoints(shooterX, hoop) {
    return hoopCenterX(hoop) - shooterX >= THREE_POINT_DISTANCE ? 3 : 2;
}

export const SHOT_DISTANCE = { min: 2.4, max: 7.4, step: 0.8 };

export function nextShotDistance(distance, scored) {
    return scored ? Math.min(distance + SHOT_DISTANCE.step, SHOT_DISTANCE.max) : distance;
}

export function launchVelocity(dragX, dragY) {
    const vx = dragX * LAUNCH_GAIN;
    const vy = dragY * LAUNCH_GAIN;
    const speed = Math.hypot(vx, vy);
    const k = speed > MAX_SPEED ? MAX_SPEED / speed : 1;
    return { vx: vx * k, vy: vy * k };
}

export function createBall(x, y, vx = 0, vy = 0) {
    return { x, y, vx, vy, scored: false, touchedRim: false, bounces: 0 };
}

function bounceOff(ball, px, py, minDist, restitution) {
    const dx = ball.x - px;
    const dy = ball.y - py;
    const dist = Math.hypot(dx, dy);
    if (dist >= minDist || dist === 0) return false;
    const nx = dx / dist;
    const ny = dy / dist;
    ball.x = px + nx * minDist;
    ball.y = py + ny * minDist;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
        ball.vx -= (1 + restitution) * vn * nx;
        ball.vy -= (1 + restitution) * vn * ny;
    }
    return true;
}

export function step(ball, hoop, dt) {
    const events = [];
    const prevY = ball.y;
    ball.vy -= GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    for (const rim of [hoop.front, hoop.back]) {
        if (bounceOff(ball, rim.x, rim.y, BALL_RADIUS + RIM_TUBE, RIM_RESTITUTION)) {
            ball.touchedRim = true;
            events.push('rim');
        }
    }
    const { board } = hoop;
    const boardY = Math.min(Math.max(ball.y, board.bottom), board.top);
    if (bounceOff(ball, board.x, boardY, BALL_RADIUS, BOARD_RESTITUTION)) events.push('board');

    const crossedRim = prevY >= RIM_HEIGHT && ball.y < RIM_HEIGHT;
    if (!ball.scored && ball.vy < 0 && crossedRim && ball.x > hoop.front.x && ball.x < hoop.back.x) {
        ball.scored = true;
        events.push('score');
    }

    if (ball.y < BALL_RADIUS) {
        ball.y = BALL_RADIUS;
        if (-ball.vy >= MIN_BOUNCE_SPEED) {
            ball.vy = -ball.vy * FLOOR_RESTITUTION;
            ball.vx *= FLOOR_FRICTION;
            ball.bounces++;
            events.push('floor');
        } else {
            ball.vy = 0;
            ball.vx *= 0.98;
        }
    }
    return events;
}
