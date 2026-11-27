const _ = null;

const STEP_SEC = 60 / 96 / 2;
const LOOKAHEAD_SEC = 0.12;
const SCHEDULE_INTERVAL_MS = 25;

const MELODY = [
    72, _, 76, _, 79, _, 76, _,
    74, _, 77, _, 81, _, _, _,
    79, _, 76, _, 72, _, 74, 76,
    77, _, 76, _, 74, _, _, _,
    72, _, 76, _, 79, _, 84, _,
    83, _, 81, _, 79, _, 77, _,
    76, _, 74, _, 72, _, 71, _,
    72, _, _, _, _, _, _, _,
];
const PAD_ROOTS = [48, 50, 45, 43, 48, 53, 43, 48];
const PAD_CHORD = [0, 7, 12, 16];

const midiToFreq = (note) => 440 * 2 ** ((note - 69) / 12);

export function createBgm(ctx, destination) {
    const out = ctx.createGain();
    out.connect(destination);

    let timer = null;
    let step = 0;
    let nextTime = 0;

    function tone(note, start, length, type, volume) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = midiToFreq(note);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
        osc.connect(gain).connect(out);
        osc.start(start);
        osc.stop(start + length);
    }

    function playStep(i, t) {
        const note = MELODY[i];
        if (note !== null) {
            tone(note, t, STEP_SEC * 2.5, 'sine', 0.06);
            tone(note + 12, t + STEP_SEC * 3, STEP_SEC * 2, 'sine', 0.012);
        }
        if (i % 8 === 0) {
            const root = PAD_ROOTS[Math.floor(i / 8)];
            for (const offset of PAD_CHORD) tone(root + offset, t, STEP_SEC * 8, 'triangle', 0.025);
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
    };
}
