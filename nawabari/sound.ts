// 音声ファイルを置くとビルドとホスティングの手間が増えるため、BGM・効果音はすべて Web Audio で合成する

const BGM_BPM = 132;
const HURRY_BPM = 156;
const STEPS_PER_BAR = 16;
const SCHEDULE_AHEAD_SEC = 0.12;
const PAINT_SOUND_INTERVAL_MS = 110;
const MUTE_STORAGE_KEY = 'nawabariMuted';

const BASS_ROOTS = [41, 43, 40, 45];
const CHORD_STABS = [
    [65, 69, 72],
    [67, 71, 74],
    [64, 67, 71],
    [64, 69, 72]
];
const MELODY = [
    [72, 0, 74, 0, 76, 0, 77, 76, 0, 74, 72, 0, 69, 0, 72, 0],
    [74, 0, 74, 76, 79, 0, 0, 77, 76, 0, 74, 0, 71, 0, 74, 0],
    [76, 0, 79, 0, 83, 0, 81, 79, 0, 76, 79, 0, 81, 0, 79, 76],
    [72, 0, 0, 76, 0, 74, 72, 0, 69, 0, 72, 74, 76, 0, 0, 0]
];

interface ToneOptions {
    type?: OscillatorType;
    gain?: number;
    attack?: number;
    glideTo?: number;
    destination?: AudioNode;
}

interface NoiseOptions {
    gain?: number;
    filter?: BiquadFilterType;
    freq?: number;
    freqTo?: number;
    q?: number;
    destination?: AudioNode;
}

const midiToFreq = (note: number): number => 440 * 2 ** ((note - 69) / 12);

class Sound {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private bgmBus: GainNode | null = null;
    private sfxBus: GainNode | null = null;
    private noiseBuffer: AudioBuffer | null = null;
    private bgmTimer: number | null = null;
    private nextStepTime = 0;
    private step = 0;
    private bpm = BGM_BPM;
    private lastPaintSound = 0;
    public muted: boolean;

    constructor() {
        this.muted = this.loadMuted();
        document.addEventListener('visibilitychange', () => {
            if (!this.ctx) return;
            if (document.hidden) this.ctx.suspend();
            else this.ctx.resume();
        });
    }

    private loadMuted(): boolean {
        try {
            return localStorage.getItem(MUTE_STORAGE_KEY) === '1';
        } catch {
            return false;
        }
    }

    // iOS Safari はユーザー操作のイベント内で作成・再開しないと音が出ないため、タップ時に呼ぶ
    public unlock(): void {
        if (!this.ctx) {
            const ctx = new AudioContext();
            const compressor = ctx.createDynamicsCompressor();
            compressor.connect(ctx.destination);

            this.master = ctx.createGain();
            this.master.gain.value = this.muted ? 0 : 1;
            this.master.connect(compressor);

            this.bgmBus = ctx.createGain();
            this.bgmBus.gain.value = 0.32;
            this.bgmBus.connect(this.master);

            this.sfxBus = ctx.createGain();
            this.sfxBus.gain.value = 0.7;
            this.sfxBus.connect(this.master);

            this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

            this.ctx = ctx;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    public toggleMute(): boolean {
        this.muted = !this.muted;
        try {
            localStorage.setItem(MUTE_STORAGE_KEY, this.muted ? '1' : '0');
        } catch {
            // 保存できない環境でも、このページを開いている間のミュートは効かせる
        }
        if (this.ctx && this.master) {
            this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.02);
        }
        return this.muted;
    }

    private tone(freq: number, start: number, duration: number, options: ToneOptions = {}): void {
        if (!this.ctx) return;
        const { type = 'square', gain = 0.2, attack = 0.005, glideTo, destination = this.sfxBus! } = options;
        const osc = this.ctx.createOscillator();
        const amp = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
        amp.gain.setValueAtTime(0.0001, start);
        amp.gain.exponentialRampToValueAtTime(gain, start + attack);
        amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(amp).connect(destination);
        osc.start(start);
        osc.stop(start + duration + 0.02);
    }

    private noise(start: number, duration: number, options: NoiseOptions = {}): void {
        if (!this.ctx || !this.noiseBuffer) return;
        const { gain = 0.3, filter = 'bandpass', freq = 1000, freqTo, q = 1, destination = this.sfxBus! } = options;
        const source = this.ctx.createBufferSource();
        source.buffer = this.noiseBuffer;
        const biquad = this.ctx.createBiquadFilter();
        biquad.type = filter;
        biquad.Q.value = q;
        biquad.frequency.setValueAtTime(freq, start);
        if (freqTo) biquad.frequency.exponentialRampToValueAtTime(freqTo, start + duration);
        const amp = this.ctx.createGain();
        amp.gain.setValueAtTime(gain, start);
        amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        source.connect(biquad).connect(amp).connect(destination);
        source.start(start, Math.random() * 0.5);
        source.stop(start + duration + 0.02);
    }

    private now(): number {
        return this.ctx ? this.ctx.currentTime : 0;
    }

    public startBgm(): void {
        if (!this.ctx) return;
        this.stopBgm();
        this.step = 0;
        this.nextStepTime = this.now() + 0.05;
        // requestAnimationFrame はタブが裏に回ると止まり、音の予約が途切れるため setInterval で先読みする
        this.bgmTimer = window.setInterval(() => this.scheduleBgm(), 25);
        this.scheduleBgm();
    }

    public stopBgm(): void {
        if (this.bgmTimer !== null) {
            clearInterval(this.bgmTimer);
            this.bgmTimer = null;
        }
    }

    public setHurry(hurry: boolean): void {
        this.bpm = hurry ? HURRY_BPM : BGM_BPM;
    }

    private scheduleBgm(): void {
        while (this.nextStepTime < this.now() + SCHEDULE_AHEAD_SEC) {
            this.playStep(this.step, this.nextStepTime);
            this.nextStepTime += 60 / this.bpm / 4;
            this.step = (this.step + 1) % (STEPS_PER_BAR * MELODY.length);
        }
    }

    private playStep(step: number, time: number): void {
        const bus = this.bgmBus!;
        const bar = Math.floor(step / STEPS_PER_BAR);
        const beat = step % STEPS_PER_BAR;
        const sixteenth = 60 / this.bpm / 4;

        if (beat === 0 || beat === 8 || beat === 10) {
            this.tone(150, time, 0.14, { type: 'sine', gain: 0.9, glideTo: 45, destination: bus });
        }
        if (beat === 4 || beat === 12) {
            this.noise(time, 0.13, { gain: 0.45, freq: 1800, q: 0.8, destination: bus });
            this.tone(190, time, 0.07, { type: 'triangle', gain: 0.25, destination: bus });
        }
        if (beat % 2 === 0) {
            this.noise(time, beat === 14 ? 0.12 : 0.03, { gain: 0.16, filter: 'highpass', freq: 7000, destination: bus });
        }

        if (beat % 2 === 0) {
            const root = BASS_ROOTS[bar];
            const pattern = [0, 12, 0, 12, 0, 12, 7, 12];
            this.tone(midiToFreq(root + pattern[beat / 2]), time, sixteenth * 1.8, {
                type: 'triangle',
                gain: 0.55,
                destination: bus
            });
        }

        if (beat % 4 === 2) {
            for (const note of CHORD_STABS[bar]) {
                this.tone(midiToFreq(note), time, sixteenth * 0.9, { type: 'square', gain: 0.045, destination: bus });
            }
        }

        const melody = MELODY[bar][beat];
        if (melody) {
            this.tone(midiToFreq(melody), time, sixteenth * 1.6, { type: 'square', gain: 0.11, destination: bus });
            this.tone(midiToFreq(melody + 12), time, sixteenth * 1.2, { type: 'triangle', gain: 0.05, destination: bus });
        }
    }

    public whistle(long = false): void {
        const t = this.now();
        const duration = long ? 0.9 : 0.45;
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const vibrato = this.ctx.createOscillator();
        const depth = this.ctx.createGain();
        const amp = this.ctx.createGain();
        osc.frequency.value = 2300;
        vibrato.frequency.value = 28;
        depth.gain.value = 90;
        vibrato.connect(depth).connect(osc.frequency);
        amp.gain.setValueAtTime(0.0001, t);
        amp.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        amp.gain.setValueAtTime(0.18, t + duration - 0.08);
        amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        osc.connect(amp).connect(this.sfxBus!);
        osc.start(t);
        vibrato.start(t);
        osc.stop(t + duration + 0.02);
        vibrato.stop(t + duration + 0.02);
        this.noise(t, duration, { gain: 0.06, freq: 2300, q: 4 });
    }

    public tick(): void {
        this.tone(1320, this.now(), 0.09, { type: 'square', gain: 0.18 });
    }

    public paint(): void {
        const nowMs = performance.now();
        if (nowMs - this.lastPaintSound < PAINT_SOUND_INTERVAL_MS) return;
        this.lastPaintSound = nowMs;
        const pitch = 500 + Math.random() * 400;
        this.noise(this.now(), 0.09, { gain: 0.22, filter: 'lowpass', freq: pitch * 2.5, freqTo: pitch, q: 6 });
    }

    public pickup(): void {
        const t = this.now();
        [88, 91, 96].forEach((note, i) => {
            this.tone(midiToFreq(note), t + i * 0.06, 0.18, { type: 'triangle', gain: 0.3 });
            this.tone(midiToFreq(note + 12), t + i * 0.06, 0.1, { type: 'square', gain: 0.05 });
        });
    }

    public ready(): void {
        const t = this.now() + 0.2;
        this.tone(midiToFreq(84), t, 0.25, { type: 'square', gain: 0.12 });
        this.tone(midiToFreq(91), t + 0.12, 0.4, { type: 'square', gain: 0.12 });
    }

    public special(): void {
        const t = this.now();
        this.tone(110, t, 0.5, { type: 'sine', gain: 0.9, glideTo: 35 });
        this.noise(t, 0.6, { gain: 0.5, filter: 'lowpass', freq: 6000, freqTo: 300, q: 2 });
        this.tone(220, t, 0.45, { type: 'sawtooth', gain: 0.12, glideTo: 1760 });
    }

    public result(outcome: 'win' | 'lose' | 'draw'): void {
        const t = this.now();
        const melodies = {
            win: [72, 76, 79, 84, 0, 84, 88],
            lose: [72, 71, 70, 69, 0, 64],
            draw: [72, 74, 72, 0, 74]
        };
        melodies[outcome].forEach((note, i) => {
            if (!note) return;
            const last = i === melodies[outcome].length - 1;
            this.tone(midiToFreq(note), t + i * 0.13, last ? 0.6 : 0.16, { type: 'square', gain: 0.14 });
            this.tone(midiToFreq(note - 12), t + i * 0.13, last ? 0.6 : 0.16, { type: 'triangle', gain: 0.25 });
        });
    }
}
