const _ = null;

const STEP_SEC = 60 / 140 / 4;
const LOOKAHEAD_SEC = 0.12;
const SCHEDULE_INTERVAL_MS = 25;
const STEPS_PER_BAR = 8;

const PHRASES = [
    [[67, 3], [67, 1], [71, 3], [74, 1]],
    [[79, 4], [74, 4]],
    [[76, 3], [74, 1], [72, 3], [71, 1]],
    [[69, 6], [_, 2]],
    [[66, 3], [69, 1], [72, 3], [76, 1]],
    [[74, 4], [72, 2], [71, 2]],
    [[69, 3], [71, 1], [72, 2], [66, 2]],
    [[67, 6], [_, 2]],
    [[74, 2], [74, 1], [74, 1], [74, 2], [79, 2]],
    [[78, 3], [76, 1], [74, 4]],
    [[72, 2], [72, 1], [72, 1], [72, 2], [76, 2]],
    [[74, 3], [72, 1], [71, 4]],
    [[71, 2], [74, 2], [79, 2], [83, 2]],
    [[81, 3], [79, 1], [78, 2], [76, 2]],
    [[74, 3], [78, 1], [81, 2], [78, 2]],
    [[79, 6], [_, 2]],
];

const CHORDS = {
    G: { root: 43, fifth: 50, stab: [55, 59, 62] },
    C: { root: 48, fifth: 43, stab: [55, 60, 64] },
    D: { root: 50, fifth: 45, stab: [54, 57, 62] },
};
const PROGRESSION = ['G', 'G', 'C', 'D', 'D', 'G', 'D', 'G', 'D', 'D', 'C', 'G', 'G', 'D', 'D', 'G'];

const MELODY = PHRASES.flatMap((bar) => bar.flatMap(([note, len]) => [note === _ ? _ : { note, len }, ...Array(len - 1).fill(_)]));
const TOTAL_STEPS = PHRASES.length * STEPS_PER_BAR;

const midiToFreq = (note) => 440 * 2 ** ((note - 69) / 12);

export function createBgm(ctx) {
    const out = ctx.createGain();
    out.gain.value = 0.6;
    out.connect(ctx.destination);

    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.2), ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

    let timer = null;
    let step = 0;
    let nextTime = 0;

    function brass(note, start, length, volume) {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = midiToFreq(note);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(900, start);
        filter.frequency.linearRampToValueAtTime(2600, start + 0.04);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(volume, start + 0.02);
        gain.gain.setValueAtTime(volume * 0.8, start + length * 0.7);
        gain.gain.exponentialRampToValueAtTime(0.001, start + length);
        osc.connect(filter).connect(gain).connect(out);
        osc.start(start);
        osc.stop(start + length);
    }

    function tuba(note, start, length) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = midiToFreq(note);
        gain.gain.setValueAtTime(0.22, start);
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

    function bassDrum(start) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(110, start);
        osc.frequency.exponentialRampToValueAtTime(40, start + 0.2);
        gain.gain.setValueAtTime(0.45, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
        osc.connect(gain).connect(out);
        osc.start(start);
        osc.stop(start + 0.25);
    }

    const snare = (t, volume = 0.13) => hiss(t, 0.09, 'bandpass', 2200, volume);

    function playStep(i, t) {
        const bar = Math.floor(i / STEPS_PER_BAR);
        const beat = i % STEPS_PER_BAR;
        const chord = CHORDS[PROGRESSION[bar]];
        const melody = MELODY[i];
        if (melody) {
            const length = STEP_SEC * melody.len * 0.95;
            brass(melody.note, t, length, 0.07);
            brass(melody.note - 12, t, length, 0.035);
        }

        if (beat === 0) tuba(chord.root, t, STEP_SEC * 3);
        if (beat === 4) tuba(chord.fifth, t, STEP_SEC * 3);
        if (beat === 2 || beat === 6) for (const note of chord.stab) brass(note, t, STEP_SEC * 1.2, 0.022);

        if (beat === 0 || beat === 4) bassDrum(t);
        if (beat === 0 && bar % 8 === 0) hiss(t, 1.1, 'highpass', 5000, 0.12);

        const rollBar = bar % 4 === 3;
        if (rollBar && beat >= 4) {
            snare(t, 0.08 + (beat - 4) * 0.02);
            snare(t + STEP_SEC / 2, 0.08 + (beat - 4) * 0.02);
        } else if (beat === 2 || beat === 6 || beat === 7) {
            snare(t, beat === 7 ? 0.07 : 0.13);
        }
    }

    // setTimeout の発火時刻は揺れるため、1音ずつ鳴らすとテンポがよれる。少し先までを AudioContext の時刻で予約する
    function schedule() {
        while (nextTime < ctx.currentTime + LOOKAHEAD_SEC) {
            playStep(step, nextTime);
            step = (step + 1) % TOTAL_STEPS;
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
