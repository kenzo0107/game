const BPM = 168
const EIGHTH = 60 / BPM / 2
const LOOKAHEAD = 0.15

const R = 0
const MELODY = [
  74, R, 74, 75, 74, 70, 69, R,
  67, R, 69, 70, 69, 67, 62, R,
  74, R, 74, 75, 79, 75, 74, 70,
  69, R, R, R, 69, 70, 69, 67,
  79, R, 79, 81, 79, 75, 74, R,
  75, 74, 70, R, 70, 69, 67, R,
  62, 63, 67, 69, 70, 74, 75, 79,
  81, R, 79, R, 74, R, R, R,
]
const BASS_ROOTS = [38, 43, 38, 45, 43, 34, 38, 45]
const TAIKO_STEPS = new Set([0, 3, 4])

const midiToHz = (n: number) => 440 * 2 ** ((n - 69) / 12)

export class Sound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private step = 0
  private nextTime = 0
  private timer: number | null = null
  muted = false

  constructor() {
    try {
      this.muted = localStorage.getItem('bowling-100-muted') === '1'
    } catch {
      this.muted = false
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if ('speechSynthesis' in window) speechSynthesis.cancel()
        void this.ctx?.suspend()
      } else {
        void this.ctx?.resume()
      }
    })
  }

  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.connect(this.ctx.destination)
      this.noise = this.createNoise(this.ctx)
      this.applyMute()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    this.startMusic()
  }

  toggleMute() {
    this.muted = !this.muted
    this.applyMute()
    try {
      localStorage.setItem('bowling-100-muted', this.muted ? '1' : '0')
    } catch {
      return
    }
  }

  private applyMute() {
    if (this.muted && 'speechSynthesis' in window) speechSynthesis.cancel()
    this.master?.gain.setValueAtTime(this.muted ? 0 : 0.5, this.ctx!.currentTime)
  }

  private createNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return buffer
  }

  private tone(freq: number, start: number, duration: number, type: OscillatorType, volume: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    gain.gain.setValueAtTime(volume, start)
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
    osc.connect(gain).connect(this.master!)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  }

  private hit(start: number, duration: number, volume: number, filterFreq: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = filterFreq
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, start)
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
    src.connect(filter).connect(gain).connect(this.master!)
    src.start(start)
    src.stop(start + duration)
  }

  private taiko(start: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(110, start)
    osc.frequency.exponentialRampToValueAtTime(45, start + 0.25)
    gain.gain.setValueAtTime(0.45, start)
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35)
    osc.connect(gain).connect(this.master!)
    osc.start(start)
    osc.stop(start + 0.4)
  }

  private startMusic() {
    if (this.timer !== null || !this.ctx) return
    this.nextTime = this.ctx.currentTime + 0.05
    this.timer = window.setInterval(() => this.scheduleMusic(), 25)
  }

  private scheduleMusic() {
    const ctx = this.ctx!
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      const i = this.step % MELODY.length
      const note = MELODY[i]
      if (note !== R) this.tone(midiToHz(note), this.nextTime, EIGHTH * 1.4, 'sawtooth', 0.06)
      const root = BASS_ROOTS[Math.floor(i / 8)]
      this.tone(midiToHz(i % 2 === 0 ? root : root + 12), this.nextTime, EIGHTH * 0.7, 'triangle', 0.2)
      const beat = i % 8
      const fill = Math.floor(i / 8) % 4 === 3 && beat >= 6
      if (TAIKO_STEPS.has(beat) || fill) this.taiko(this.nextTime)
      if (beat === 2 || beat === 6) this.hit(this.nextTime, 0.12, 0.12, 1800)
      this.nextTime += EIGHTH
      this.step++
    }
  }

  private now() {
    return this.ctx ? this.ctx.currentTime : null
  }

  throwBall() {
    const t = this.now()
    if (t === null) return
    this.hit(t, 0.6, 0.25, 300)
  }

  pins(count: number) {
    const t = this.now()
    if (t === null || count === 0) return
    this.hit(t, 0.12, Math.min(0.6, 0.15 + count * 0.04), 2500)
    this.tone(900 + Math.random() * 400, t, 0.05, 'square', 0.03)
  }

  rouletteTick() {
    const t = this.now()
    if (t === null) return
    this.tone(1320, t, 0.04, 'square', 0.05)
  }

  bonus(multiplier: number) {
    const t = this.now()
    if (t === null) return
    const notes = multiplier >= 5 ? [72, 76, 79, 84, 88] : multiplier >= 2 ? [72, 76, 79] : [72]
    notes.forEach((n, i) => this.tone(midiToHz(n), t + i * 0.08, 0.15, 'square', 0.08))
  }

  fanfare() {
    const t = this.now()
    if (t === null) return
    ;[72, 76, 79, 84, 79, 84].forEach((n, i) => this.tone(midiToHz(n), t + i * 0.12, 0.2, 'square', 0.09))
  }

  fail() {
    const t = this.now()
    if (t === null) return
    ;[67, 64, 60, 55].forEach((n, i) => this.tone(midiToHz(n), t + i * 0.18, 0.25, 'triangle', 0.15))
  }

  say(text: string | null, interrupt = true) {
    if (!text || this.muted || !('speechSynthesis' in window)) return
    if (interrupt) speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ja-JP'
    utterance.rate = 1.3
    utterance.pitch = 1.8
    const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('ja'))
    if (voice) utterance.voice = voice
    speechSynthesis.speak(utterance)
  }
}
