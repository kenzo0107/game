export interface Placement {
  x: number;
  y: number;
  z: number;
  heading: number;
}

export interface StageConfig {
  name: string;
  description: string;
  island: { x: number; z: number; width: number; depth: number };
  runway: { x: number; z: number; heading: number; width: number; length: number };
  start: Placement;
  wind: { x: number; z: number };
  fuel: number;
  rings: Placement[];
}

export const STAGES: StageConfig[] = [
  {
    name: 'はじめての着陸',
    description: 'まっすぐ先の滑走路へ。リングをくぐりながら、ゆっくり降りよう',
    island: { x: 0, z: 300, width: 300, depth: 400 },
    runway: { x: 0, z: 300, heading: 0, width: 30, length: 200 },
    start: { x: 0, y: 10, z: -600, heading: 0 },
    wind: { x: 0, z: 0 },
    fuel: 100,
    rings: [
      { x: 0, y: -3, z: -400, heading: 0 },
      { x: 0, y: -18, z: -200, heading: 0 },
      { x: 0, y: -33, z: 0, heading: 0 },
    ],
  },
  {
    name: 'まがって着陸',
    description: '滑走路は右ななめ前。機体をかたむけて右へ曲がろう',
    island: { x: 0, z: 300, width: 300, depth: 400 },
    runway: { x: 0, z: 300, heading: 0, width: 24, length: 180 },
    start: { x: 220, y: 10, z: -600, heading: 0 },
    wind: { x: 0, z: 0 },
    fuel: 100,
    rings: [
      { x: 200, y: -3, z: -400, heading: -0.1 },
      { x: 120, y: -18, z: -200, heading: -0.38 },
      { x: 30, y: -32, z: 20, heading: -0.3 },
    ],
  },
  {
    name: 'みじかい滑走路',
    description: '滑走路がせまくて短い。着陸したら 減速(S) でブレーキ',
    island: { x: 0, z: 320, width: 260, depth: 360 },
    runway: { x: 0, z: 320, heading: 0, width: 18, length: 120 },
    start: { x: 0, y: 20, z: -650, heading: 0 },
    wind: { x: 0, z: 0 },
    fuel: 100,
    rings: [
      { x: -40, y: 0, z: -400, heading: -0.16 },
      { x: 40, y: -20, z: -150, heading: 0.1 },
      { x: 0, y: -36, z: 100, heading: -0.16 },
    ],
  },
  {
    name: 'よこかぜ',
    description: '右から風がふいている。流されないように向きを直そう',
    island: { x: 0, z: 300, width: 300, depth: 400 },
    runway: { x: 0, z: 300, heading: -0.3, width: 22, length: 160 },
    start: { x: 246, y: 10, z: -493, heading: -0.3 },
    wind: { x: 2.5, z: 0 },
    fuel: 100,
    rings: [
      { x: 178, y: -8, z: -273, heading: -0.3 },
      { x: 133, y: -20, z: -130, heading: -0.3 },
      { x: 83, y: -34, z: 33, heading: -0.3 },
    ],
  },
  {
    name: 'ちいさな島',
    description: '海にうかぶ小さな島。左からの風と燃料に気をつけて',
    island: { x: -120, z: 380, width: 120, depth: 200 },
    runway: { x: -120, z: 380, heading: 0.25, width: 18, length: 130 },
    start: { x: -355, y: 15, z: -540, heading: 0.25 },
    wind: { x: -2, z: 0 },
    fuel: 90,
    rings: [
      { x: -293, y: -3, z: -298, heading: 0.25 },
      { x: -231, y: -21, z: -56, heading: 0.25 },
      { x: -182, y: -36, z: 138, heading: 0.25 },
    ],
  },
];
