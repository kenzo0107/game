const particles = [];
const popups = [];
const banners = [];
const shake = { power: 0, x: 0, y: 0 };

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

function clearEffects() {
    particles.length = 0;
    popups.length = 0;
    banners.length = 0;
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

function updateEffects() {
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

function drawEffects(viewWidth) {
    for (const p of particles) drawParticle(p);

    for (const p of popups) {
        const scale = p.age < 6 ? 0.5 + p.age * 0.15 : Math.max(1.4 - (p.age - 6) * 0.08, 1);
        ctx.globalAlpha = p.age > p.life - 15 ? (p.life - p.age) / 15 : 1;
        outlinedText(p.text, p.x, p.y, p.size * scale, p.color);
    }
    ctx.globalAlpha = 1;

    for (const b of banners) {
        const scale = b.age < 8 ? 2.2 - b.age * 0.15 : 1;
        const wobble = Math.sin(b.age * 0.3) * 2;
        ctx.globalAlpha = b.age > b.life - 20 ? (b.life - b.age) / 20 : 1;
        outlinedText(b.text, viewWidth / 2, 190 + wobble, 34 * scale, b.color);
    }
    ctx.globalAlpha = 1;
}
