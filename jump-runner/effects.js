const particles = [];
const popups = [];
const banners = [];
const shake = { power: 0, x: 0, y: 0 };
const marks = [];
const bubbles = [];
const focus = { x: 0, y: 0, age: 0, life: 0, color: '#111', rays: [] };
let hitStopTicks = 0;

const COMIC_WORDS = ['ボコッ!', 'ドカッ!', 'POW!', 'ペシャ!', 'バキッ!'];

function randRange(min, max) {
    return min + Math.random() * (max - min);
}

function spawnParticle(props) {
    particles.push({ vx: 0, vy: 0, gravity: 0, drag: 1, life: 30, age: 0, size: 4, angle: 0, spin: 0, color: '#fff', ...props });
}

function addPopup(x, y, text, color = '#FFD700', size = 18) {
    popups.push({ x, y, text, color, size, age: 0, life: 55 });
}

function addBanner(text, color = '#FFD700') {
    banners.length = 0;
    banners.push({ text, color, age: 0, life: 100 });
}

function shakeScreen(power) {
    shake.power = Math.max(shake.power, power);
}

function comicSfx(x, y, text, color = '#FFEB3B', size = 16, life = 30) {
    spawnParticle({ kind: 'sfx', x, y, text, color, size, life, vy: -0.5, drag: 0.97, angle: randRange(-0.35, 0.35) });
}

function focusLines(x, y, life = 18, color = '#111') {
    Object.assign(focus, { x, y, life, age: 0, color });
    rollFocusRays();
}

function rollFocusRays() {
    focus.rays = [];
    for (let a = 0; a < Math.PI * 2; a += randRange(0.08, 0.16)) {
        focus.rays.push({ angle: a, width: randRange(0.012, 0.035), inner: randRange(0.45, 0.75) });
    }
}

// 同じ漫符を毎フレーム付け直しても出現アニメーションが繰り返されないよう、表示中なら寿命だけ延ばす
function addMark(target, kind, life = 40) {
    const existing = marks.find((m) => m.target === target && m.kind === kind);
    if (existing) {
        existing.life = Math.max(existing.life, existing.age + life);
        return;
    }
    marks.push({ target, kind, age: 0, life });
}

function say(target, text, life = 60) {
    if (bubbles.some((b) => b.text === text)) return;
    bubbles.length = 0;
    bubbles.push({ target, text, age: 0, life });
}

function hitStop(ticks) {
    hitStopTicks = Math.max(hitStopTicks, ticks);
}

function clearEffects() {
    particles.length = 0;
    popups.length = 0;
    banners.length = 0;
    marks.length = 0;
    bubbles.length = 0;
    focus.life = 0;
    hitStopTicks = 0;
    shake.power = 0;
    shake.x = 0;
    shake.y = 0;
}

function smokePuffs(x, y, count, spread = 1) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + randRange(-0.3, 0.3);
        spawnParticle({
            kind: 'smoke', x, y,
            vx: Math.cos(angle) * randRange(0.8, 2) * spread,
            vy: Math.sin(angle) * randRange(0.5, 1.5) * spread - 0.5,
            drag: 0.92, size: randRange(7, 12), life: randRange(28, 40),
        });
    }
}

function starBurst(x, y, count, colors = ['#FFE14D', '#FFF59D', '#FFB300']) {
    for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + randRange(-1.4, 1.4);
        const speed = randRange(3, 6);
        spawnParticle({
            kind: 'star', x, y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            gravity: 0.25, size: randRange(5, 8), life: randRange(35, 50),
            spin: randRange(-0.3, 0.3), color: colors[i % colors.length],
        });
    }
}

function sparkle(x, y, color = '#FFF59D', count = 8) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count;
        spawnParticle({
            kind: 'spark', x, y,
            vx: Math.cos(angle) * 2.5, vy: Math.sin(angle) * 2.5,
            drag: 0.9, size: 3, life: 20, color,
        });
    }
}

function stompEffect(x, y, color, width) {
    spawnParticle({ kind: 'flat', x, y, size: width, color, life: 14 });
    smokePuffs(x, y, 7);
    starBurst(x, y - 6, 7);
    spawnParticle({ kind: 'burst', x, y: y - 14, size: 26, life: 26, text: COMIC_WORDS[Math.floor(Math.random() * COMIC_WORDS.length)] });
    shakeScreen(5);
}

function poofEffect(x, y) {
    smokePuffs(x, y, 9, 1.4);
    starBurst(x, y, 4);
    shakeScreen(4);
}

function explosionEffect(x, y, scale = 1) {
    spawnParticle({ kind: 'ring', x, y, size: 10 * scale, life: 22, color: '#FFB300' });
    for (let i = 0; i < 14 * scale; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = randRange(2, 6) * scale;
        spawnParticle({
            kind: 'spark', x, y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            drag: 0.93, size: randRange(3, 6), life: randRange(25, 40),
            color: ['#FF5722', '#FFC107', '#FFEB3B'][i % 3],
        });
    }
    smokePuffs(x, y, Math.round(8 * scale), 1.5 * scale);
    shakeScreen(6 * scale);
}

function runDust(x, y) {
    spawnParticle({ kind: 'dust', x, y, vx: -randRange(0.5, 1.5), vy: -randRange(0.2, 0.8), drag: 0.95, size: randRange(3, 5), life: 22 });
}

function landingDust(x, y) {
    for (const dir of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
            spawnParticle({ kind: 'dust', x, y, vx: dir * randRange(1, 2.5), vy: -randRange(0.3, 1), drag: 0.9, size: randRange(4, 6), life: 24 });
        }
    }
}

function jumpRing(x, y) {
    spawnParticle({ kind: 'ring', x, y, size: 8, life: 18, color: '#FFFFFF' });
}

function speedLine(viewWidth, top, bottom, speed) {
    spawnParticle({
        kind: 'line', x: viewWidth + 20, y: randRange(top, bottom),
        vx: -speed * randRange(4, 6), size: randRange(30, 70), life: 60,
    });
}

function motionLine(x, y, length, vy) {
    spawnParticle({ kind: 'vline', x, y, vy, size: length, life: 12 });
}

function updateEffects() {
    for (const list of [marks, bubbles]) {
        for (let i = list.length - 1; i >= 0; i--) {
            if (++list[i].age >= list[i].life) list.splice(i, 1);
        }
    }
    if (focus.age < focus.life) {
        focus.age++;
        if (focus.age % 3 === 0) rollFocusRays();
    }
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        if (++p.age >= p.life) particles.splice(i, 1);
    }
    for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.y -= Math.max(1.6 - p.age * 0.04, 0.3);
        if (++p.age >= p.life) popups.splice(i, 1);
    }
    for (let i = banners.length - 1; i >= 0; i--) {
        if (++banners[i].age >= banners[i].life) banners.splice(i, 1);
    }
    shake.power *= 0.85;
    if (shake.power < 0.3) shake.power = 0;
    shake.x = randRange(-1, 1) * shake.power;
    shake.y = randRange(-1, 1) * shake.power;
}

function starPath(cx, cy, outer, inner, points = 5, angle = 0) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = angle + (i * Math.PI) / points - Math.PI / 2;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
}

function outlinedText(text, x, y, size, color) {
    ctx.font = `900 ${size}px 'Arial Black', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size / 4;
    ctx.strokeStyle = '#222';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.lineJoin = 'miter';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

// 漫画の描き文字らしく見せるため、白・黒の二重フチに影を重ねる
function comicText(text, x, y, size, color, angle = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.font = `900 ${size}px 'Arial Black', 'Hiragino Sans', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size / 2.2;
    ctx.strokeStyle = '#111';
    ctx.strokeText(text, size * 0.08, size * 0.1);
    ctx.strokeStyle = '#FFF';
    ctx.strokeText(text, 0, 0);
    ctx.lineWidth = size / 5;
    ctx.strokeStyle = '#111';
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
}

function popScale(age) {
    if (age < 4) return 0.4 + age * 0.3;
    return Math.max(1.6 - (age - 4) * 0.12, 1);
}

function drawFocusLines() {
    if (focus.age >= focus.life) return;
    const top = view.top;
    const bottom = view.bottom;
    const radius = Math.hypot(Math.max(focus.x, view.width - focus.x), Math.max(focus.y - top, bottom - focus.y)) + 20;
    ctx.globalAlpha = Math.min(1, (1 - focus.age / focus.life) * 2) * 0.85;
    ctx.fillStyle = focus.color;
    ctx.beginPath();
    for (const ray of focus.rays) {
        const inner = radius * ray.inner;
        ctx.moveTo(focus.x + Math.cos(ray.angle - ray.width) * radius, focus.y + Math.sin(ray.angle - ray.width) * radius);
        ctx.lineTo(focus.x + Math.cos(ray.angle) * inner, focus.y + Math.sin(ray.angle) * inner);
        ctx.lineTo(focus.x + Math.cos(ray.angle + ray.width) * radius, focus.y + Math.sin(ray.angle + ray.width) * radius);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
}

function drawMark(m) {
    const t = m.target;
    const headX = t.x + t.width / 2;
    ctx.globalAlpha = m.age > m.life - 8 ? (m.life - m.age) / 8 : 1;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111';
    switch (m.kind) {
        case '!': {
            const x = t.x - 8;
            const y = t.y - 18;
            comicText('!', x, y, 24 * popScale(m.age) / 1.3, '#FF1744', -0.15);
            for (const a of [-2.6, -1.9, -1.2]) {
                ctx.beginPath();
                ctx.moveTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16);
                ctx.lineTo(x + Math.cos(a) * 24, y + Math.sin(a) * 24);
                ctx.stroke();
            }
            break;
        }
        case 'sweat':
            for (const [dx, dy, r] of [[4, 2, 5], [12, 12, 3.5]]) {
                const x = t.x + t.width + dx;
                const y = t.y + dy + (m.age % 20) * 0.4;
                ctx.fillStyle = '#81D4FA';
                ctx.beginPath();
                ctx.moveTo(x, y - r * 2.2);
                ctx.quadraticCurveTo(x + r * 1.2, y - r * 0.2, x, y + r);
                ctx.quadraticCurveTo(x - r * 1.2, y - r * 0.2, x, y - r * 2.2);
                ctx.fill();
                ctx.stroke();
            }
            break;
        case 'anger': {
            const x = t.x + 4;
            const y = t.y - 6;
            const s = 7 * (m.age < 4 ? 0.5 + m.age * 0.2 : 1 + Math.sin(m.age * 0.5) * 0.1);
            ctx.strokeStyle = '#E53935';
            ctx.lineWidth = 3;
            for (let i = 0; i < 4; i++) {
                const a = (Math.PI / 2) * i + Math.PI / 4;
                ctx.beginPath();
                ctx.arc(x + Math.cos(a) * s, y + Math.sin(a) * s, s * 0.7, a + Math.PI * 0.75, a + Math.PI * 1.25);
                ctx.stroke();
            }
            break;
        }
        case 'dizzy':
            for (let i = 0; i < 3; i++) {
                const a = m.age * 0.2 + (i * Math.PI * 2) / 3;
                ctx.fillStyle = '#FFEB3B';
                starPath(headX + Math.cos(a) * 20, t.y - 6 + Math.sin(a) * 6, 6, 2.7, 5, a);
                ctx.fill();
                ctx.stroke();
            }
            break;
    }
    ctx.globalAlpha = 1;
}

function drawBubble(b) {
    const t = b.target;
    const scale = b.age < 5 ? 0.5 + b.age * 0.1 : 1;
    const width = (b.text.length * 12 + 20) * scale;
    const height = 26 * scale;
    const x = Math.min(t.x + t.width / 2 + 40, view.width - width / 2 - 4);
    const y = Math.max(t.y - 30, view.top + height);
    const tipX = t.x + t.width - 4;
    const tipY = t.y + 2;
    ctx.globalAlpha = b.age > b.life - 10 ? (b.life - b.age) / 10 : 1;
    const shape = () => {
        ctx.beginPath();
        ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
        ctx.moveTo(x - width * 0.22, y + height * 0.3);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(x - width * 0.05, y + height * 0.4);
        ctx.closePath();
    };
    // 本体と尻尾の境目に線が残らないよう、太線で輪郭を描いてから白で塗りつぶして内側の線を消す
    shape();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#FFF';
    ctx.fill();
    ctx.font = `900 ${12 * scale}px 'Hiragino Sans', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111';
    ctx.fillText(b.text, x, y + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
}

function drawHalftone(x, y, width, height, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let px = x + 4; px < x + width; px += 8) {
        const r = 0.6 + ((px - x) / width) * 2.6;
        for (let py = y + 4 + ((px - x) % 16 === 4 ? 0 : 4); py < y + height; py += 8) {
            ctx.moveTo(px + r, py);
            ctx.arc(px, py, r, 0, Math.PI * 2);
        }
    }
    ctx.fill();
}

function drawBanner(b) {
    const scale = b.age < 8 ? 2.2 - b.age * 0.15 : 1;
    const width = Math.max(b.text.length * 26 + 40, 200);
    const height = 60;
    ctx.globalAlpha = b.age > b.life - 20 ? (b.life - b.age) / 20 : 1;
    ctx.save();
    ctx.translate(view.width / 2, 190 + Math.sin(b.age * 0.3) * 2);
    ctx.rotate(-0.05);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#111';
    ctx.fillRect(-width / 2 + 6, -height / 2 + 6, width, height);
    ctx.fillStyle = '#FFF';
    ctx.fillRect(-width / 2, -height / 2, width, height);
    drawHalftone(-width / 2, -height / 2, width, height, b.color);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 4;
    ctx.strokeRect(-width / 2, -height / 2, width, height);
    comicText(b.text, 0, 0, 30, b.color, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
}

function drawParticle(p) {
    const t = p.age / p.life;
    ctx.globalAlpha = Math.min(1, (1 - t) * 1.5);
    switch (p.kind) {
        case 'smoke':
            ctx.fillStyle = '#F5F5F5';
            ctx.strokeStyle = '#9E9E9E';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (0.6 + t), 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
        case 'dust':
            ctx.fillStyle = '#D7CCC8';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (0.5 + t), 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'star':
            ctx.fillStyle = p.color;
            ctx.strokeStyle = '#5D4037';
            ctx.lineWidth = 1.5;
            starPath(p.x, p.y, p.size, p.size * 0.45, 5, p.angle);
            ctx.fill();
            ctx.stroke();
            break;
        case 'spark':
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (1 - t * 0.6), 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'ring':
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 3 * (1 - t) + 1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size + t * 30, 0, Math.PI * 2);
            ctx.stroke();
            break;
        case 'flat':
            ctx.fillStyle = p.color;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, p.size / 2 * (1 + t * 0.4), 6 * (1 - t), 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
        case 'burst': {
            const scale = p.age < 5 ? 0.4 + p.age * 0.18 : 1.3 - Math.min(p.age - 5, 5) * 0.06;
            ctx.fillStyle = '#FFEB3B';
            ctx.strokeStyle = '#E53935';
            ctx.lineWidth = 3;
            starPath(p.x, p.y, p.size * scale, p.size * 0.6 * scale, 10, 0.1);
            ctx.fill();
            ctx.stroke();
            outlinedText(p.text, p.x, p.y, 13 * scale, '#FFFFFF');
            break;
        }
        case 'sfx': {
            const jitter = p.age < 8 ? randRange(-1, 1) : 0;
            comicText(p.text, p.x + jitter, p.y + jitter, p.size * popScale(p.age), p.color, p.angle);
            break;
        }
        case 'vline':
            ctx.globalAlpha *= 0.6;
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x, p.y + p.size);
            ctx.stroke();
            break;
        case 'line':
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.size, p.y);
            ctx.stroke();
            break;
    }
    ctx.globalAlpha = 1;
}

function drawEffects() {
    drawFocusLines();
    for (const p of particles) drawParticle(p);
    for (const m of marks) drawMark(m);
    for (const b of bubbles) drawBubble(b);

    for (const p of popups) {
        const scale = p.age < 6 ? 0.5 + p.age * 0.15 : Math.max(1.4 - (p.age - 6) * 0.08, 1);
        ctx.globalAlpha = p.age > p.life - 15 ? (p.life - p.age) / 15 : 1;
        outlinedText(p.text, p.x, p.y, p.size * scale, p.color);
    }
    ctx.globalAlpha = 1;

    for (const b of banners) drawBanner(b);
}
