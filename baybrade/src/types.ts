export type BeybladeType = 'attack' | 'defense' | 'stamina' | 'balance';

export interface BeybladeStats {
  attack: number;
  defense: number;
  stamina: number;
  weight: number;
  friction: number;
}

export const BEYBLADE_PRESETS: Record<BeybladeType, BeybladeStats> = {
  attack: {
    attack: 4.0,
    defense: 2.0,
    stamina: 2.0,
    weight: 0.5,
    friction: 0.3,
  },
  defense: {
    attack: 2.0,
    defense: 5.0,
    stamina: 3.0,
    weight: 1.0,
    friction: 0.5,
  },
  stamina: {
    attack: 2.0,
    defense: 3.0,
    stamina: 5.0,
    weight: 0.3,
    friction: 0.1,
  },
  balance: {
    attack: 3.0,
    defense: 3.0,
    stamina: 3.0,
    weight: 0.6,
    friction: 0.3,
  },
};
