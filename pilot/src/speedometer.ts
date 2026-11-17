import { GAUGE_HEIGHT, LABEL_Y, svg, svgText } from './svg';

const CENTER = 60;
const RADIUS = 46;
const SWEEP_DEG = 240;
const TICK_STEP = 10;

export const SPEEDOMETER_MAX = 60;

export const speedToAngle = (speed: number): number => {
  const ratio = Math.max(0, Math.min(1, speed / SPEEDOMETER_MAX));
  return -SWEEP_DEG / 2 + SWEEP_DEG * ratio;
};

const pointAt = (speed: number, radius: number): [number, number] => {
  const rad = (speedToAngle(speed) * Math.PI) / 180;
  return [CENTER + radius * Math.sin(rad), CENTER - radius * Math.cos(rad)];
};

const arcPath = (from: number, to: number): string => {
  const [x0, y0] = pointAt(from, RADIUS);
  const [x1, y1] = pointAt(to, RADIUS);
  const largeArc = speedToAngle(to) - speedToAngle(from) > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x1} ${y1}`;
};

export class Speedometer {
  private needle: SVGElement;
  private readout: SVGElement;

  constructor(private root: HTMLElement, private stallSpeed: number, private maxSpeed: number) {
    const face = svg('svg', { viewBox: `0 0 120 ${GAUGE_HEIGHT}`, 'aria-hidden': 'true' });
    face.append(
      svg('circle', { cx: CENTER, cy: CENTER, r: 57, class: 'gauge-bezel' }),
      svg('path', { d: arcPath(0, SPEEDOMETER_MAX), class: 'speedo-track' }),
      svg('path', { d: arcPath(0, stallSpeed), class: 'speedo-stall' }),
      svg('path', { d: arcPath(maxSpeed, SPEEDOMETER_MAX), class: 'speedo-over' }),
    );
    for (let speed = 0; speed <= SPEEDOMETER_MAX; speed += TICK_STEP) {
      const [x0, y0] = pointAt(speed, RADIUS - 7);
      const [x1, y1] = pointAt(speed, RADIUS);
      const [lx, ly] = pointAt(speed, RADIUS - 15);
      face.append(
        svg('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: 'speedo-tick' }),
        svgText(String(speed), { x: lx, y: ly, class: 'speedo-label' }),
      );
    }
    this.needle = svg('line', { x1: CENTER, y1: CENTER, x2: CENTER, y2: CENTER - RADIUS + 4, class: 'speedo-needle' });
    this.readout = svg('text', { x: CENTER, y: CENTER + 30, class: 'speedo-readout' });
    face.append(
      this.needle,
      svg('circle', { cx: CENTER, cy: CENTER, r: 4, class: 'speedo-hub' }),
      this.readout,
      svgText('速度', { x: CENTER, y: LABEL_Y, class: 'gauge-label' }),
    );
    this.root.append(face);
    this.root.setAttribute('aria-valuemax', String(SPEEDOMETER_MAX));
  }

  update(speed: number): void {
    const shown = Math.round(speed);
    this.needle.setAttribute('transform', `rotate(${speedToAngle(speed)} ${CENTER} ${CENTER})`);
    this.readout.textContent = String(shown);
    this.root.dataset.zone = speed < this.stallSpeed ? 'stall' : speed > this.maxSpeed ? 'over' : 'normal';
    this.root.setAttribute('aria-valuenow', String(shown));
  }
}
