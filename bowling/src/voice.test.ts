import { describe, expect, it } from 'vitest'
import { characterLine, voiceLine } from './voice'

describe('voiceLine', () => {
  it('1回のストライクでもめっちゃほめる', () => {
    expect(voiceLine({ kind: 'strike', streak: 1 }, 0)).toBe('ストライク！めっちゃすごいね！')
  })

  it('連続ストライクは回数を言ってほめる', () => {
    expect(voiceLine({ kind: 'strike', streak: 2 }, 0)).toContain('ダブル')
    expect(voiceLine({ kind: 'strike', streak: 3 }, 0)).toContain('ターキー')
    expect(voiceLine({ kind: 'strike', streak: 5 }, 0)).toContain('5回れんぞく')
    expect(voiceLine({ kind: 'strike', streak: 10 }, 0)).toContain('10回れんぞくストライク！めっちゃめっちゃすごい')
  })

  it('ガターではもう一回うながす', () => {
    expect(voiceLine({ kind: 'gutter' }, 0)).toContain('もういっかい')
  })

  it('残りが少ないと「おしい」と残り本数を言う', () => {
    expect(voiceLine({ kind: 'knocked', count: 93, left: 7 }, 0)).toContain('93本')
    expect(voiceLine({ kind: 'knocked', count: 40, left: 5 }, 0)).toBe('おしい！あと5本！')
  })

  it('小さい倍率ではしゃべらない', () => {
    expect(voiceLine({ kind: 'bonus', multiplier: 2 }, 0)).toBeNull()
    expect(voiceLine({ kind: 'bonus', multiplier: 10 }, 0)).toBe('10倍！ラッキー！')
  })

  it('乱数が 1 に近くてもセリフが選べる', () => {
    expect(voiceLine({ kind: 'strike', streak: 1 }, 0.9999)).not.toBeUndefined()
  })
})

describe('characterLine', () => {
  it('うれしい場面ではかけ声を付ける', () => {
    expect(characterLine({ kind: 'strike', streak: 1 }, 0)).toBe('イェーイ！ストライク！めっちゃすごいね！')
  })

  it('失敗した場面では残念そうなかけ声を付ける', () => {
    expect(characterLine({ kind: 'gutter' }, 0)).toBe('あちゃー！ガター！もういっかい！')
  })

  it('ふつうの本数ではかけ声を付けない', () => {
    expect(characterLine({ kind: 'knocked', count: 30, left: 50 }, 0)).toBe('30本！')
  })
})
