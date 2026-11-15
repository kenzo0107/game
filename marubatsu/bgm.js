const _ = null;

const STEP_SEC = 60 / 112 / 2;
const LOOKAHEAD_SEC = 0.12;
const SCHEDULE_INTERVAL_MS = 25;

const MELODY = [
    76, 79, 76, 72, 74, 76, 79, _,
    81, 79, 76, _, 72, 76, 74, _,
    77, 81, 77, 72, 74, 77, 81, _,
    79, _, 77, 76, 74, _, 71, _,
    76, 79, 84, _, 83, 79, 76, _,
    81, _, 79, 76, 72, _, 76, 79,
    77, 76, 74, _, 69, 74, 77, _,
    74, 71, 67, 71, 74, _, _, _,
];
const BASS_ROOTS = [48, 45, 41, 43, 48, 45, 50, 43];
const BASS_PATTERN = [0, 12, 7, 12];

const midiToFreq = (note) => 440 * 2 ** ((note - 69) / 12);

export function createBgm(ctx) {
    const out = ctx.createGain();
    out.connect(ctx.destination);

    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
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

    function playStep(i, t) {
        const note = MELODY[i];
        if (note !== null) tone(note, t, STEP_SEC * 0.85, 'square', 0.035);
        const beat = i % 8;
        if (beat % 2 === 0) {
            const root = BASS_ROOTS[Math.floor(i / 8)];
            tone(root + BASS_PATTERN[beat / 2], t, STEP_SEC * 1.6, 'triangle', 0.12);
        } else {
            hat(t);
        }
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
