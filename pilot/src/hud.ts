import * as THREE from 'three';
import type { RingStatus } from './rings';
import { svg } from './svg';

export class RingTracker {
  private icons: SVGElement[] = [];

  constructor(private container: HTMLElement) {}

  public update(statuses: RingStatus[]): void {
    if (this.icons.length !== statuses.length) this.build(statuses.length);
    statuses.forEach((status, i) => {
      if (this.icons[i].dataset.state !== status) this.icons[i].dataset.state = status;
    });
    const passed = statuses.filter((s) => s === 'passed').length;
    this.container.setAttribute('aria-label', `リング ${passed}/${statuses.length}`);
  }

  private build(count: number): void {
    this.icons = Array.from({ length: count }, () => {
      const icon = svg('svg', { viewBox: '0 0 20 20', class: 'ring-icon' });
      icon.append(svg('circle', { cx: 10, cy: 10, r: 7, class: 'ring-icon-band' }));
      icon.append(svg('path', { d: 'M6.5 10.2 9 12.6 13.5 7.6', class: 'ring-icon-check' }));
      return icon;
    });
    this.container.replaceChildren(...this.icons);
  }
}

type WindLevel = 'none' | 'weak' | 'medium' | 'strong';

const WIND_LABELS: Record<WindLevel, string> = { none: 'なし', weak: 'よわい', medium: 'ふつう', strong: 'つよい' };

const windLevel = (speed: number): WindLevel => {
  if (speed === 0) return 'none';
  if (speed < 1) return 'weak';
  if (speed < 2) return 'medium';
  return 'strong';
};

export class WindIndicator {
  private arrow = svg('g', { class: 'wind-arrow' });
  private label: HTMLElement;
  private forward = new THREE.Vector3();

  constructor(container: HTMLElement) {
    const dial = svg('svg', { viewBox: '0 0 40 40', class: 'wind-dial' });
    dial.append(svg('circle', { cx: 20, cy: 20, r: 18, class: 'wind-dial-face' }));
    dial.append(svg('path', { d: 'M17 1.5 23 1.5 20 5.5Z', class: 'wind-dial-mark' }));
    this.arrow.append(svg('path', { d: 'M20 8 27 17 22.5 17 22.5 32 17.5 32 17.5 17 13 17Z', class: 'wind-arrow-body' }));
    dial.append(this.arrow);
    this.label = Object.assign(document.createElement('span'), { className: 'wind-label' });
    container.replaceChildren(dial, this.label);
  }

  // 風向きは機体ではなくカメラ基準で描く。画面の上下左右と矢印の向きが一致し、どちらへ流されるかが直感的に分かるため
  public update(wind: { x: number; z: number }, camera: THREE.Camera): void {
    const speed = Math.hypot(wind.x, wind.z);
    const level = windLevel(speed);
    const container = this.label.parentElement as HTMLElement;
    container.dataset.level = level;
    this.label.textContent = WIND_LABELS[level];
    container.setAttribute('aria-label', `風 ${WIND_LABELS[level]}`);
    if (level === 'none') return;
    camera.getWorldDirection(this.forward);
    const forwardX = this.forward.x;
    const forwardZ = this.forward.z;
    const ahead = wind.x * forwardX + wind.z * forwardZ;
    const right = wind.x * -forwardZ + wind.z * forwardX;
    const degrees = (Math.atan2(right, ahead) * 180) / Math.PI;
    this.arrow.setAttribute('transform', `rotate(${degrees.toFixed(1)} 20 20)`);
  }
}
