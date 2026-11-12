import { Song, SONGS } from './songs';

export type MusicMode = 'off' | 'menu' | 'flight';

const LOOKAHEAD = 0.3;
const VOLUME: Record<Exclude<MusicMode, 'off'>, number> = { menu: 0.3, flight: 0.38 };

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export class Music {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private dry!: GainNode;
  private reverb!: GainNode;
  private echo!: GainNode;
  private delay!: DelayNode;
  private epBus!: StereoPannerNode;
  private noise!: AudioBuffer;
  private mode: MusicMode = 'off';
  private song: Song;
  private sectionStarts: number[] = [];
  private loopSteps = 0;
  private step = 0;
  private nextTime = 0;

  constructor(
    private readonly getContext: () => AudioContext | null,
    songIndex = 0,
  ) {
    this.song = SONGS[songIndex] ?? SONGS[0];
    this.indexSong();
    window.setInterval(() => this.schedule(), 50);
  }

  private get stepSeconds(): number {
    return 60 / this.song.bpm / 4;
  }

  private indexSong(): void {
    let offset = 0;
    this.sectionStarts = this.song.form.map((section) => {
      const start = offset;
      offset += section.chords.length * this.song.stepsPerBar;
      return start;
    });
    this.loopSteps = offset;
  }

  public setSong(index: number): void {
    this.song = SONGS[index] ?? SONGS[0];
    this.indexSong();
    if (!this.ctx || this.mode === 'off') return;
    // 先読みで予約済みの前の曲の音が新しい曲と重ならないよう、いったん絞ってから頭出しする
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 0.15);
    this.master.gain.linearRampToValueAtTime(VOLUME[this.mode], t + 1);
    this.delay.delayTime.setValueAtTime(this.stepSeconds * 3, t);
    this.restart(t + LOOKAHEAD);
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
      this.master.gain.linearRampToValueAtTime(VOLUME[mode], t + 1.2);
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

    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = this.stepSeconds * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2200;
    this.echo = ctx.createGain();
    this.echo.gain.value = 0.28;
    this.echo.connect(this.delay).connect(damp).connect(feedback).connect(this.delay);
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
    if (this.mode !== 'off') this.master.gain.linearRampToValueAtTime(VOLUME[this.mode], t + 2);
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
      const { swing, swingUnit } = this.song;
      const offbeat = this.step % (swingUnit * 2) === swingUnit;
      this.playStep(this.step, this.nextTime + (offbeat ? swing * this.stepSeconds : 0));
      this.advance();
    }
  }

  private advance(): void {
    this.step = (this.step + 1) % this.loopSteps;
    this.nextTime += this.stepSeconds;
  }

  private playStep(step: number, t: number): void {
    const song = this.song;
    const sectionIndex = this.sectionStarts.filter((start) => start <= step).length - 1;
    const section = song.form[sectionIndex];
    const inSection = step - this.sectionStarts[sectionIndex];
    const bar = Math.floor(inSection / song.stepsPerBar);
    const beat = inSection % song.stepsPerBar;
    const { bass, voicing } = section.chords[bar];
    const flight = this.mode === 'flight';
    const unit = this.stepSeconds;
    const barLength = unit * song.stepsPerBar;
    const comp = song.comp.voice === 'pluck' ? this.pluck.bind(this) : this.ep.bind(this);
    const roll = (at: number, octave: number, length: number, velocity: number) =>
      voicing.forEach((midi, i) => comp(at + i * unit * 1.5, midi + octave, length, velocity));

    if (beat === 0) {
      this.pad(t, voicing, barLength);
      if (!flight) roll(t, 12, barLength, 0.5);
    }
    for (const [at, interval, length] of flight ? song.bass.flight : song.bass.menu) {
      if (at === beat) this.bass(t, bass + interval, length * unit);
    }
    if (!flight) return;

    for (const [at, length] of song.comp.flight) {
      if (at !== beat) continue;
      const velocity = at === 0 ? 0.8 : 0.6;
      if (song.comp.roll) roll(t, 0, length * unit, velocity);
      else voicing.forEach((midi) => comp(t, midi, length * unit, velocity));
    }
    for (const [at, midi, length] of section.melody) {
      if (at !== inSection) continue;
      if (song.lead === 'vibes') this.vibes(t, midi, length * unit);
      else this.lead(t, midi, length * unit);
    }
    if (song.drums.kick.includes(beat)) this.kick(t);
    if (song.drums.rim.includes(beat)) this.rim(t);
    for (const [at, velocity] of song.drums.hat) {
      if (at === beat) this.hat(t, velocity);
    }
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

  // ナイロンギター: 倍音の多いのこぎり波を、弦をはじいた直後だけ明るく開いたフィルターで素早く丸める
  private pluck(t: number, midi: number, length: number, velocity: number): void {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(3200, t);
    filter.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    filter.connect(this.envelope(t, 0.05 * velocity, 0.003, Math.min(length, 0.6), 0.8, this.epBus));
    this.osc('sawtooth', hz(midi), t, t + length + 1).connect(filter);
  }

  private vibes(t: number, midi: number, length: number): void {
    const ctx = this.ctx!;
    const f = hz(midi);
    const end = t + length + 2;
    const carrier = this.osc('sine', f, t, end);
    const modulator = this.osc('sine', f * 4, t, end);
    const index = ctx.createGain();
    index.gain.setValueAtTime(f * 1.2, t);
    index.gain.exponentialRampToValueAtTime(f * 0.01, t + 0.3);
    modulator.connect(index).connect(carrier.frequency);
    const out = this.envelope(t, 0.07, 0.004, length, 1.5, this.epBus);
    out.connect(this.echo);
    carrier.connect(out);
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
