const _ = null;

const STEP_SEC = 60 / 132 / 2;
const LOOKAHEAD_SEC = 0.12;
const SCHEDULE_INTERVAL_MS = 25;

const MELODY = [
    67, _, 72, _, 72, 74, 76, _,
    74, _, 72, _, 69, _, _, _,
    65, _, 69, _, 72, 69, 74, _,
    72, _, 71, _, 67, _, _, _,
    67, _, 72, _, 72, 74, 76, _,
    79, _, 77, _, 76, _, 74, _,
    72, _, 74, 76, 74, _, 71, _,
    72, _, _, _, 67, _, _, _,
];
const BASS = [48, 52, 53, 55, 48, 52, 55, 48];

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
        if (note !== null) tone(note, t, STEP_SEC * 1.6, 'square', 0.025);
        const root = BASS[Math.floor(i / 8)];
        if (i % 2 === 0) tone(i % 4 === 0 ? root - 12 : root - 5, t, STEP_SEC * 1.2, 'triangle', 0.07);
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
