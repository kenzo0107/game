const _ = null;

const STEP_SEC = 60 / 112 / 2;
const LOOKAHEAD_SEC = 0.12;
const SCHEDULE_INTERVAL_MS = 25;
const STEPS_PER_BAR = 8;

const MELODY = [
    72, _, 76, 79, 76, _, 72, _,
    74, _, 77, 81, 77, _, 74, _,
    72, _, 76, 79, 84, _, 79, 76,
    74, 76, 74, _, 67, _, _, _,
    77, _, 81, 84, 81, _, 77, _,
    76, _, 79, 84, 79, _, 76, _,
    74, _, 77, 81, 79, _, 77, 74,
    72, _, _, 67, 72, _, _, _,
];
const BASS_ROOTS = [36, 41, 36, 43, 41, 36, 43, 36];
const BASS_PATTERN = [0, _, 7, 0, 12, _, 7, _];
const KICK_STEPS = new Set([0, 4]);
const SNARE_STEPS = new Set([2, 6]);

const midiToFreq = (note) => 440 * 2 ** ((note - 69) / 12);

export function createBgm(ctx) {
    const out = ctx.createGain();
    out.gain.value = 0.7;
    out.connect(ctx.destination);

    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

    let timer = null;
    let step = 0;
    let nextTime = 0;

    function tone(note, start, length, type, volume) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = midiToFreq(note);
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + length);
        osc.connect(gain).connect(out);
        osc.start(start);
        osc.stop(start + length);
    }

    function hiss(start, length, type, freq, volume) {
        const src = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        src.buffer = noise;
        filter.type = type;
        filter.frequency.value = freq;
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + length);
        src.connect(filter).connect(gain).connect(out);
        src.start(start);
        src.stop(start + length);
    }

    function kick(start) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(150, start);
        osc.frequency.exponentialRampToValueAtTime(45, start + 0.12);
        gain.gain.setValueAtTime(0.35, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
        osc.connect(gain).connect(out);
        osc.start(start);
        osc.stop(start + 0.15);
    }

    function playStep(i, t) {
        const note = MELODY[i];
        if (note !== null) tone(note, t, STEP_SEC * 1.6, 'triangle', 0.09);
        const beat = i % STEPS_PER_BAR;
        const root = BASS_ROOTS[Math.floor(i / STEPS_PER_BAR)];
        if (BASS_PATTERN[beat] !== null) tone(root + BASS_PATTERN[beat], t, STEP_SEC * 0.8, 'triangle', 0.13);
        if (KICK_STEPS.has(beat)) kick(t);
        if (SNARE_STEPS.has(beat)) hiss(t, 0.06, 'bandpass', 3200, 0.1);
        hiss(t, 0.04, 'highpass', 7000, beat % 2 ? 0.025 : 0.012);
    }

    // setTimeout の発火時刻は揺れるため、1音ずつ鳴らすとテンポがよれる。少し先までを AudioContext の時刻で予約する
    function schedule() {
        while (nextTime < ctx.currentTime + LOOKAHEAD_SEC) {
            playStep(step, nextTime);
            step = (step + 1) % MELODY.length;
            nextTime += STEP_SEC;
        }
    }

    return {
        start() {
            if (timer) return;
            step = 0;
            nextTime = ctx.currentTime + 0.05;
            schedule();
            timer = setInterval(schedule, SCHEDULE_INTERVAL_MS);
        },
        stop() {
            clearInterval(timer);
            timer = null;
        },
    };
}
