import type { Obstacle } from './physics'

export type ObstacleDef =
  | { kind: 'post'; x: number; y: number }
  | { kind: 'wall'; x: number; y: number; halfLen: number }
  | { kind: 'slider'; y: number; halfLen: number; range: number; period: number; phase?: number }
  | { kind: 'spinner'; x: number; y: number; halfLen: number; period: number; phase?: number }

export interface Stage {
  target: number
  obstacles: ObstacleDef[]
}

export interface Course {
  id: string
  name: string
  cost: number
  stages: Stage[]
}

export const THROWS_PER_STAGE = 2
const OBSTACLE_RADIUS = 0.08
const POST_RADIUS = 0.14

const stages = (targets: number[], obstacles: ObstacleDef[][]): Stage[] =>
  targets.map((target, i) => ({ target, obstacles: obstacles[i] }))

export const COURSES: Course[] = [
  {
    id: 'start',
    name: 'はじまりのレーン',
    cost: 0,
    stages: stages([10, 20, 30, 40, 50], [
      [],
      [{ kind: 'post', x: 0, y: 10 }],
      [{ kind: 'post', x: -0.6, y: 9 }, { kind: 'post', x: 0.6, y: 9 }],
      [{ kind: 'wall', x: 0, y: 15, halfLen: 0.3 }],
      [{ kind: 'slider', y: 10, halfLen: 0.4, range: 0.9, period: 3 }],
    ]),
  },
  {
    id: 'moving',
    name: 'うごくカベ',
    cost: 300,
    stages: stages([30, 40, 50, 60, 70], [
      [{ kind: 'slider', y: 10, halfLen: 0.5, range: 0.8, period: 2.5 }],
      [{ kind: 'slider', y: 12, halfLen: 0.6, range: 0.7, period: 1.6 }],
      [
        { kind: 'slider', y: 8, halfLen: 0.45, range: 0.9, period: 2.2 },
        { kind: 'slider', y: 13, halfLen: 0.45, range: 0.9, period: 2.2, phase: 0.5 },
      ],
      [
        { kind: 'slider', y: 11, halfLen: 0.5, range: 0.8, period: 1.8 },
        { kind: 'post', x: -0.9, y: 14 },
        { kind: 'post', x: 0.9, y: 14 },
      ],
      [
        { kind: 'slider', y: 7, halfLen: 0.4, range: 0.9, period: 1.5 },
        { kind: 'slider', y: 10.5, halfLen: 0.4, range: 0.9, period: 2.1, phase: 0.3 },
        { kind: 'slider', y: 14, halfLen: 0.4, range: 0.9, period: 1.7, phase: 0.6 },
      ],
    ]),
  },
  {
    id: 'spin',
    name: 'くるくるバー',
    cost: 1000,
    stages: stages([40, 50, 55, 60, 70], [
      [{ kind: 'spinner', x: 0, y: 11, halfLen: 0.6, period: 3 }],
      [{ kind: 'spinner', x: 0, y: 12, halfLen: 0.8, period: 2 }],
      [
        { kind: 'spinner', x: -0.7, y: 10, halfLen: 0.5, period: 2.4 },
        { kind: 'spinner', x: 0.7, y: 10, halfLen: 0.5, period: -2.4 },
      ],
      [
        { kind: 'spinner', x: 0, y: 9, halfLen: 0.4, period: 2.5 },
        { kind: 'post', x: -0.8, y: 14 },
        { kind: 'post', x: 0.8, y: 14 },
      ],
      [
        { kind: 'spinner', x: -0.7, y: 8, halfLen: 0.4, period: 1.8 },
        { kind: 'spinner', x: 0.7, y: 11, halfLen: 0.4, period: -1.8 },
        { kind: 'spinner', x: 0, y: 14, halfLen: 0.4, period: 2.2 },
      ],
    ]),
  },
  {
    id: 'guard',
    name: 'ピンのまもりて',
    cost: 2500,
    stages: stages([50, 60, 65, 70, 80], [
      [{ kind: 'slider', y: 16.8, halfLen: 0.5, range: 0.8, period: 2.5 }],
      [{ kind: 'wall', x: 0, y: 16.8, halfLen: 0.35 }, { kind: 'slider', y: 11, halfLen: 0.5, range: 0.8, period: 2 }],
      [{ kind: 'spinner', x: 0, y: 16.6, halfLen: 0.5, period: 2.5 }, { kind: 'post', x: 0, y: 10 }],
      [
        { kind: 'slider', y: 16.8, halfLen: 0.4, range: 0.9, period: 1.6 },
        { kind: 'spinner', x: 0, y: 11, halfLen: 0.6, period: 2 },
      ],
      [
        { kind: 'spinner', x: -0.6, y: 16.6, halfLen: 0.4, period: 1.8 },
        { kind: 'spinner', x: 0.6, y: 16.6, halfLen: 0.4, period: -1.8 },
        { kind: 'slider', y: 10, halfLen: 0.45, range: 0.9, period: 1.7 },
      ],
    ]),
  },
]

export const findCourse = (id: string) => COURSES.find((c) => c.id === id)

export function obstacleAt(def: ObstacleDef, t: number): Obstacle {
  const still = { vx: 0, vy: 0, omega: 0, cx: 0, cy: 0 }
  switch (def.kind) {
    case 'post':
      return { ...still, ax: def.x, ay: def.y, bx: def.x, by: def.y, r: POST_RADIUS }
    case 'wall':
      return { ...still, ax: def.x - def.halfLen, ay: def.y, bx: def.x + def.halfLen, by: def.y, r: OBSTACLE_RADIUS }
    case 'slider': {
      const w = (2 * Math.PI) / def.period
      const phase = (def.phase ?? 0) * 2 * Math.PI
      const cx = def.range * Math.sin(w * t + phase)
      const vx = def.range * w * Math.cos(w * t + phase)
      return { ...still, ax: cx - def.halfLen, ay: def.y, bx: cx + def.halfLen, by: def.y, r: OBSTACLE_RADIUS, vx }
    }
    case 'spinner': {
      const omega = (2 * Math.PI) / def.period
      const angle = omega * t + (def.phase ?? 0) * 2 * Math.PI
      const ux = Math.cos(angle) * def.halfLen
      const uy = Math.sin(angle) * def.halfLen
      return {
        ...still,
        ax: def.x - ux,
        ay: def.y - uy,
        bx: def.x + ux,
        by: def.y + uy,
        r: OBSTACLE_RADIUS,
        omega,
        cx: def.x,
        cy: def.y,
      }
    }
  }
}

export const obstaclesAt = (defs: ObstacleDef[], t: number) => defs.map((d) => obstacleAt(d, t))
