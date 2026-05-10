import { ShootType } from '../types';

export const SHOOT_POINTS: Record<ShootType, number> = {
  THREE_POINT: 3,
  DUNK: 2,
  NORMAL: 1,
};

export const SHOOT_POWER: Record<ShootType, number> = {
  THREE_POINT: 12, // 遠距離なので強い力
  DUNK: 3, // ダンクは上方向への小さな力
  NORMAL: 8, // 通常の力
};

export const SHOOT_ANGLE: Record<ShootType, number> = {
  THREE_POINT: 45, // 45度
  DUNK: 30, // 30度（やや上向き）
  NORMAL: 40, // 40度
};
