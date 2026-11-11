export const PIN_COUNT = 100
export const FRAMES = 10

export function splitFrames(rolls: number[], pins = PIN_COUNT): number[][] {
  const frames: number[][] = []
  let i = 0
  while (i < rolls.length && frames.length < FRAMES - 1) {
    const size = rolls[i] === pins ? 1 : 2
    frames.push(rolls.slice(i, i + size))
    i += size
  }
  if (i < rolls.length) frames.push(rolls.slice(i, i + 3))
  return frames
}

function isFrameComplete(frame: number[], isTenth: boolean, pins: number): boolean {
  if (!isTenth) return frame[0] === pins || frame.length === 2
  if (frame.length === 3) return true
  return frame.length === 2 && frame[0] + frame[1] < pins
}

export function isGameOver(rolls: number[], pins = PIN_COUNT): boolean {
  const frames = splitFrames(rolls, pins)
  return frames.length === FRAMES && isFrameComplete(frames[FRAMES - 1], true, pins)
}

export interface NextRoll {
  frame: number
  rollInFrame: number
  freshRack: boolean
}

export function nextRoll(rolls: number[], pins = PIN_COUNT): NextRoll {
  const frames = splitFrames(rolls, pins)
  const last = frames[frames.length - 1]
  if (!last || isFrameComplete(last, frames.length === FRAMES, pins)) {
    return { frame: frames.length, rollInFrame: 0, freshRack: true }
  }
  const [a, b] = last
  const freshRack = last.length === 1 ? a === pins : a === pins ? b === pins : a + b === pins
  return { frame: frames.length - 1, rollInFrame: last.length, freshRack }
}

export function cumulativeScores(rolls: number[], pins = PIN_COUNT): (number | null)[] {
  const scores: (number | null)[] = []
  let total = 0
  let i = 0
  for (let f = 0; f < FRAMES; f++) {
    const [a, b, c] = rolls.slice(i, i + 3)
    if (a === pins) {
      if (c === undefined) break
      total += pins + b + c
      i += 1
    } else {
      if (b === undefined) break
      if (a + b === pins) {
        if (c === undefined) break
        total += pins + c
      } else {
        total += a + b
      }
      i += 2
    }
    scores.push(total)
  }
  return [...scores, ...Array<null>(FRAMES - scores.length).fill(null)]
}

export function frameMarks(frame: number[], pins = PIN_COUNT): string[] {
  let standing = pins
  return frame.map((n) => {
    if (standing === pins && n === pins) return 'X'
    if (n === standing) {
      standing = pins
      return '/'
    }
    standing -= n
    return n === 0 ? '-' : String(n)
  })
}
