export type VoiceEvent =
  | { kind: 'strike'; streak: number }
  | { kind: 'spare' }
  | { kind: 'gutter' }
  | { kind: 'knocked'; count: number; left: number }
  | { kind: 'miss' }
  | { kind: 'bonus'; multiplier: number }
  | { kind: 'stageClear' }
  | { kind: 'stageFail' }
  | { kind: 'unlock' }
  | { kind: 'gameOver'; score: number }

const pick = (lines: string[], rand: number) => lines[Math.floor(rand * lines.length) % lines.length]

const CHEERS = ['イェーイ！', 'よっしゃー！', 'ヒャッホー！']
const OOPS = ['あちゃー！', 'おっとっと！']
const POSITIVE: VoiceEvent['kind'][] = ['strike', 'spare', 'bonus', 'stageClear', 'unlock']
const NEGATIVE: VoiceEvent['kind'][] = ['gutter', 'miss', 'stageFail']

export function characterLine(event: VoiceEvent, rand: number): string | null {
  const line = voiceLine(event, rand)
  if (!line) return null
  if (POSITIVE.includes(event.kind)) return pick(CHEERS, rand) + line
  if (NEGATIVE.includes(event.kind)) return pick(OOPS, rand) + line
  return line
}

function strikeLine(streak: number, rand: number): string {
  if (streak >= 10) return `${streak}回れんぞくストライク！めっちゃめっちゃすごい！てんさいだね！`
  if (streak >= 4) return pick([`${streak}回れんぞくストライク！とまらないね！`, `${streak}回れんぞく！すごすぎる！`], rand)
  if (streak === 3) return 'ターキー！3回れんぞくストライク！すごすぎる！'
  if (streak === 2) return 'ダブル！2回れんぞくストライク！めっちゃすごいね！'
  return pick(['ストライク！めっちゃすごいね！', 'ストライク！やったね！かっこいい！', 'ぜんぶたおしたよ！ストライク！'], rand)
}

export function voiceLine(event: VoiceEvent, rand: number): string | null {
  switch (event.kind) {
    case 'strike':
      return strikeLine(event.streak, rand)
    case 'spare':
      return pick(['スペア！ナイス！', 'スペア！よくがんばったね！'], rand)
    case 'gutter':
      return pick(['ガター！もういっかい！', 'ドンマイ！もういっかい投げよう！'], rand)
    case 'knocked':
      if (event.count >= 70) return pick([`すごい！${event.count}本！`, `いいね！${event.count}本たおしたよ！`], rand)
      if (event.left <= 10) return `おしい！あと${event.left}本！`
      return `${event.count}本！`
    case 'miss':
      return 'ざんねん！'
    case 'bonus':
      return event.multiplier >= 5 ? `${event.multiplier}倍！ラッキー！` : null
    case 'stageClear':
      return 'ステージクリア！おめでとう！'
    case 'stageFail':
      return 'ざんねん！もういっかいチャレンジしよう！'
    case 'unlock':
      return 'あたらしいコースがひらいたよ！'
    case 'gameOver':
      return `おつかれさま！${event.score}点だったよ！`
  }
}
