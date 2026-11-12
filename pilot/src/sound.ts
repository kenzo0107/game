import { Surface } from './terrain';

const readArcadeMute = (): boolean => {
  try {
    return localStorage.getItem('arcadeSound') === 'off';
  } catch {
    return false;
  }
};

export class Sound {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private rolling: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private muted = readArcadeMute();

  constructor() {
    // ブラウザはユーザー操作の中でしか音を鳴らし始められないため、最初の操作で AudioContext を作る
    const unlock = () => this.context();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private context(): AudioContext | null {
    if (this.muted || typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const length = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  public existingContext(): AudioContext | null {
    return this.muted ? null : this.ctx;
  }

  private noiseSource(ctx: AudioContext, loop = false): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = loop;
    return source;
  }

  private envelope(ctx: AudioContext, peak: number, attack: number, decay: number): GainNode {
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    gain.connect(ctx.destination);
    return gain;
  }

  public touchdown(strength: number): void {
    const ctx = this.context();
    if (!ctx) return;
    const t = ctx.currentTime;
    const duration = 0.25 + strength * 0.3;

    const screech = ctx.createBiquadFilter();
    screech.type = 'bandpass';
    screech.Q.value = 3;
    screech.frequency.setValueAtTime(2600, t);
    screech.frequency.exponentialRampToValueAtTime(1300, t + duration);
    const scrape = this.noiseSource(ctx);
    scrape.connect(screech).connect(this.envelope(ctx, 0.25 + strength * 0.35, 0.01, duration));
    scrape.start(t, Math.random());
    scrape.stop(t + duration + 0.05);

    const squeal = ctx.createOscillator();
    squeal.type = 'sawtooth';
    squeal.frequency.setValueAtTime(1500, t);
    squeal.frequency.exponentialRampToValueAtTime(800, t + duration);
    const squealFilter = ctx.createBiquadFilter();
    squealFilter.type = 'bandpass';
    squealFilter.frequency.value = 1200;
    squealFilter.Q.value = 6;
    squeal.connect(squealFilter).connect(this.envelope(ctx, 0.05 + strength * 0.08, 0.01, duration * 0.8));
    squeal.start(t);
    squeal.stop(t + duration);
  }

  public setRolling(speed: number, surface: Surface | null): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    if (!this.rolling) {
      if (surface === null) return;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const source = this.noiseSource(ctx, true);
      source.connect(filter).connect(gain).connect(ctx.destination);
      source.start();
      this.rolling = { gain, filter };
    }
    const t = ctx.currentTime;
    const amount = surface === null ? 0 : Math.min(1, speed / 12);
    const rough = surface === 'grass';
    this.rolling.gain.gain.setTargetAtTime(amount * (rough ? 0.35 : 0.18), t, 0.05);
    this.rolling.filter.frequency.setTargetAtTime((rough ? 250 : 500) + speed * (rough ? 30 : 70), t, 0.05);
  }

  public crash(): void {
    const ctx = this.context();
    if (!ctx) return;
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 1.2);
    const boom = this.noiseSource(ctx);
    boom.connect(filter).connect(this.envelope(ctx, 0.7, 0.01, 1.3));
    boom.start(t);
    boom.stop(t + 1.4);
  }

  private notes(list: [number, number, number][], type: OscillatorType = 'triangle', peak = 0.15): void {
    const ctx = this.context();
    if (!ctx) return;
    for (const [freq, delay, length] of list) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + length + 0.02);
    }
  }

  public ring(): void {
    this.notes([[988, 0, 0.12], [1319, 0.08, 0.3]], 'square', 0.06);
  }

  public lowAltitude(): void {
    this.notes([[880, 0, 0.18], [660, 0.2, 0.25]], 'sine', 0.12);
  }

  public clear(): void {
    const ctx = this.context();
    if (!ctx) return;
    this.notes(
      [[392, 0, 0.12], [523, 0.13, 0.12], [659, 0.26, 0.12], [784, 0.39, 0.28], [659, 0.7, 0.12], [784, 0.83, 0.3]],
      'square',
      0.07,
    );
    this.notes([[523, 1.15, 1.5], [659, 1.15, 1.5], [784, 1.15, 1.5], [1047, 1.15, 1.6]], 'sawtooth', 0.035);
    this.notes([[1047, 1.15, 1.6], [1319, 1.15, 1.6]], 'square', 0.04);
    this.notes([[131, 0, 0.3], [98, 0.39, 0.3], [131, 0.7, 0.4], [65, 1.15, 1.6]], 'triangle', 0.2);
    this.notes([[2093, 1.25, 0.25], [2637, 1.35, 0.25], [3136, 1.45, 0.25], [4186, 1.55, 0.6]], 'sine', 0.05);

    const cymbal = this.noiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const gain = ctx.createGain();
    const t = ctx.currentTime + 1.15;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    cymbal.connect(filter).connect(gain).connect(ctx.destination);
    cymbal.start(t);
    cymbal.stop(t + 1.5);
  }
}
