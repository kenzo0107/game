import { describe, expect, it } from 'vitest'
import { LANE, createBall, createPins, isSettled, pinLayout, step } from './physics'

function simulate(vx: number, vy: number) {
  const ball = createBall()
  const pins = createPins()
  ball.vx = vx
  ball.vy = vy
  for (let i = 0; i < 60 * 20 * 6 && !(ball.out && isSettled(ball, pins)); i++) {
    step(ball, pins, 1 / 360)
  }
  return { ball, pins }
}

describe('pinLayout', () => {
  it('ピンは 100 本で、すべてレーン内に収まる', () => {
    const pins = pinLayout()
    expect(pins).toHaveLength(100)
    expect(pins.every((p) => Math.abs(p.x) < LANE.halfWidth && p.y < LANE.length)).toBe(true)
  })
})

describe('step', () => {
  it('強くまっすぐ投げると多くのピンが倒れる', () => {
    const { pins } = simulate(0, 14)
    expect(pins.filter((p) => p.fallen).length).toBeGreaterThan(30)
  })

  it('大きく横にそれるとガターになりピンは倒れない', () => {
    const { ball, pins } = simulate(3, 10)
    expect(ball.inGutter).toBe(true)
    expect(pins.some((p) => p.fallen)).toBe(false)
  })
})

describe('障害物', () => {
  it('正面の柱に当たるとボールは跳ね返されて前に進めない', () => {
    const ball = createBall()
    ball.vy = 10
    const post = { ax: 0, ay: 5, bx: 0, by: 5, r: 0.14, vx: 0, vy: 0, omega: 0, cx: 0, cy: 0 }
    for (let i = 0; i < 360; i++) step(ball, [], 1 / 360, [post])
    expect(ball.y).toBeLessThan(5)
    expect(ball.vy).toBeLessThan(0)
  })

  it('動いているカベはピンを押し倒す', () => {
    const pins = createPins().slice(0, 1)
    const head = pins[0]
    const wall = { ax: head.x - 0.5, ay: head.y - 0.1, bx: head.x + 0.5, by: head.y - 0.1, r: 0.08, vx: 0, vy: 3, omega: 0, cx: 0, cy: 0 }
    step(createBall(), pins, 1 / 360, [wall])
    expect(head.fallen).toBe(true)
  })
})

describe('カーブ', () => {
  it('スピンをかけるとその向きに曲がり、ピンに届くまでに横へずれる', () => {
    const ball = createBall()
    ball.vy = 12
    ball.spin = 1.0
    while (ball.y < LANE.headPinY) step(ball, [], 1 / 360)
    expect(ball.x).toBeGreaterThan(0.3)
    expect(ball.inGutter).toBe(false)
  })
})
