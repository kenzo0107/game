import { describe, expect, it } from 'vitest'
import { COURSES } from './challenge'
import { canUnlock, clearStage, initialProgress, isStagePlayable, pickMultiplier, unlock } from './progress'

describe('pickMultiplier', () => {
  it('乱数の範囲に応じて ×1〜×10 を返す', () => {
    expect(pickMultiplier(0)).toBe(1)
    expect(pickMultiplier(0.5)).toBe(2)
    expect(pickMultiplier(0.999)).toBe(10)
  })
})

describe('コース解放', () => {
  it('最初のコースだけ最初から遊べる', () => {
    const p = initialProgress()
    expect(isStagePlayable(p, COURSES[0].id, 0)).toBe(true)
    expect(isStagePlayable(p, COURSES[1].id, 0)).toBe(false)
  })

  it('ポイントが足りなければ解放できない', () => {
    const p = { ...initialProgress(), points: COURSES[1].cost - 1 }
    expect(canUnlock(p, COURSES[1].id)).toBe(false)
    expect(unlock(p, COURSES[1].id)).toBe(p)
  })

  it('解放するとポイントを消費して遊べるようになる', () => {
    const p = unlock({ ...initialProgress(), points: 500 }, COURSES[1].id)
    expect(p.points).toBe(500 - COURSES[1].cost)
    expect(isStagePlayable(p, COURSES[1].id, 0)).toBe(true)
  })
})

describe('ステージ進行', () => {
  it('前のステージをクリアすると次のステージが遊べる', () => {
    const id = COURSES[0].id
    const p = clearStage(initialProgress(), id, 0)
    expect(isStagePlayable(p, id, 1)).toBe(true)
    expect(isStagePlayable(p, id, 2)).toBe(false)
  })

  it('目標本数はステージが進むほど上がる', () => {
    COURSES.forEach((c) => {
      const targets = c.stages.map((s) => s.target)
      expect(targets).toEqual([...targets].sort((a, b) => a - b))
    })
  })
})
