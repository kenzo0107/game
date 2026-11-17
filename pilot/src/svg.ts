const SVG_NS = 'http://www.w3.org/2000/svg';

export const svg = (tag: string, attrs: Record<string, string | number> = {}): SVGElement => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
};

export const svgText = (text: string, attrs: Record<string, string | number>): SVGElement => {
  const el = svg('text', attrs);
  el.textContent = text;
  return el;
};

export const GAUGE_HEIGHT = 142;
export const LABEL_Y = 131;
