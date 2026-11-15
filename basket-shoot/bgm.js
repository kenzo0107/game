const _ = null;

const STEP_SEC = 60 / 128 / 2;
const LOOKAHEAD_SEC = 0.12;
const SCHEDULE_INTERVAL_MS = 25;
const STEPS_PER_BAR = 8;

const MELODY = [
    76, _, 79, 76, 81, _, 79, _,
    76, _, 74, 72, 74, _, _, _,
    74, _, 78, 74, 81, _, 78, _,
    83, _, 81, 78, 74, _, _, _,
    88, _, 86, 83, 86, _, 83, _,
    84, _, 83, 79, 76, _, 79, _,
    81, _, 83, 86, _, 81, 78, _,
    79, 78, 76, _, _, _, _, _,
];
const BASS_ROOTS = [40, 36, 38, 35, 40, 36, 38, 35];
const BASS_PATTERN = [0, 0, 12, 0, 0, 0, 12, 7];
const KICK_STEPS = new Set([0, 3, 4]);
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
        if (note !== null) tone(note, t, STEP_SEC * 0.9, 'square', 0.03);
        const beat = i % STEPS_PER_BAR;
        const root = BASS_ROOTS[Math.floor(i / STEPS_PER_BAR)];
        tone(root + BASS_PATTERN[beat], t, STEP_SEC * 0.8, 'triangle', 0.13);
        if (KICK_STEPS.has(beat)) kick(t);
        if (SNARE_STEPS.has(beat)) hiss(t, 0.12, 'bandpass', 1800, 0.12);
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
