import { GAUGE_HEIGHT, LABEL_Y, svg, svgText } from './svg';

const toDeg = (rad: number): number => (rad * 180) / Math.PI;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const ATTITUDE_CENTER = 60;
const ATTITUDE_RADIUS = 50;
const PX_PER_DEG = 1.4;
const PITCH_LADDER_LIMIT = 30;
const BANK_MARKS = [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60];

const linearGradient = (id: string, stops: [string, string]): SVGElement => {
  const gradient = svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
  gradient.append(svg('stop', { offset: 0, 'stop-color': stops[0] }), svg('stop', { offset: 1, 'stop-color': stops[1] }));
  return gradient;
};

export const formatPitch = (pitchUpDeg: number): string => {
  const rounded = Math.round(pitchUpDeg);
  return `${rounded > 0 ? '+' : ''}${rounded}°`;
};

export const formatBank = (bankRightDeg: number): string => {
  const rounded = Math.round(bankRightDeg);
  if (rounded === 0) return '0°';
  return `${rounded > 0 ? '右' : '左'}${Math.abs(rounded)}°`;
};

export class AttitudeIndicator {
  private horizon: SVGElement;
  private bankPointer: SVGElement;
  private pitchValue: SVGElement;
  private bankValue: SVGElement;

  constructor(root: HTMLElement) {
    const c = ATTITUDE_CENTER;
    const face = svg('svg', { viewBox: `0 0 120 ${GAUGE_HEIGHT}`, 'aria-hidden': 'true' });
    const defs = svg('defs');
    const clip = svg('clipPath', { id: 'attitude-clip' });
    clip.append(svg('circle', { cx: c, cy: c, r: ATTITUDE_RADIUS }));
    defs.append(clip, linearGradient('attitude-sky', ['#0b3b78', '#3fa2e8']), linearGradient('attitude-ground', ['#8a5426', '#3a200c']));

    this.horizon = svg('g');
    this.horizon.append(
      svg('rect', { x: -100, y: c - 300, width: 320, height: 300, fill: 'url(#attitude-sky)' }),
      svg('rect', { x: -100, y: c, width: 320, height: 300, fill: 'url(#attitude-ground)' }),
      svg('line', { x1: -100, y1: c, x2: 220, y2: c, class: 'att-horizon' }),
    );
    for (let deg = -PITCH_LADDER_LIMIT; deg <= PITCH_LADDER_LIMIT; deg += 5) {
      if (deg === 0) continue;
      const y = c - deg * PX_PER_DEG;
      const half = deg % 10 === 0 ? 14 : 6;
      this.horizon.append(svg('line', { x1: c - half, y1: y, x2: c + half, y2: y, class: 'att-ladder' }));
      if (deg % 10 === 0) {
        this.horizon.append(
          svgText(String(Math.abs(deg)), { x: c - half - 6, y, class: 'att-ladder-label' }),
          svgText(String(Math.abs(deg)), { x: c + half + 6, y, class: 'att-ladder-label' }),
        );
      }
    }
    const card = svg('g', { 'clip-path': 'url(#attitude-clip)' });
    card.append(this.horizon);

    const bankScale = svg('g');
    for (const deg of BANK_MARKS) {
      const length = deg % 30 === 0 ? 8 : 5;
      bankScale.append(
        svg('line', {
          x1: c,
          y1: c - ATTITUDE_RADIUS,
          x2: c,
          y2: c - ATTITUDE_RADIUS + length,
          transform: `rotate(${deg} ${c} ${c})`,
          class: 'att-bank-mark',
        }),
      );
    }
    this.bankPointer = svg('path', { d: `M ${c} ${c - ATTITUDE_RADIUS + 9} l -4 7 h 8 z`, class: 'att-bank-pointer' });

    this.pitchValue = svg('tspan', { class: 'gauge-value' });
    this.bankValue = svg('tspan', { class: 'gauge-value' });
    const pitchText = svg('text', { x: 30, y: LABEL_Y, class: 'gauge-label' });
    pitchText.append('ピッチ ', this.pitchValue);
    const bankText = svg('text', { x: 90, y: LABEL_Y, class: 'gauge-label' });
    bankText.append('ロール ', this.bankValue);

    face.append(
      defs,
      svg('circle', { cx: c, cy: c, r: 57, class: 'gauge-bezel' }),
      card,
      bankScale,
      this.bankPointer,
      svg('path', { d: `M ${c} ${c - ATTITUDE_RADIUS - 1} l -4 -6 h 8 z`, class: 'att-index' }),
      svg('path', { d: `M 28 ${c} H 47 L 53 ${c + 6} L ${c} ${c} L 67 ${c + 6} L 73 ${c} H 92`, class: 'att-aircraft' }),
      svg('circle', { cx: c, cy: c, r: 2.5, class: 'att-aircraft-dot' }),
      svg('circle', { cx: c, cy: c, r: ATTITUDE_RADIUS, class: 'att-rim' }),
      pitchText,
      bankText,
    );
    root.append(face);
  }

  update(pitchUpRad: number, bankRightRad: number): void {
    const pitch = toDeg(pitchUpRad);
    const bank = toDeg(bankRightRad);
    const c = ATTITUDE_CENTER;
    const shift = clamp(pitch, -PITCH_LADDER_LIMIT - 10, PITCH_LADDER_LIMIT + 10) * PX_PER_DEG;
    this.horizon.setAttribute('transform', `rotate(${-bank} ${c} ${c}) translate(0 ${shift})`);
    this.bankPointer.setAttribute('transform', `rotate(${-bank} ${c} ${c})`);
    this.pitchValue.textContent = formatPitch(pitch);
    this.bankValue.textContent = formatBank(bank);
  }
}

const TAPE_TOP = 4;
const TAPE_HEIGHT = 112;
const TAPE_CENTER = TAPE_TOP + TAPE_HEIGHT / 2;
const PX_PER_METER = 2.2;
const TICK_STEP = 5;
const TICK_RANGE = 30;

export class AltitudeTape {
  private ticks: SVGElement;
  private readout: SVGElement;
  private anchor = Number.NaN;

  constructor(private root: HTMLElement, private lowAltitude: number) {
    const face = svg('svg', { viewBox: `0 0 60 ${GAUGE_HEIGHT}`, 'aria-hidden': 'true' });
    const defs = svg('defs');
    const clip = svg('clipPath', { id: 'altitude-clip' });
    clip.append(svg('rect', { x: 2, y: TAPE_TOP, width: 56, height: TAPE_HEIGHT, rx: 6 }));
    defs.append(clip);
    this.ticks = svg('g');
    const tape = svg('g', { 'clip-path': 'url(#altitude-clip)' });
    tape.append(this.ticks);
    this.readout = svg('text', { x: 36, y: TAPE_CENTER, class: 'alt-readout' });
    face.append(
      defs,
      svg('rect', { x: 2, y: TAPE_TOP, width: 56, height: TAPE_HEIGHT, rx: 6, class: 'gauge-panel' }),
      tape,
      svg('path', { d: `M 14 ${TAPE_CENTER - 10} H 57 V ${TAPE_CENTER + 10} H 14 L 8 ${TAPE_CENTER} Z`, class: 'alt-box' }),
      this.readout,
      svgText('高度', { x: 30, y: LABEL_Y, class: 'gauge-label' }),
    );
    root.append(face);
  }

  private drawTicks(anchor: number): void {
    const yOf = (meters: number): number => TAPE_CENTER - (meters - anchor) * PX_PER_METER;
    const groundY = yOf(0);
    this.ticks.replaceChildren(
      svg('rect', { x: 0, y: groundY, width: 60, height: TAPE_HEIGHT * 2, class: 'alt-ground' }),
      svg('rect', { x: 2, y: yOf(this.lowAltitude), width: 5, height: this.lowAltitude * PX_PER_METER, class: 'alt-low-band' }),
    );
    for (let meters = anchor - TICK_RANGE; meters <= anchor + TICK_RANGE; meters += TICK_STEP) {
      if (meters < 0) continue;
      const y = yOf(meters);
      const major = meters % 10 === 0;
      this.ticks.append(svg('line', { x1: 8, y1: y, x2: major ? 18 : 13, y2: y, class: 'alt-tick' }));
      if (major) this.ticks.append(svgText(String(meters), { x: 22, y, class: 'alt-label' }));
    }
  }

  update(altitude: number, warning: boolean): void {
    const anchor = Math.round(altitude / TICK_STEP) * TICK_STEP;
    if (anchor !== this.anchor) {
      this.anchor = anchor;
      this.drawTicks(anchor);
    }
    this.ticks.setAttribute('transform', `translate(0 ${(altitude - anchor) * PX_PER_METER})`);
    const shown = Math.max(0, Math.round(altitude));
    this.readout.textContent = String(shown);
    this.root.dataset.zone = warning ? 'low' : 'normal';
    this.root.setAttribute('aria-valuenow', String(shown));
  }
}

const SEGMENTS = 12;
const BAR_TOP = 18;
const BAR_BOTTOM = 116;
const SEGMENT_GAP = 1.5;

export class ThrottleGauge {
  private segments: SVGElement[] = [];
  private readout: SVGElement;

  constructor(private root: HTMLElement) {
    const face = svg('svg', { viewBox: `0 0 44 ${GAUGE_HEIGHT}`, 'aria-hidden': 'true' });
    const segmentHeight = (BAR_BOTTOM - BAR_TOP - 4 - SEGMENT_GAP * (SEGMENTS - 1)) / SEGMENTS;
    face.append(svg('rect', { x: 9, y: BAR_TOP - 2, width: 26, height: BAR_BOTTOM - BAR_TOP + 2, rx: 4, class: 'gauge-panel' }));
    for (let i = 0; i < SEGMENTS; i++) {
      const ratio = (i + 1) / SEGMENTS;
      const level = ratio <= 0.6 ? 'low' : ratio <= 0.85 ? 'mid' : 'high';
      const y = BAR_BOTTOM - 2 - (i + 1) * segmentHeight - i * SEGMENT_GAP;
      const segment = svg('rect', { x: 12, y, width: 20, height: segmentHeight, rx: 1.5, class: `thr-seg thr-${level}` });
      this.segments.push(segment);
      face.append(segment);
    }
    this.readout = svg('text', { x: 22, y: 9, class: 'thr-readout' });
    face.append(this.readout, svgText('スロットル', { x: 22, y: LABEL_Y, class: 'gauge-label' }));
    root.append(face);
  }

  update(throttle: number): void {
    const percent = Math.round(clamp(throttle, 0, 1) * 100);
    const lit = Math.round((percent / 100) * SEGMENTS);
    this.segments.forEach((segment, i) => segment.classList.toggle('on', i < lit));
    this.readout.textContent = `${percent}%`;
    this.root.setAttribute('aria-valuenow', String(percent));
  }
}
