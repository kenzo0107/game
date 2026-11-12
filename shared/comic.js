const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function rand(min, max) {
    return min + Math.random() * (max - min);
}

function fade(age, life, tail) {
    return age > life - tail ? Math.max(0, (life - age) / tail) : 1;
}

function popScale(age) {
    if (age < 0.07) return 0.4 + age * 18;
    return Math.max(1.6 - (age - 0.07) * 7, 1);
}

// ゲームの canvas に直接描かないのは、WebGL で描くゲームでは 2D の描画コンテキストを取れないため
export function createComic({ after, shakeTarget = after }) {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    after.after(canvas);
    const ctx = canvas.getContext('2d');

    let width = 0;
    let height = 0;
    let unit = 1;
    function resize() {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        width = innerWidth;
        height = innerHeight;
        unit = Math.min(Math.max(Math.min(width, height) / 375, 1), 1.8);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    addEventListener('resize', resize);
    resize();

    const particles = [];
    const marks = [];
    const bubbles = [];
    const banners = [];
    const focus = { x: 0, y: 0, age: 0, life: 0, color: '#111', rays: [], reroll: 0 };
    let shakePower = 0;
    let stopUntil = 0;

    function spawn(props) {
        particles.push({ vx: 0, vy: 0, gravity: 0, drag: 1, age: 0, life: 0.5, size: 4, angle: 0, spin: 0, color: '#fff', ...props });
    }

    function rollRays() {
        focus.rays = [];
        for (let a = 0; a < Math.PI * 2; a += rand(0.08, 0.16)) {
            focus.rays.push({ angle: a, width: rand(0.012, 0.035), inner: rand(0.4, 0.7) });
        }
    }

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

    function starPath(cx, cy, outer, inner, points, angle) {
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? outer : inner;
            const a = angle + (i * Math.PI) / points - Math.PI / 2;
            ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        ctx.closePath();
    }

    function drawFocus() {
        if (focus.age >= focus.life) return;
        const radius = Math.hypot(Math.max(focus.x, width - focus.x), Math.max(focus.y, height - focus.y)) + 20;
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

    function drawParticle(p) {
        const t = p.age / p.life;
        ctx.globalAlpha = Math.min(1, (1 - t) * 1.5);
        switch (p.kind) {
            case 'sfx': {
                const jitter = p.age < 0.13 ? rand(-1, 1) * unit : 0;
                comicText(p.text, p.x + jitter, p.y + jitter, p.size * popScale(p.age), p.color, p.angle);
                break;
            }
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
            case 'smoke':
                ctx.fillStyle = '#F5F5F5';
                ctx.strokeStyle = '#9E9E9E';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * (0.6 + t), 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                break;
            case 'streak':
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - p.vx * p.size, p.y - p.vy * p.size);
                ctx.stroke();
                break;
        }
        ctx.globalAlpha = 1;
    }

    function drawMark(m) {
        const head = m.target();
        if (!head) return;
        ctx.globalAlpha = fade(m.age, m.life, 0.15);
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        const s = 7 * unit;
        switch (m.kind) {
            case '!': {
                const x = head.x - s * 2.5;
                const y = head.y - s * 2.5;
                comicText('!', x, y, s * 3.4 * popScale(m.age) / 1.3, '#FF1744', -0.15);
                for (const a of [-2.6, -1.9, -1.2]) {
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(a) * s * 2.3, y + Math.sin(a) * s * 2.3);
                    ctx.lineTo(x + Math.cos(a) * s * 3.4, y + Math.sin(a) * s * 3.4);
                    ctx.stroke();
                }
                break;
            }
            case 'sweat':
                for (const [dx, dy, r] of [[1.6, 0.6, 0.7], [2.6, 2, 0.5]]) {
                    const x = head.x + dx * s;
                    const y = head.y + dy * s + (m.age % 0.33) * s * 1.6;
                    const rr = r * s;
                    ctx.fillStyle = '#81D4FA';
                    ctx.beginPath();
                    ctx.moveTo(x, y - rr * 2.2);
                    ctx.quadraticCurveTo(x + rr * 1.2, y - rr * 0.2, x, y + rr);
                    ctx.quadraticCurveTo(x - rr * 1.2, y - rr * 0.2, x, y - rr * 2.2);
                    ctx.fill();
                    ctx.stroke();
                }
                break;
            case 'anger': {
                const x = head.x + s * 1.6;
                const y = head.y - s * 0.6;
                const r = s * (m.age < 0.07 ? 0.5 + m.age * 7 : 1 + Math.sin(m.age * 30) * 0.1);
                ctx.strokeStyle = '#E53935';
                ctx.lineWidth = 3;
                for (let i = 0; i < 4; i++) {
                    const a = (Math.PI / 2) * i + Math.PI / 4;
                    ctx.beginPath();
                    ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.7, a + Math.PI * 0.75, a + Math.PI * 1.25);
                    ctx.stroke();
                }
                break;
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawBubble(b) {
        const head = b.target();
        if (!head) return;
        const scale = (b.age < 0.08 ? 0.5 + b.age * 6 : 1) * unit;
        const fontSize = 13 * scale;
        ctx.font = `900 ${fontSize}px 'Hiragino Sans', sans-serif`;
        const bw = ctx.measureText(b.text).width + 24 * scale;
        const bh = 28 * scale;
        const side = head.x > width * 0.6 ? -1 : 1;
        const x = Math.min(Math.max(head.x + side * (bw / 2 + 8 * unit), bw / 2 + 4), width - bw / 2 - 4);
        const y = Math.max(head.y - 34 * unit, bh / 2 + 4);
        ctx.globalAlpha = fade(b.age, b.life, 0.17);
        // 本体と尻尾を別々に縁取ると境目に線が残るため、まとめて太線で縁取ってから白で塗りつぶして内側の線を消す
        ctx.beginPath();
        ctx.ellipse(x, y, bw / 2, bh / 2, 0, 0, Math.PI * 2);
        ctx.moveTo(x - side * bw * 0.22, y + bh * 0.3);
        ctx.lineTo(head.x, head.y);
        ctx.lineTo(x - side * bw * 0.04, y + bh * 0.42);
        ctx.closePath();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.fillStyle = '#FFF';
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#111';
        ctx.fillText(b.text, x, y + 1);
        ctx.globalAlpha = 1;
    }

    function drawHalftone(x, y, w, h, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let px = x + 4; px < x + w; px += 8) {
            const r = 0.6 + ((px - x) / w) * 2.6;
            for (let py = y + 4 + ((px - x) % 16 === 4 ? 0 : 4); py < y + h; py += 8) {
                ctx.moveTo(px + r, py);
                ctx.arc(px, py, r, 0, Math.PI * 2);
            }
        }
        ctx.fill();
    }

    function drawBanner(b) {
        const pop = b.age < 0.13 ? 2.2 - b.age * 9 : 1;
        const size = 34 * unit;
        ctx.font = `900 ${size}px 'Arial Black', 'Hiragino Sans', sans-serif`;
        const bw = Math.min(ctx.measureText(b.text).width + 48 * unit, width - 24);
        const bh = (b.sub ? 86 : 64) * unit;
        ctx.globalAlpha = fade(b.age, b.life, 0.33);
        ctx.save();
        ctx.translate(width / 2, height * b.y + Math.sin(b.age * 18) * 2);
        ctx.rotate(-0.05);
        ctx.scale(pop, pop);
        ctx.fillStyle = '#111';
        ctx.fillRect(-bw / 2 + 6, -bh / 2 + 6, bw, bh);
        ctx.fillStyle = '#FFF';
        ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
        drawHalftone(-bw / 2, -bh / 2, bw, bh, b.color);
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 4;
        ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
        const textY = b.sub ? -bh * 0.14 : 0;
        comicText(b.text, 0, textY, size, b.color);
        if (b.sub) comicText(b.sub, 0, bh * 0.28, size * 0.42, '#FFF');
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    function update(dt) {
        const frames = dt * 60;
        for (const list of [particles, marks, bubbles, banners]) {
            for (let i = list.length - 1; i >= 0; i--) {
                if ((list[i].age += dt) >= list[i].life) list.splice(i, 1);
            }
        }
        for (const p of particles) {
            p.vx *= Math.pow(p.drag, frames);
            p.vy = p.vy * Math.pow(p.drag, frames) + p.gravity * frames;
            p.x += p.vx * frames;
            p.y += p.vy * frames;
            p.angle += p.spin * frames;
        }
        if (focus.age < focus.life) {
            focus.age += dt;
            if ((focus.reroll -= dt) <= 0) {
                focus.reroll = 0.05;
                rollRays();
            }
        }
        shakePower *= Math.pow(0.85, frames);
        if (shakePower < 0.3) shakePower = 0;
        if (shakeTarget) {
            shakeTarget.style.transform = shakePower
                ? `translate(${rand(-1, 1) * shakePower}px, ${rand(-1, 1) * shakePower}px)`
                : '';
        }
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);
        drawFocus();
        for (const p of particles) drawParticle(p);
        for (const m of marks) drawMark(m);
        for (const b of bubbles) drawBubble(b);
        for (const b of banners) drawBanner(b);
    }

    let last = 0;
    function loop(now) {
        const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
        last = now;
        update(dt);
        draw();
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    return {
        get unit() {
            return unit;
        },
        focus(x, y, { life = 0.3, color = '#111' } = {}) {
            const active = focus.age < focus.life;
            Object.assign(focus, { x, y, life, color, age: 0, reroll: active ? focus.reroll : 0 });
        },
        sfx(x, y, text, { color = '#FFEB3B', size = 36, angle = rand(-0.3, 0.3), life = 0.6 } = {}) {
            const px = size * unit;
            ctx.font = `900 ${px}px 'Arial Black', 'Hiragino Sans', sans-serif`;
            const half = Math.min((ctx.measureText(text).width / 2 + px * 0.3) * popScale(0.07), width / 2);
            const cx = Math.min(Math.max(x, half), width - half);
            spawn({ kind: 'sfx', x: cx, y, text, color, size: px, angle, life, vy: -0.5, drag: 0.97 });
        },
        stars(x, y, count, colors = ['#FFE14D', '#FFF59D', '#FFB300']) {
            for (let i = 0; i < count; i++) {
                const a = -Math.PI / 2 + rand(-1.4, 1.4);
                const speed = rand(3, 6) * unit;
                spawn({
                    kind: 'star', x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, gravity: 0.25 * unit,
                    size: rand(5, 8) * unit, life: rand(0.6, 0.85), spin: rand(-0.3, 0.3), color: colors[i % colors.length],
                });
            }
        },
        sparks(x, y, count, colors = ['#FF5722', '#FFC107', '#FFEB3B']) {
            for (let i = 0; i < count; i++) {
                const a = Math.random() * Math.PI * 2;
                const speed = rand(2, 6) * unit;
                spawn({
                    kind: 'spark', x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, drag: 0.93,
                    size: rand(2.5, 5) * unit, life: rand(0.4, 0.65), color: colors[i % colors.length],
                });
            }
        },
        smoke(x, y, count, spread = 1) {
            for (let i = 0; i < count; i++) {
                const a = (Math.PI * 2 * i) / count + rand(-0.3, 0.3);
                spawn({
                    kind: 'smoke', x, y, vx: Math.cos(a) * rand(0.8, 2) * spread * unit, vy: Math.sin(a) * rand(0.5, 1.5) * spread * unit - 0.5,
                    drag: 0.92, size: rand(7, 12) * unit, life: rand(0.45, 0.65),
                });
            }
        },
        streaks(x, y, count, color = '#FFF') {
            for (let i = 0; i < count; i++) {
                const a = Math.random() * Math.PI * 2;
                const speed = rand(6, 10) * unit;
                spawn({ kind: 'streak', x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, drag: 0.9, size: 3, life: 0.25, color });
            }
        },
        banner(text, { color = '#FFD23F', sub = '', life = 1.6, y = 0.4 } = {}) {
            banners.length = 0;
            banners.push({ text, sub, color, life, y, age: 0 });
        },
        // 毎フレーム付け直しても出現アニメーションが繰り返されないよう、表示中なら寿命だけ延ばす
        mark(target, kind, life = 0.8) {
            const existing = marks.find((m) => m.target === target && m.kind === kind);
            if (existing) existing.life = Math.max(existing.life, existing.age + life);
            else marks.push({ target, kind, life, age: 0 });
        },
        say(target, text, life = 1.1) {
            bubbles.length = 0;
            bubbles.push({ target, text, life, age: 0 });
        },
        shake(power) {
            if (!reducedMotion) shakePower = Math.max(shakePower, power * unit);
        },
        hitStop(ms) {
            stopUntil = Math.max(stopUntil, performance.now() + ms);
        },
        stopped() {
            return performance.now() < stopUntil;
        },
        clear() {
            particles.length = 0;
            marks.length = 0;
            bubbles.length = 0;
            banners.length = 0;
            focus.life = 0;
            shakePower = 0;
            stopUntil = 0;
        },
    };
}
