import { describe, expect, it } from 'vitest'
import { cumulativeScores, frameMarks, isGameOver, nextRoll, splitFrames } from './scoring'

const P = 100

describe('cumulativeScores', () => {
  it('パーフェクトゲームは 3000 点', () => {
    const rolls = Array(12).fill(P)
    expect(cumulativeScores(rolls).at(-1)).toBe(3000)
    expect(isGameOver(rolls)).toBe(true)
  })

  it('ストライクの得点は次の 2 投が確定するまで未確定', () => {
    expect(cumulativeScores([P, 30])[0]).toBeNull()
    expect(cumulativeScores([P, 30, 20]).slice(0, 2)).toEqual([150, 200])
  })

  it('スペアは次の 1 投をボーナスに加える', () => {
    expect(cumulativeScores([60, 40, 50, 0]).slice(0, 2)).toEqual([150, 200])
  })

  it('全投オープンなら倒したピンの合計', () => {
    const rolls = Array(20).fill(10)
    expect(cumulativeScores(rolls).at(-1)).toBe(200)
    expect(isGameOver(rolls)).toBe(true)
  })
})

describe('nextRoll', () => {
  it('ストライク後は次フレームの新しいラック', () => {
    expect(nextRoll([P])).toEqual({ frame: 1, rollInFrame: 0, freshRack: true })
  })

  it('フレーム 1 投目の後は残ピンへの 2 投目', () => {
    expect(nextRoll([70])).toEqual({ frame: 0, rollInFrame: 1, freshRack: false })
  })

  it('10 フレームでストライク後の残ピンには 3 投目でラックを戻さない', () => {
    const rolls = [...Array(18).fill(0), P, 40]
    expect(nextRoll(rolls)).toEqual({ frame: 9, rollInFrame: 2, freshRack: false })
  })

  it('10 フレームでスペアなら 3 投目は新しいラック', () => {
    const rolls = [...Array(18).fill(0), 60, 40]
    expect(nextRoll(rolls)).toEqual({ frame: 9, rollInFrame: 2, freshRack: true })
  })
})

describe('splitFrames / frameMarks', () => {
  it('10 フレームの表示は X, 数字, スペア記号', () => {
    const frames = splitFrames([...Array(18).fill(0), P, 30, 70])
    expect(frames).toHaveLength(10)
    expect(frameMarks(frames[9])).toEqual(['X', '30', '/'])
  })

  it('0 本はハイフン表示', () => {
    expect(frameMarks([0, 0])).toEqual(['-', '-'])
  })
})
