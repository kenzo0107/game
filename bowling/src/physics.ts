export const LANE = {
  halfWidth: 1.4,
  gutterWidth: 0.3,
  headPinY: 18,
  length: 22.5,
  pinSpacing: 0.26,
}

export const BALL_RADIUS = 0.2
export const BALL_START_Y = 0.6
export const PIN_RADIUS = 0.06
export const FALLEN_PIN_RADIUS = 0.09

const BALL_MASS = 14
const PIN_MASS = 1.5
const BALL_FRICTION = 0.2
const PIN_FRICTION = 2.5
const BALL_PIN_RESTITUTION = 0.7
const PIN_PIN_RESTITUTION = 0.8
const OBSTACLE_RESTITUTION = 0.6
const KNOCK_SPEED = 0.25
const REST_SPEED = 0.03

interface Body {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  m: number
}

export interface Ball extends Body {
  spin: number
  inGutter: boolean
  out: boolean
}

export interface Pin extends Body {
  fallen: boolean
  out: boolean
  fallDirX: number
  fallDirY: number
}

export function pinLayout(): { x: number; y: number }[] {
  const s = LANE.pinSpacing
  const rowGap = (s * Math.sqrt(3)) / 2
  const counts = [...Array.from({ length: 10 }, (_, i) => i + 1), ...Array.from({ length: 9 }, (_, i) => 9 - i)]
  return counts.flatMap((count, row) =>
    Array.from({ length: count }, (_, j) => ({
      x: (j - (count - 1) / 2) * s,
      y: LANE.headPinY + row * rowGap,
    })),
  )
}

export function createBall(): Ball {
  return { x: 0, y: BALL_START_Y, vx: 0, vy: 0, r: BALL_RADIUS, m: BALL_MASS, spin: 0, inGutter: false, out: false }
}

export function createPins(): Pin[] {
  return pinLayout().map(({ x, y }) => ({
    x,
    y,
    vx: 0,
    vy: 0,
    r: PIN_RADIUS,
    m: PIN_MASS,
    fallen: false,
    out: false,
    fallDirX: 0,
    fallDirY: 1,
  }))
}

const speedOf = (b: Body) => Math.hypot(b.vx, b.vy)

function applyFriction(b: Body, decel: number, dt: number) {
  const s = speedOf(b)
  if (s === 0) return
  const next = Math.max(0, s - decel * dt)
  b.vx *= next / s
  b.vy *= next / s
}

function knockIfHit(pin: Pin) {
  if (pin.fallen) return
  const s = speedOf(pin)
  if (s > KNOCK_SPEED) {
    pin.fallen = true
    pin.r = FALLEN_PIN_RADIUS
    pin.fallDirX = pin.vx / s
    pin.fallDirY = pin.vy / s
  } else {
    pin.vx = 0
    pin.vy = 0
  }
}

function collide(a: Body, b: Body, restitution: number): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const minDist = a.r + b.r
  const distSq = dx * dx + dy * dy
  if (distSq >= minDist * minDist || distSq === 0) return false

  const dist = Math.sqrt(distSq)
  const nx = dx / dist
  const ny = dy / dist
  const invA = 1 / a.m
  const invB = 1 / b.m
  const overlap = minDist - dist
  a.x -= nx * overlap * (invA / (invA + invB))
  a.y -= ny * overlap * (invA / (invA + invB))
  b.x += nx * overlap * (invB / (invA + invB))
  b.y += ny * overlap * (invB / (invA + invB))

  const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
  if (vrel >= 0) return true
  const j = (-(1 + restitution) * vrel) / (invA + invB)
  a.vx -= j * invA * nx
  a.vy -= j * invA * ny
  b.vx += j * invB * nx
  b.vy += j * invB * ny
  return true
}

function stepBall(ball: Ball, dt: number) {
  if (ball.out) return
  if (!ball.inGutter && ball.y < LANE.headPinY) ball.vx += ball.spin * dt
  ball.x += ball.vx * dt
  ball.y += ball.vy * dt
  applyFriction(ball, BALL_FRICTION, dt)
  if (!ball.inGutter && Math.abs(ball.x) > LANE.halfWidth) {
    ball.inGutter = true
    ball.x = Math.sign(ball.x) * (LANE.halfWidth + LANE.gutterWidth / 2)
    ball.vx = 0
  }
  if (ball.y > LANE.length) ball.out = true
}

function stepPin(pin: Pin, dt: number) {
  if (pin.out || (pin.vx === 0 && pin.vy === 0)) return
  pin.x += pin.vx * dt
  pin.y += pin.vy * dt
  applyFriction(pin, PIN_FRICTION, dt)
  if (Math.abs(pin.x) > LANE.halfWidth || pin.y > LANE.length) {
    pin.out = true
    pin.fallen = true
    pin.vx = 0
    pin.vy = 0
  }
}

export interface Obstacle {
  ax: number
  ay: number
  bx: number
  by: number
  r: number
  vx: number
  vy: number
  omega: number
  cx: number
  cy: number
}

function collideObstacle(body: Body, o: Obstacle): boolean {
  const sx = o.bx - o.ax
  const sy = o.by - o.ay
  const lenSq = sx * sx + sy * sy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((body.x - o.ax) * sx + (body.y - o.ay) * sy) / lenSq))
  const qx = o.ax + sx * t
  const qy = o.ay + sy * t
  const dx = body.x - qx
  const dy = body.y - qy
  const minDist = body.r + o.r
  const dist = Math.hypot(dx, dy)
  if (dist >= minDist) return false

  const nx = dist === 0 ? 0 : dx / dist
  const ny = dist === 0 ? -1 : dy / dist
  body.x = qx + nx * minDist
  body.y = qy + ny * minDist
  const ovx = o.vx - o.omega * (qy - o.cy)
  const ovy = o.vy + o.omega * (qx - o.cx)
  const vrel = (body.vx - ovx) * nx + (body.vy - ovy) * ny
  if (vrel < 0) {
    body.vx -= (1 + OBSTACLE_RESTITUTION) * vrel * nx
    body.vy -= (1 + OBSTACLE_RESTITUTION) * vrel * ny
  }
  return true
}

export function step(ball: Ball, pins: Pin[], dt: number, obstacles: Obstacle[] = []) {
  stepBall(ball, dt)
  pins.forEach((p) => stepPin(p, dt))

  const live = pins.filter((p) => !p.out)
  for (const o of obstacles) {
    if (!ball.out && !ball.inGutter) collideObstacle(ball, o)
    for (const pin of live) {
      if (collideObstacle(pin, o)) knockIfHit(pin)
    }
  }
  if (!ball.out && !ball.inGutter) {
    for (const pin of live) {
      if (collide(ball, pin, BALL_PIN_RESTITUTION)) knockIfHit(pin)
    }
  }
  for (let i = 0; i < live.length; i++) {
    for (let k = i + 1; k < live.length; k++) {
      const a = live[i]
      const b = live[k]
      if (!a.fallen && !b.fallen) continue
      if (collide(a, b, PIN_PIN_RESTITUTION)) {
        knockIfHit(a)
        knockIfHit(b)
      }
    }
  }
}

export function isSettled(ball: Ball, pins: Pin[]): boolean {
  const ballDone = ball.out || speedOf(ball) < REST_SPEED
  return ballDone && pins.every((p) => p.out || speedOf(p) < REST_SPEED)
}
