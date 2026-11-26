import { GROUND_Y, VIEW, groundY, themeOf } from './logic.js';

const off = document.createElement('canvas');
off.width = VIEW.w;
off.height = VIEW.h;
const g = off.getContext('2d');

const PLAYER_COLORS = { body: '#ffd23f', wing: '#fff4c2', trim: '#2a6fdb' };
const ENEMY_COLORS = { body: '#6b5a8e', wing: '#9a8bbd', trim: '#2b2140' };
const CHASER_COLORS = { body: '#3f7a6b', wing: '#7fb8a6', trim: '#173a31' };

export const HERO = { face: '#ffffff', helmet: '#8a4b22', beak: '#ff9a2e', eye: '#111', cheek: '#ff9db0', scarf: '#e8453c' };
const CROW = { face: '#2b2b33', helmet: '#55505e', beak: '#3a3a3a', eye: '#ffd23f', scarf: '#9b3fd1' };
const OWL = { face: '#a8743f', helmet: '#4e3a2a', beak: '#ffcf3a', eye: '#ffd23f', cheek: '#e8c79a', scarf: '#2f8f6b' };

const rect = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), w, h);
};

export function drawPilot(c, pilot, t) {
    const px = (x, y, w, h, color) => {
        c.fillStyle = color;
        c.fillRect(x, y, w, h);
    };
    const flutter = Math.floor(t * 10) % 2;
    px(-9, -3, 3, 1, pilot.scarf);
    px(-12, -3 - flutter, 3, 1, pilot.scarf);
    px(-6, -7, 5, 4, pilot.face);
    if (pilot.cheek) px(-5, -5, 1, 1, pilot.cheek);
    px(-3, -6, 1, 1, pilot.eye);
    px(-1, -5, 2, 1, pilot.beak);
    px(-6, -9, 5, 2, pilot.helmet);
    px(-7, -8, 1, 4, pilot.helmet);
    px(-4, -9, 3, 1, '#8fe3ff');
}

export function drawPlane(x, y, angle, colors, pilot, t, flip = false) {
    g.save();
    g.translate(Math.round(x), Math.round(y));
    g.rotate(angle);
    if (flip) g.scale(1, -1);
    g.fillStyle = colors.body;
    g.fillRect(-10, -2, 18, 4);
    g.fillRect(-11, -5, 3, 4);
    drawPilot(g, pilot, t);
    g.fillStyle = colors.wing;
    g.fillRect(-1, -7, 10, 2);
    g.fillRect(0, 2, 9, 2);
    g.fillStyle = colors.trim;
    g.fillRect(0, -5, 1, 7);
    g.fillRect(7, -5, 1, 7);
    g.fillRect(-8, -1, 12, 1);
    g.fillStyle = '#ddd';
    const blade = Math.floor(t * 30) % 2 ? 3 : 6;
    g.fillRect(8, -blade / 2, 1, blade);
    g.restore();
}

function drawSky(theme, cam, t) {
    const grad = g.createLinearGradient(0, 0, 0, VIEW.h);
    grad.addColorStop(0, theme.sky[0]);
    grad.addColorStop(1, theme.sky[1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, VIEW.w, VIEW.h);
    if (theme.stars) {
        for (let i = 0; i < 40; i++) {
            const sx = (i * 97 - cam * 0.05) % VIEW.w;
            const twinkle = (i + Math.floor(t * 2)) % 7 ? '#fff' : '#8899ff';
            rect((sx + VIEW.w) % VIEW.w, (i * 53) % 110, 1, 1, twinkle);
        }
    }
    g.fillStyle = theme.far;
    g.beginPath();
    g.moveTo(0, VIEW.h);
    for (let sx = 0; sx <= VIEW.w; sx += 4) {
        const wx = sx + cam * 0.25;
        g.lineTo(sx, 120 - 18 * Math.abs(Math.sin(wx / 70)) - 10 * Math.sin(wx / 23));
    }
    g.lineTo(VIEW.w, VIEW.h);
    g.fill();
    for (let i = 0; i < 6; i++) {
        const span = 520;
        const sx = (((i * 140 - cam * 0.5) % span) + span) % span - 60;
        const sy = 18 + ((i * 37) % 60);
        rect(sx, sy, 34, 6, theme.cloud);
        rect(sx + 6, sy - 4, 20, 4, theme.cloud);
    }
}

function drawGround(theme, level, cam) {
    for (let sx = 0; sx < VIEW.w; sx += 2) {
        const wx = cam + sx;
        const y = Math.round(groundY(level, wx));
        rect(sx, y, 2, VIEW.h - y, theme.dirt);
        rect(sx, y, 2, 3, theme.ground);
        if (Math.floor(wx / 2) % 9 === 0) rect(sx, y + 7, 1, 1, theme.ground);
    }
}

function drawHangar(hx) {
    rect(hx, GROUND_Y - 18, 34, 18, '#8a6d4a');
    rect(hx + 2, GROUND_Y - 22, 30, 4, '#b0412e');
    rect(hx + 10, GROUND_Y - 12, 14, 12, '#2c2c2c');
}

function drawWindsock(sx) {
    rect(sx, GROUND_Y - 20, 1, 20, '#ddd');
    rect(sx + 1, GROUND_Y - 20, 6, 3, '#ff7a2a');
}

function drawAirfield({ x0, x1 }, cam, hangarAtStart) {
    const sx = x0 - cam;
    if (sx > VIEW.w + 50 || x1 - cam < -50) return;
    rect(sx, GROUND_Y - 1, x1 - x0, 4, '#5b5f66');
    for (let x = x0 + 8; x < x1 - 8; x += 20) rect(x - cam, GROUND_Y, 10, 1, '#fff');
    if (hangarAtStart) {
        drawHangar(sx - 44);
        drawWindsock(x1 - cam + 6);
    } else {
        drawHangar(x1 - cam + 12);
        drawWindsock(sx - 10);
    }
}

function drawFort(fort, cam, t) {
    const sx = fort.x - cam;
    if (sx < -60 || sx > VIEW.w + 60) return;
    if (fort.alive) {
        rect(sx - 30, GROUND_Y - 16, 60, 16, '#5c5f6e');
        rect(sx - 26, GROUND_Y - 24, 18, 8, '#4a4c58');
        rect(sx + 6, GROUND_Y - 30, 14, 14, '#4a4c58');
        rect(sx + 12, GROUND_Y - 44, 1, 14, '#ccc');
        rect(sx + 13, GROUND_Y - 44 + (Math.floor(t * 4) % 2), 8, 5, '#9b3fd1');
        for (let i = 0; i < 4; i++) rect(sx - 24 + i * 14, GROUND_Y - 11, 6, 4, '#ffe08a');
    } else {
        for (let i = 0; i < 7; i++) rect(sx - 28 + i * 8, GROUND_Y - 4 - (i % 3) * 3, 7, 6 + (i % 3) * 3, '#3a3a3a');
    }
}

function drawGun(gun, cam, player) {
    const sx = gun.x - cam;
    if (!gun.alive) {
        rect(sx - 5, gun.y - 3, 10, 3, '#333');
        return;
    }
    const a = Math.atan2(player.y - (gun.y - 6), player.x - gun.x);
    g.strokeStyle = '#2d2d2d';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(sx, gun.y - 6);
    g.lineTo(sx + Math.cos(a) * 8, gun.y - 6 + Math.sin(a) * 8);
    g.stroke();
    rect(sx - 6, gun.y - 6, 12, 6, '#6e6a55');
    rect(sx - 3, gun.y - 8, 6, 3, '#55513f');
}

function drawCrate(c, cam) {
    const sx = c.x - cam;
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(sx, c.y - 10, 9, Math.PI, 0);
    g.fill();
    for (let i = -1; i <= 1; i += 2) rect(sx + i * 4 - 1, c.y - 19, 2, 9, '#e8453c');
    g.strokeStyle = '#ddd';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(sx - 9, c.y - 10);
    g.lineTo(sx - 3, c.y);
    g.moveTo(sx + 9, c.y - 10);
    g.lineTo(sx + 3, c.y);
    g.stroke();
    rect(sx - 4, c.y, 8, 7, '#a0703a');
    rect(sx - 2, c.y + 2, 4, 3, '#222');
}

export function render(state, canvas, ctx, view) {
    const { cam, level, stage, player, clock } = state;
    const theme = themeOf(level);
    drawSky(theme, cam, clock);
    drawGround(theme, level, cam);
    drawAirfield(stage.base, cam, true);
    drawAirfield(stage.runway, cam, false);
    drawFort(state.fort, cam, clock);
    for (const gun of state.guns) drawGun(gun, cam, player);
    for (const c of state.crates) drawCrate(c, cam);
    for (const e of state.enemies) {
        const colors = e.kind === 'chaser' ? CHASER_COLORS : ENEMY_COLORS;
        if (e.kind === 'chaser') drawPlane(e.x - cam, e.y, 0, colors, OWL, clock);
        else drawPlane(e.x - cam, e.y, Math.PI, colors, CROW, clock, true);
    }
    for (const s of state.shots) rect(s.x - cam - 1, s.y - 1, 3, 2, '#fff36b');
    for (const s of state.eshots) rect(s.x - cam - 1, s.y - 1, 3, 3, Math.floor(clock * 12) % 2 ? '#ff5a3c' : '#fff');
    for (const b of state.bombs) {
        rect(b.x - cam - 2, b.y - 2, 5, 4, '#222');
        rect(b.x - cam - 4, b.y - 2, 2, 4, '#555');
    }
    const p = player;
    const visible = p.mode !== 'down' && !(p.inv > 0 && Math.floor(clock * 12) % 2);
    if (visible) {
        drawPlane(p.x - cam, p.y, p.a, PLAYER_COLORS, HERO, clock);
        if (p.hasBomb) rect(p.x - cam - 2, p.y + 5, 4, 3, '#222');
    }
    for (const q of state.particles) rect(q.x - cam, q.y, q.size, q.size, q.color);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0f24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, view.ox, view.oy, VIEW.w * view.s, VIEW.h * view.s);
    drawTexts(state, ctx, view);
}

function text(ctx, str, x, y, size, color = '#fff', align = 'center') {
    ctx.font = `bold ${size}px system-ui, -apple-system, 'Hiragino Sans', sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 6);
    ctx.strokeStyle = '#000';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
}

function drawTexts(state, ctx, view) {
    const toScreen = (x, y) => [view.ox + (x - state.cam) * view.s, view.oy + y * view.s];
    const unit = view.s;
    for (const pop of state.popups) {
        const [x, y] = toScreen(pop.x, pop.y);
        text(ctx, pop.text, x, y, 6 * unit, pop.color ?? '#ffd23f');
    }
    if (state.banner) {
        const cx = view.ox + (VIEW.w / 2) * unit;
        text(ctx, state.banner.text, cx, view.oy + 62 * unit, 14 * unit, '#ffd23f');
        if (state.banner.sub) text(ctx, state.banner.sub, cx, view.oy + 82 * unit, 7 * unit);
    }
    const p = state.player;
    if (p.mode === 'spin') {
        const [x, y] = toScreen(p.x, p.y - 18);
        const blink = Math.floor(state.clock * 8) % 2 ? '#ff5a3c' : '#fff';
        text(ctx, `ボタン れんだ！ ${p.rescue}/${state.rescueTaps}`, x, y, 7 * unit, blink);
    }
    if (state.enemies.some((e) => e.kind === 'chaser' && e.x < state.cam) && Math.floor(state.clock * 6) % 2) {
        text(ctx, '◀ うしろ！', view.ox + 8 * unit, view.oy + 100 * unit, 8 * unit, '#ff5a3c', 'left');
    }
}
