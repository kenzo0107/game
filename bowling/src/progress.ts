import { COURSES, findCourse } from './challenge'

export interface Progress {
  points: number
  unlocked: string[]
  cleared: Record<string, number>
}

const STORAGE_KEY = 'bowling-100-progress'

export const MULTIPLIERS: { value: number; weight: number }[] = [
  { value: 1, weight: 40 },
  { value: 2, weight: 30 },
  { value: 3, weight: 18 },
  { value: 5, weight: 10 },
  { value: 10, weight: 2 },
]

export function pickMultiplier(rand: number): number {
  const total = MULTIPLIERS.reduce((sum, m) => sum + m.weight, 0)
  let threshold = rand * total
  for (const m of MULTIPLIERS) {
    threshold -= m.weight
    if (threshold < 0) return m.value
  }
  return MULTIPLIERS[MULTIPLIERS.length - 1].value
}

export const initialProgress = (): Progress => ({ points: 0, unlocked: [COURSES[0].id], cleared: {} })

export function canUnlock(p: Progress, courseId: string): boolean {
  const course = findCourse(courseId)
  return !!course && !p.unlocked.includes(courseId) && p.points >= course.cost
}

export function unlock(p: Progress, courseId: string): Progress {
  if (!canUnlock(p, courseId)) return p
  const cost = findCourse(courseId)!.cost
  return { ...p, points: p.points - cost, unlocked: [...p.unlocked, courseId] }
}

export const isStagePlayable = (p: Progress, courseId: string, stage: number) =>
  p.unlocked.includes(courseId) && stage <= (p.cleared[courseId] ?? 0)

export function clearStage(p: Progress, courseId: string, stage: number): Progress {
  const cleared = Math.max(p.cleared[courseId] ?? 0, stage + 1)
  return { ...p, cleared: { ...p.cleared, [courseId]: cleared } }
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...initialProgress(), ...JSON.parse(raw) } : initialProgress()
  } catch {
    return initialProgress()
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    // 例外を投げ直さない: 保存できない環境（プライベートブラウズ等）でもプレイ自体は止めたくない
  }
}
