export type MusicMode = 'off' | 'menu' | 'flight';

type Chord = { bass: number; voicing: number[] };
type Note = [step: number, midi: number, length: number];

const BPM = 86;
const STEP = 60 / BPM / 4;
const STEPS_PER_BAR = 16;
const SWING = STEP * 0.12;
const LOOKAHEAD = 0.3;

const chord = (bass: number, ...voicing: number[]): Chord => ({ bass, voicing });

const SECTION_A: Chord[] = [
  chord(38, 54, 57, 61, 64), // Dmaj9
  chord(35, 57, 61, 62, 66), // Bm9
  chord(31, 54, 57, 59, 62), // Gmaj9
  chord(33, 55, 59, 62, 64), // A7sus4
  chord(30, 57, 61, 64, 66), // F#m7
  chord(35, 57, 61, 62, 66), // Bm9
  chord(28, 55, 59, 62, 66), // Em9
  chord(31, 55, 58, 62, 64), // Gm6
];

const SECTION_B: Chord[] = [
  chord(34, 57, 60, 62, 65), // Bbmaj9
  chord(36, 55, 59, 62, 64), // C6/9
  chord(38, 54, 57, 61, 64), // Dmaj9
  chord(35, 57, 61, 62, 66), // Bm9
  chord(31, 54, 57, 59, 62), // Gmaj9
  chord(30, 57, 61, 64, 66), // F#m7
  chord(28, 55, 59, 62, 66), // Em9
  chord(33, 55, 59, 62, 64), // A7sus4
];

const MELODY_A: Note[] = [
  [4, 69, 2], [6, 71, 2], [8, 73, 6], [14, 76, 2],
  [16, 78, 8], [24, 76, 4], [28, 73, 4],
  [32, 74, 6], [38, 71, 2], [40, 69, 8],
  [54, 71, 2], [56, 69, 2], [58, 67, 2], [60, 64, 4],
  [66, 69, 2], [68, 73, 2], [70, 76, 10],
  [82, 78, 2], [84, 76, 2], [86, 74, 2], [88, 73, 8],
  [96, 71, 4], [100, 74, 4], [104, 78, 8],
  [112, 76, 6], [118, 74, 2], [120, 70, 8],
];

const MELODY_B: Note[] = [
  [0, 74, 4], [4, 77, 4], [8, 76, 8],
  [16, 74, 4], [20, 79, 4], [24, 76, 8],
  [32, 78, 12], [44, 76, 2], [46, 78, 2],
  [48, 81, 8], [56, 78, 4], [60, 74, 4],
  [64, 76, 4], [68, 78, 4], [72, 74, 6], [78, 71, 2],
  [80, 73, 8], [88, 69, 4], [92, 73, 4],
  [96, 71, 2], [98, 74, 2], [100, 78, 4], [104, 76, 8],
  [112, 74, 6], [118, 76, 2], [120, 69, 8],
];

// A(メロ) → B(メロ) → A(伴奏のみ) → B(伴奏のみ)。メロディを常に鳴らすと長いフライトで耳につくため、半分は伴奏だけにする
const FORM = [
  { chords: SECTION_A, melody: MELODY_A },
  { chords: SECTION_B, melody: MELODY_B },
  { chords: SECTION_A, melody: [] },
  { chords: SECTION_B, melody: [] },
];
const SECTION_STEPS = SECTION_A.length * STEPS_PER_BAR;
const LOOP_STEPS = FORM.length * SECTION_STEPS;

const BASS_FLIGHT: Note[] = [[0, 0, 5], [6, 7, 2], [10, 12, 2], [12, 0, 3], [14, 7, 2]];
const BASS_MENU: Note[] = [[0, 0, 10], [10, 7, 6]];
const COMP_FLIGHT: [step: number, length: number][] = [[0, 5], [7, 2], [10, 5]];

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export class Music {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private dry!: GainNode;
  private reverb!: GainNode;
  private echo!: GainNode;
  private epBus!: StereoPannerNode;
  private noise!: AudioBuffer;
  private mode: MusicMode = 'off';
  private step = 0;
  private nextTime = 0;

  constructor(private readonly getContext: () => AudioContext | null) {
    window.setInterval(() => this.schedule(), 50);
  }

  public setMode(mode: MusicMode): void {
    if (mode === this.mode) return;
    const wasOff = this.mode === 'off';
    this.mode = mode;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    if (mode === 'off') {
      this.master.gain.linearRampToValueAtTime(0, t + 1.5);
    } else {
      if (wasOff) this.restart(t);
      this.master.gain.linearRampToValueAtTime(mode === 'menu' ? 0.3 : 0.38, t + 1.2);
    }
  }

  private restart(t: number): void {
    this.step = 0;
    this.nextTime = t + 0.1;
  }

  private setup(ctx: AudioContext): void {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 3;
    this.master.connect(compressor).connect(ctx.destination);

    this.dry = ctx.createGain();
    this.dry.connect(this.master);

    const convolver = ctx.createConvolver();
    convolver.buffer = this.impulse(ctx, 3.2);
    this.reverb = ctx.createGain();
    this.reverb.gain.value = 0.45;
    this.reverb.connect(convolver).connect(this.master);

    const delay = ctx.createDelay(2);
    delay.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2200;
    this.echo = ctx.createGain();
    this.echo.gain.value = 0.28;
    this.echo.connect(delay).connect(damp).connect(feedback).connect(delay);
    damp.connect(this.master);
    damp.connect(this.reverb);

    this.epBus = ctx.createStereoPanner();
    const tremolo = ctx.createOscillator();
    tremolo.frequency.value = 3.2;
    const depth = ctx.createGain();
    depth.gain.value = 0.35;
    tremolo.connect(depth).connect(this.epBus.pan);
    tremolo.start();
    this.epBus.connect(this.dry);
    this.epBus.connect(this.reverb);

    const length = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    const t = ctx.currentTime;
    this.restart(t);
    if (this.mode !== 'off') this.master.gain.linearRampToValueAtTime(this.mode === 'menu' ? 0.3 : 0.38, t + 2);
  }

  private impulse(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
    return buffer;
  }

  private schedule(): void {
    if (!this.ctx) {
      const ctx = this.getContext();
      if (!ctx) return;
      this.setup(ctx);
    }
    const ctx = this.ctx!;
    if (this.mode === 'off' || ctx.state !== 'running') return;
    // タブが裏に回るとタイマーが間引かれるので、遅れた分は鳴らさずに拍を進めてテンポの位置を保つ
    while (this.nextTime < ctx.currentTime) this.advance();
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime + (this.step % 2 === 1 ? SWING : 0));
      this.advance();
    }
  }

  private advance(): void {
    this.step = (this.step + 1) % LOOP_STEPS;
    this.nextTime += STEP;
  }

  private playStep(step: number, t: number): void {
    const section = FORM[Math.floor(step / SECTION_STEPS)];
    const inSection = step % SECTION_STEPS;
    const bar = Math.floor(inSection / STEPS_PER_BAR);
    const beat = inSection % STEPS_PER_BAR;
    const { bass, voicing } = section.chords[bar];
    const flight = this.mode === 'flight';
    const barLength = STEP * STEPS_PER_BAR;

    if (beat === 0) {
      this.pad(t, voicing, barLength);
      if (!flight) voicing.forEach((midi, i) => this.ep(t + i * STEP * 1.5, midi + 12, barLength, 0.5));
    }
    for (const [at, interval, length] of flight ? BASS_FLIGHT : BASS_MENU) {
      if (at === beat) this.bass(t, bass + interval, length * STEP);
    }
    if (!flight) return;

    for (const [at, length] of COMP_FLIGHT) {
      if (at === beat) voicing.forEach((midi) => this.ep(t, midi, length * STEP, at === 0 ? 0.8 : 0.6));
    }
    for (const [at, midi, length] of section.melody) {
      if (at === inSection) this.lead(t, midi, length * STEP);
    }
    if (beat === 0 || beat === 10) this.kick(t);
    if (beat === 4 || beat === 12) this.rim(t);
    if (beat % 2 === 0) this.hat(t, beat % 4 === 2 ? 0.7 : 0.4);
  }

  private envelope(t: number, peak: number, attack: number, hold: number, release: number, out: AudioNode): GainNode {
    const gain = this.ctx!.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.setTargetAtTime(peak * 0.6, t + attack, hold / 2);
    gain.gain.setTargetAtTime(0.0001, t + attack + hold, release / 4);
    gain.connect(out);
    return gain;
  }

  private osc(type: OscillatorType, freq: number, t: number, end: number): OscillatorNode {
    const osc = this.ctx!.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.start(t);
    osc.stop(end);
    return osc;
  }

  // エレピ: 矩形波などの素の波形はファミコン風に聞こえるため、正弦波の FM で減衰する金属的なアタックを作る
  private ep(t: number, midi: number, length: number, velocity: number): void {
    const ctx = this.ctx!;
    const f = hz(midi);
    const end = t + length + 1.2;
    const carrier = this.osc('sine', f, t, end);
    const modulator = this.osc('sine', f, t, end);
    const index = ctx.createGain();
    index.gain.setValueAtTime(f * 1.6 * velocity, t);
    index.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.8);
    modulator.connect(index).connect(carrier.frequency);
    carrier.connect(this.envelope(t, 0.045 * velocity, 0.004, length, 1, this.epBus));
  }

  private pad(t: number, voicing: number[], length: number): void {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.linearRampToValueAtTime(1100, t + length / 2);
    filter.frequency.linearRampToValueAtTime(600, t + length);
    const out = this.envelope(t, 0.035, length * 0.4, length * 0.6, 1.5, this.reverb);
    filter.connect(out);
    out.connect(this.dry);
    for (const midi of voicing) {
      for (const detune of [-7, 7]) {
        const osc = this.osc('sawtooth', hz(midi), t, t + length + 2);
        osc.detune.value = detune;
        osc.connect(filter);
      }
    }
  }

  private bass(t: number, midi: number, length: number): void {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.3);
    filter.connect(this.envelope(t, 0.22, 0.015, length, 0.25, this.dry));
    const end = t + length + 0.5;
    this.osc('triangle', hz(midi), t, end).connect(filter);
    this.osc('sine', hz(midi), t, end).connect(filter);
  }

  private lead(t: number, midi: number, length: number): void {
    const ctx = this.ctx!;
    const end = t + length + 1;
    const vibrato = this.osc('sine', 5, t, end);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(hz(midi) * 0.006, t + Math.min(length, 0.6));
    vibrato.connect(depth);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    const out = this.envelope(t, 0.06, 0.06, length * 0.9, 0.4, this.dry);
    filter.connect(out);
    out.connect(this.reverb);
    out.connect(this.echo);
    for (const [type, gain] of [['sine', 1], ['triangle', 0.5]] as const) {
      const osc = this.osc(type, hz(midi), t, end);
      depth.connect(osc.frequency);
      const level = ctx.createGain();
      level.gain.value = gain;
      osc.connect(level).connect(filter);
    }
  }

  private kick(t: number): void {
    const osc = this.osc('sine', 90, t, t + 0.4);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.15);
    const gain = this.ctx!.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gain).connect(this.dry);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, peak: number, decay: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    source.connect(filter).connect(gain).connect(out);
    source.start(t, Math.random() * 0.5);
    source.stop(t + decay + 0.05);
  }

  private rim(t: number): void {
    this.noiseHit(t, 'bandpass', 1800, 0.12, 0.12, this.dry);
    this.noiseHit(t, 'bandpass', 1800, 0.06, 0.2, this.reverb);
  }

  private hat(t: number, velocity: number): void {
    this.noiseHit(t, 'highpass', 7500, 0.05 * velocity, 0.05, this.dry);
  }
}
