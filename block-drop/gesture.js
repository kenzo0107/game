export const SLOP_PX = 10;
export const TAP_MAX_MS = 250;
export const FLICK_PX_PER_MS = 0.8;
export const FLICK_MIN_PX = 36;
const VELOCITY_WINDOW_MS = 80;

// 斜めの動きで横移動と下移動が混ざると狙った列に置きにくいため、最初に大きく動いた向きに軸を固定する
export function createGesture(step) {
    let start = null;
    let anchor = null;
    let axis = null;
    let samples = [];

    const velocityY = (t) => {
        const recent = samples.filter((s) => t - s.t <= VELOCITY_WINDOW_MS);
        if (recent.length < 2) return 0;
        const a = recent[0];
        const b = recent[recent.length - 1];
        return b.t === a.t ? 0 : (b.y - a.y) / (b.t - a.t);
    };

    return {
        start(x, y, t) {
            start = { x, y, t };
            anchor = { x, y };
            axis = null;
            samples = [{ y, t }];
        },
        move(x, y, t) {
            if (!start) return [];
            samples.push({ y, t });
            const dx = x - start.x;
            const dy = y - start.y;
            if (axis === null && Math.hypot(dx, dy) >= SLOP_PX) axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
            const actions = [];
            if (axis === 'h') {
                while (x - anchor.x >= step) {
                    anchor.x += step;
                    actions.push('right');
                }
                while (anchor.x - x >= step) {
                    anchor.x -= step;
                    actions.push('left');
                }
            } else if (axis === 'v') {
                while (y - anchor.y >= step) {
                    anchor.y += step;
                    actions.push('down');
                }
                anchor.y = Math.min(anchor.y, y);
            }
            return actions;
        },
        end(x, y, t) {
            if (!start) return [];
            const actions = this.move(x, y, t);
            const dy = y - start.y;
            const vy = velocityY(t);
            if (axis === null && t - start.t <= TAP_MAX_MS) actions.push('cw');
            else if (axis === 'v' && dy >= FLICK_MIN_PX && vy >= FLICK_PX_PER_MS) actions.push('drop');
            else if (axis === 'v' && dy <= -FLICK_MIN_PX && vy <= -FLICK_PX_PER_MS) actions.push('hold');
            start = null;
            return actions;
        },
        cancel() {
            start = null;
        },
    };
}
