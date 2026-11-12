export type Chord = { bass: number; voicing: number[] };
export type Note = [step: number, midi: number, length: number];
export type Hit = [step: number, length: number];

export interface Section {
  chords: Chord[];
  melody: Note[];
}

export interface Song {
  title: string;
  bpm: number;
  stepsPerBar: number;
  swing: number;
  swingUnit: 1 | 2;
  form: Section[];
  bass: { flight: Note[]; menu: Note[] };
  comp: { voice: 'ep' | 'pluck'; flight: Hit[]; roll: boolean };
  lead: 'flute' | 'vibes';
  drums: { kick: number[]; rim: number[]; hat: [step: number, velocity: number][] };
}

const chord = (bass: number, ...voicing: number[]): Chord => ({ bass, voicing });
const eighths = (bar: number, accent: number, ghost: number): [number, number][] =>
  Array.from({ length: bar / 2 }, (_, i) => [i * 2, i % 2 === 1 ? accent : ghost]);

const BLUE_A: Chord[] = [
  chord(38, 54, 57, 61, 64), // Dmaj9
  chord(35, 57, 61, 62, 66), // Bm9
  chord(31, 54, 57, 59, 62), // Gmaj9
  chord(33, 55, 59, 62, 64), // A7sus4
  chord(30, 57, 61, 64, 66), // F#m7
  chord(35, 57, 61, 62, 66), // Bm9
  chord(28, 55, 59, 62, 66), // Em9
  chord(31, 55, 58, 62, 64), // Gm6
];
const BLUE_B: Chord[] = [
  chord(34, 57, 60, 62, 65), // Bbmaj9
  chord(36, 55, 59, 62, 64), // C6/9
  chord(38, 54, 57, 61, 64), // Dmaj9
  chord(35, 57, 61, 62, 66), // Bm9
  chord(31, 54, 57, 59, 62), // Gmaj9
  chord(30, 57, 61, 64, 66), // F#m7
  chord(28, 55, 59, 62, 66), // Em9
  chord(33, 55, 59, 62, 64), // A7sus4
];
const BLUE_MELODY_A: Note[] = [
  [4, 69, 2], [6, 71, 2], [8, 73, 6], [14, 76, 2],
  [16, 78, 8], [24, 76, 4], [28, 73, 4],
  [32, 74, 6], [38, 71, 2], [40, 69, 8],
  [54, 71, 2], [56, 69, 2], [58, 67, 2], [60, 64, 4],
  [66, 69, 2], [68, 73, 2], [70, 76, 10],
  [82, 78, 2], [84, 76, 2], [86, 74, 2], [88, 73, 8],
  [96, 71, 4], [100, 74, 4], [104, 78, 8],
  [112, 76, 6], [118, 74, 2], [120, 70, 8],
];
const BLUE_MELODY_B: Note[] = [
  [0, 74, 4], [4, 77, 4], [8, 76, 8],
  [16, 74, 4], [20, 79, 4], [24, 76, 8],
  [32, 78, 12], [44, 76, 2], [46, 78, 2],
  [48, 81, 8], [56, 78, 4], [60, 74, 4],
  [64, 76, 4], [68, 78, 4], [72, 74, 6], [78, 71, 2],
  [80, 73, 8], [88, 69, 4], [92, 73, 4],
  [96, 71, 2], [98, 74, 2], [100, 78, 4], [104, 76, 8],
  [112, 74, 6], [118, 76, 2], [120, 69, 8],
];

const GLIDE: Chord[] = [
  chord(41, 57, 59, 64, 67), // Fmaj9#11
  chord(41, 55, 59, 62, 67), // G/F
  chord(40, 55, 59, 62, 64), // Em7
  chord(45, 55, 59, 60, 64), // Am9
  chord(38, 57, 60, 64, 65), // Dm9
  chord(46, 57, 62, 64, 65), // Bbmaj7#11
  chord(48, 55, 60, 65, 67), // Csus4
  chord(40, 55, 60, 64, 67), // C/E
];
const GLIDE_MELODY: Note[] = [
  [0, 72, 8], [8, 76, 8],
  [16, 74, 12], [28, 71, 4],
  [32, 71, 8], [40, 67, 8],
  [48, 69, 16],
  [64, 72, 8], [72, 76, 4], [76, 77, 4],
  [80, 76, 12], [92, 74, 4],
  [96, 72, 8], [104, 77, 8],
  [112, 76, 16],
];

const WALTZ_A: Chord[] = [
  chord(46, 57, 62, 65, 69), // Bbmaj7
  chord(43, 58, 62, 65, 67), // Gm7
  chord(48, 58, 62, 63, 67), // Cm9
  chord(41, 57, 62, 63, 67), // F13
  chord(38, 57, 60, 65, 69), // Dm7
  chord(43, 53, 59, 62, 65), // G7
  chord(48, 58, 62, 63, 67), // Cm9
  chord(41, 57, 62, 63, 67), // F13
];
const WALTZ_B: Chord[] = [
  chord(39, 55, 58, 62, 65), // Ebmaj9
  chord(44, 54, 60, 63, 65), // Ab13
  chord(38, 57, 60, 65, 69), // Dm7
  chord(43, 53, 59, 62, 65), // G7
  chord(48, 58, 62, 63, 67), // Cm9
  chord(41, 57, 62, 63, 67), // F13
  chord(46, 57, 62, 65, 69), // Bbmaj7
  chord(41, 57, 62, 63, 67), // F13
];
const WALTZ_MELODY_A: Note[] = [
  [0, 74, 4], [4, 77, 4], [8, 81, 4],
  [12, 79, 8], [20, 77, 4],
  [24, 75, 4], [28, 74, 4], [32, 72, 4],
  [36, 74, 12],
  [48, 72, 4], [52, 74, 4], [56, 77, 4],
  [60, 79, 8], [68, 77, 4],
  [72, 75, 4], [76, 74, 4], [80, 70, 4],
  [84, 72, 12],
];
const WALTZ_MELODY_B: Note[] = [
  [0, 70, 4], [4, 74, 4], [8, 79, 4],
  [12, 77, 8], [20, 75, 4],
  [24, 72, 4], [28, 74, 4], [32, 77, 4],
  [36, 74, 8], [44, 71, 4],
  [48, 75, 8], [56, 74, 4],
  [60, 72, 4], [64, 69, 4], [68, 72, 4],
  [72, 74, 12],
  [84, 72, 4], [88, 69, 4], [92, 65, 4],
];

const BOSSA: Chord[] = [
  chord(45, 55, 59, 60, 64), // Am9
  chord(38, 54, 57, 60, 64), // D9
  chord(43, 54, 57, 59, 62), // Gmaj7
  chord(48, 55, 59, 64, 67), // Cmaj7
  chord(42, 54, 57, 60, 64), // F#m7b5
  chord(47, 57, 60, 63, 66), // B7b9
  chord(40, 55, 59, 62, 66), // Em9
  chord(40, 56, 59, 62, 65), // E7b9
];
const BOSSA_MELODY: Note[] = [
  [0, 76, 6], [6, 74, 2], [8, 72, 4], [12, 71, 4],
  [16, 72, 12], [28, 69, 4],
  [32, 71, 6], [38, 69, 2], [40, 67, 4], [44, 66, 4],
  [48, 64, 12], [60, 67, 4],
  [64, 69, 6], [70, 72, 2], [72, 76, 8],
  [80, 75, 8], [88, 72, 4], [92, 71, 4],
  [96, 71, 6], [102, 74, 2], [104, 78, 8],
  [112, 77, 4], [116, 76, 4], [120, 74, 4], [124, 71, 4],
];

// メロディを常に鳴らすと長いフライトで耳につくため、どの曲も半分は伴奏だけにする
export const SONGS: Song[] = [
  {
    title: 'Blue Horizon',
    bpm: 86,
    stepsPerBar: 16,
    swing: 0.12,
    swingUnit: 1,
    form: [
      { chords: BLUE_A, melody: BLUE_MELODY_A },
      { chords: BLUE_B, melody: BLUE_MELODY_B },
      { chords: BLUE_A, melody: [] },
      { chords: BLUE_B, melody: [] },
    ],
    bass: {
      flight: [[0, 0, 5], [6, 7, 2], [10, 12, 2], [12, 0, 3], [14, 7, 2]],
      menu: [[0, 0, 10], [10, 7, 6]],
    },
    comp: { voice: 'ep', flight: [[0, 5], [7, 2], [10, 5]], roll: false },
    lead: 'flute',
    drums: { kick: [0, 10], rim: [4, 12], hat: eighths(16, 0.7, 0.4) },
  },
  {
    title: 'Morning Glide',
    bpm: 70,
    stepsPerBar: 16,
    swing: 0,
    swingUnit: 1,
    form: [
      { chords: GLIDE, melody: GLIDE_MELODY },
      { chords: GLIDE, melody: [] },
    ],
    bass: { flight: [[0, 0, 8], [8, 7, 4], [12, 12, 4]], menu: [[0, 0, 16]] },
    comp: { voice: 'ep', flight: [[0, 8], [8, 8]], roll: true },
    lead: 'flute',
    drums: { kick: [0], rim: [], hat: eighths(16, 0.35, 0.2) },
  },
  {
    title: 'Sky Waltz',
    bpm: 132,
    stepsPerBar: 12,
    swing: 0.3,
    swingUnit: 2,
    form: [
      { chords: WALTZ_A, melody: WALTZ_MELODY_A },
      { chords: WALTZ_B, melody: WALTZ_MELODY_B },
      { chords: WALTZ_A, melody: [] },
      { chords: WALTZ_B, melody: [] },
    ],
    bass: { flight: [[0, 0, 4], [4, 7, 4], [8, 12, 4]], menu: [[0, 0, 12]] },
    comp: { voice: 'ep', flight: [[4, 2], [8, 2]], roll: false },
    lead: 'vibes',
    drums: { kick: [0], rim: [8], hat: [[0, 0.5], [4, 0.8], [6, 0.4], [8, 0.6]] },
  },
  {
    title: 'Sunset Approach',
    bpm: 112,
    stepsPerBar: 16,
    swing: 0,
    swingUnit: 1,
    form: [
      { chords: BOSSA, melody: BOSSA_MELODY },
      { chords: BOSSA, melody: [] },
    ],
    bass: { flight: [[0, 0, 3], [6, 7, 2], [8, 7, 3], [14, 0, 2]], menu: [[0, 0, 8], [8, 7, 8]] },
    comp: { voice: 'pluck', flight: [[0, 2], [3, 2], [6, 3], [10, 2], [12, 3]], roll: false },
    lead: 'flute',
    drums: {
      kick: [0, 8],
      rim: [0, 3, 6, 10, 12],
      hat: Array.from({ length: 16 }, (_, i): [number, number] => [i, i % 2 === 0 ? 0.45 : 0.25]),
    },
  },
];
