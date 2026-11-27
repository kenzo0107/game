const _ = null;

const STEP_SEC = 60 / 140 / 2;
const LOOKAHEAD_SEC = 0.12;
const SCHEDULE_INTERVAL_MS = 25;

const MELODY = [
    65, _, 69, _, 72, 70, 69, _,
    67, _, 70, _, 74, _, 72, _,
    69, 70, 72, _, 77, _, 76, 74,
    72, _, 70, 69, 67, _, _, _,
    65, _, 69, 72, 77, _, 76, 74,
    74, 72, 70, _, 67, _, 70, _,
    69, _, 72, _, 70, 69, 67, 69,
    65, _, _, _, 60, _, 65, _,
];
const BASS_ROOTS = [41, 46, 41, 48, 41, 46, 48, 41];
const BASS_PATTERN = [0, 12, 7, 12];

const midiToFreq = (note) => 440 * 2 ** ((note - 69) / 12);

export function createBgm(ctx, destination) {
    const out = ctx.createGain();
    out.connect(destination);

    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

    let timer = null;
    let step = 0;
    let nextTime = 0;
    let rate = 1;

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

    function hat(start) {
        const src = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        src.buffer = noise;
        filter.type = 'highpass';
        filter.frequency.value = 7000;
        gain.gain.setValueAtTime(0.02, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.04);
        src.connect(filter).connect(gain).connect(out);
        src.start(start);
    }

    function playStep(i, t, len) {
        const note = MELODY[i];
        if (note !== null) tone(note, t, len * 0.85, 'square', 0.03);
        const beat = i % 8;
        if (beat % 2 === 0) {
            const root = BASS_ROOTS[Math.floor(i / 8)];
            tone(root + BASS_PATTERN[beat / 2], t, len * 1.6, 'triangle', 0.11);
        } else {
            hat(t);
        }
    }

    // setTimeout の発火時刻は揺れるため、1音ずつ鳴らすとテンポがよれる。少し先までを AudioContext の時刻で予約する
    function schedule() {
        while (nextTime < ctx.currentTime + LOOKAHEAD_SEC) {
            const len = STEP_SEC / rate;
            playStep(step, nextTime, len);
            step = (step + 1) % MELODY.length;
            nextTime += len;
        }
    }

    return {
        start() {
            if (timer !== null) return;
            step = 0;
            nextTime = ctx.currentTime + 0.05;
            schedule();
            timer = setInterval(schedule, SCHEDULE_INTERVAL_MS);
        },
        stop() {
            clearInterval(timer);
            timer = null;
        },
        setRate(value) {
            rate = value;
        },
    };
}
