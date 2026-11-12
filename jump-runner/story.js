const BOSS_ROSTER = [
    { kind: 'tsuno', name: 'ツノダイマオウ', color: '#FF5252', taunt: 'このタネは わたさんぞ!', reply: 'かえしてもらうぜ!' },
    { kind: 'mecha', name: 'メカ・モンバン', color: '#FFA726', taunt: 'ココハ トオサナイ', reply: 'とおらせてもらうぜ!' },
    { kind: 'golem', name: 'ドスドスゴーレム', color: '#FFEE58', taunt: 'ゴゴゴ… ふみつぶして やる', reply: 'ふみつけて やるぜ!' },
    { kind: 'mole', name: 'アナホリモグーラ', color: '#66BB6A', taunt: 'タネは ちかに かくしたモグ!', reply: 'ほりだしてやる!' },
    { kind: 'rival', name: 'ライバル・アカボシ', color: '#29B6F6', taunt: 'タネが ほしけりゃ おいついてみな!', reply: 'まけないぜ!' },
    { kind: 'whale', name: 'クモノクジラ', color: '#3F51B5', taunt: 'くもの うえまで こられるかな~', reply: 'はねで とんでいくぜ!' },
    { kind: 'kage', name: 'カゲノオウ', color: '#AB47BC', taunt: 'すべての いろは わがものだ…', reply: 'みんなの いろを かえせ!' },
];

const SEED_GLOOM = 0.55;
const BOSS_GLOOM = 0.35;
const GLOOM_APPROACH_SCORE = 1500;
const STORY_GLOOM = SEED_GLOOM + BOSS_GLOOM * 0.6;

let gloom = SEED_GLOOM;

function gloomTarget() {
    const base = SEED_GLOOM * (1 - seedsCollected / BOSS_ROSTER.length);
    if (boss) return base + BOSS_GLOOM;
    const approach = (score - (nextBossScore - GLOOM_APPROACH_SCORE)) / GLOOM_APPROACH_SCORE;
    return base + BOSS_GLOOM * Math.min(Math.max(approach, 0), 1);
}

function updateGloom() {
    gloom += (gloomTarget() - gloom) * 0.02;
}

// ctx.filter は Safari の対応が新しく、描画ごとにかけると重いため、描いたあとの背景に彩度だけを合成で上書きする
function drawGloom(amount) {
    if (amount < 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.globalAlpha = Math.min(amount, 1);
    ctx.fillStyle = '#808080';
    ctx.fillRect(-50, view.top - 50, view.width + 100, view.bottom - view.top + 100);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(amount, 1) * 0.18;
    ctx.fillStyle = '#2A1840';
    ctx.fillRect(-50, view.top - 50, view.width + 100, view.bottom - view.top + 100);
    ctx.restore();
}

const seedsElement = document.getElementById('seeds');

function updateSeedsUI() {
    seedsElement.hidden = gameState !== 'playing' && gameState !== 'dying';
    if (seedsElement.childElementCount !== BOSS_ROSTER.length) {
        seedsElement.replaceChildren(...BOSS_ROSTER.map((b) => {
            const dot = document.createElement('span');
            dot.className = 'seed';
            dot.style.setProperty('--c', b.color);
            return dot;
        }));
    }
    [...seedsElement.children].forEach((dot, i) => dot.classList.toggle('got', i < seedsCollected));
}

function seedPickupEffect(x, y, color) {
    sparkle(x, y, color, 24);
    starBurst(x, y, 10, [color, '#FFFFFF', '#FFF59D']);
}

function drawSeed(x, y, r, color) {
    ctx.fillStyle = '#43A047';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.45, y - r * 1.05, r * 0.55, r * 0.28, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.85, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
}

const STORY_TAP_DELAY_MS = 400;
const PROLOGUE_SEEN_KEY = 'jumpRunnerPrologueSeen';
const story = { panels: [], index: 0, shownAt: 0, scene: null, onDone: null };

function playStory(panels, onDone) {
    gameState = 'story';
    Object.assign(story, { panels, index: 0, onDone });
    updateUI();
    showStoryPanel();
    requestAnimationFrame(storyLoop);
}

function showStoryPanel() {
    story.shownAt = performance.now();
    story.scene = makeScene();
    story.panels[story.index].setup?.(story.scene);
}

function advanceStory() {
    if (performance.now() - story.shownAt < STORY_TAP_DELAY_MS) return;
    story.index++;
    if (story.index < story.panels.length) {
        showStoryPanel();
        return;
    }
    gameState = 'playing';
    story.onDone();
}

function storyLoop(now) {
    if (gameState !== 'story') return;
    const panel = story.panels[story.index];
    const t = (now - story.shownAt) / 1000;
    story.scene.frame++;
    applyWorldTransform();
    panel.draw(story.scene, t);
    drawStoryChrome(panel.caption, t);
    requestAnimationFrame(storyLoop);
}

function makeScene() {
    return {
        frame: 0,
        clouds: [new Cloud(view.width * 0.1), new Cloud(view.width * 0.45), new Cloud(view.width * 0.8)],
        mountains: [new Mountain(view.width * 0.05), new Mountain(view.width * 0.5)],
        trees: [new Tree(view.width * 0.2), new Tree(view.width * 0.62), new Tree(view.width * 0.85)],
        player: new Player(view.width * 0.18, 350, true, 'ally'),
        kage: makeStoryKage(),
    };
}

function makeStoryKage() {
    const kage = new Boss(BOSS_ROSTER.find((b) => b.kind === 'kage'), 1);
    kage.showStatus = false;
    return kage;
}

function drawSceneBackdrop(scene, amount) {
    drawSky();
    for (const list of [scene.clouds, scene.mountains, scene.trees]) list.forEach((o) => o.draw());
    ctx.fillStyle = '#90EE90';
    ctx.fillRect(-50, GROUND_Y, view.width + 100, WORLD_HEIGHT - GROUND_Y);
    ctx.fillStyle = '#8B5A2B';
    ctx.fillRect(-50, WORLD_HEIGHT, view.width + 100, view.bottom - WORLD_HEIGHT);
    ctx.strokeStyle = '#2E7D32';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-50, GROUND_Y);
    ctx.lineTo(view.width + 50, GROUND_Y);
    ctx.stroke();
    drawGloom(amount);
}

function drawStoryBubble(target, text) {
    drawBubble({ target, text, age: 10, life: Infinity });
}

function runInPlace(player) {
    player.runPhase += 0.3;
}

function floatKage(kage, x, t) {
    kage.x = x;
    kage.y = 190 + Math.sin(t * 2) * 8;
    kage.animationOffset += 0.1;
}

function easeOut(t) {
    const c = Math.min(Math.max(t, 0), 1);
    return 1 - (1 - c) ** 3;
}

const PROLOGUE = [
    {
        caption: 'ある日、カゲノオウが\nせかいの いろを すいとった!',
        draw(scene, t) {
            const kage = scene.kage;
            floatKage(kage, view.width - 170, t);
            drawSceneBackdrop(scene, STORY_GLOOM * easeOut(t / 2.5));
            const mouthX = kage.x + kage.width / 2;
            const mouthY = kage.y + kage.height / 2;
            for (let i = 0; i < 18; i++) {
                const p = (t * 0.6 + i / 18) % 1;
                const fromX = (i * 97) % (view.width - 260) + 20;
                const fromY = 160 + ((i * 53) % 190);
                const x = fromX + (mouthX - fromX) * p * p;
                const y = fromY + (mouthY - fromY) * p - Math.sin(p * Math.PI) * 40;
                ctx.globalAlpha = 1 - p * 0.6;
                ctx.fillStyle = BOSS_ROSTER[i % BOSS_ROSTER.length].color;
                ctx.beginPath();
                ctx.arc(x, y, 6 - p * 3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            kage.draw();
            scene.player.draw();
            if (t > 1) drawStoryBubble(scene.player, 'あっ! いろが…!');
        },
    },
    {
        caption: 'いろは「いろのタネ」にされ、\nてしたの ボスたちに くばられた…',
        draw(scene, t) {
            const kage = scene.kage;
            floatKage(kage, view.width / 2 - 40, t);
            drawSceneBackdrop(scene, STORY_GLOOM);
            kage.draw();
            const cx = kage.x + kage.width / 2;
            const cy = kage.y + kage.height / 2;
            BOSS_ROSTER.forEach((b, i) => {
                const p = easeOut(t - 0.3 - i * 0.25);
                if (p <= 0) return;
                const toX = view.width * (0.1 + (0.8 * i) / Math.max(BOSS_ROSTER.length - 1, 1));
                const toY = 130 + (i % 2) * 50;
                drawSeed(cx + (toX - cx) * p, cy + (toY - cy) * p - Math.sin(p * Math.PI) * 80, 12, b.color);
            });
            if (t > 0.8) drawStoryBubble(kage, 'ボスたちよ、まもりぬけ!');
        },
    },
    {
        caption: 'いろのタネを ぜんぶ とりもどせ!',
        draw(scene, t) {
            drawSceneBackdrop(scene, STORY_GLOOM);
            const player = scene.player;
            player.x = view.width * 0.35;
            runInPlace(player);
            for (let i = 0; i < 6; i++) {
                const x = view.width - ((t * 600 + i * 170) % (view.width + 100));
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, 200 + i * 28);
                ctx.lineTo(x + 60, 200 + i * 28);
                ctx.stroke();
            }
            player.draw();
            if (t > 0.5) drawStoryBubble(player, 'かえしてもらうぜ!');
        },
    },
];

function endingPanels(nextRound) {
    return [
        {
            caption: 'いろのタネが ぜんぶ もどった!\nせかいに いろが よみがえった!',
            draw(scene, t) {
                drawSceneBackdrop(scene, STORY_GLOOM * (1 - easeOut(t / 2)));
                drawRainbow(easeOut((t - 0.8) / 1.5));
                const player = scene.player;
                player.x = view.width / 2 - player.width / 2;
                player.isJumping = true;
                player.y = player.groundY - Math.abs(Math.sin(t * 4)) * 60;
                player.draw();
                const cx = player.x + player.width / 2;
                const cy = player.y + player.height / 2;
                BOSS_ROSTER.forEach((b, i) => {
                    const a = t * 2 + (Math.PI * 2 * i) / BOSS_ROSTER.length;
                    drawSeed(cx + Math.cos(a) * 60, cy + Math.sin(a) * 40, 9, b.color);
                });
                if (t > 1.2) drawStoryBubble(player, 'やったぜ~!!');
            },
        },
        {
            caption: `でも カゲノオウは あきらめていない…\n${nextRound}しゅうめ スタート!`,
            draw(scene, t) {
                drawSceneBackdrop(scene, 0);
                drawRainbow(1);
                const kage = scene.kage;
                floatKage(kage, view.width - 140, t);
                ctx.globalAlpha = 0.35 + Math.sin(t * 3) * 0.15;
                kage.draw();
                ctx.globalAlpha = 1;
                if (t > 0.6) drawStoryBubble(kage, 'おぼえておれ…!');
                const player = scene.player;
                runInPlace(player);
                player.draw();
            },
        },
    ];
}

function drawRainbow(progress) {
    if (progress <= 0) return;
    const cx = view.width / 2;
    const cy = GROUND_Y + 40;
    const end = Math.PI + Math.PI * progress;
    ctx.lineWidth = 10;
    ctx.globalAlpha = 0.75;
    ['#FF5252', '#FFA726', '#FFEE58', '#66BB6A', '#29B6F6', '#3F51B5', '#AB47BC'].forEach((color, i) => {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, 260 - i * 10, Math.PI, end);
        ctx.stroke();
    });
    ctx.globalAlpha = 1;
}

function drawStoryChrome(caption, t) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const w = view.cssWidth;
    const h = view.cssHeight;
    if (t < 0.25) {
        ctx.fillStyle = `rgba(0, 0, 0, ${1 - t / 0.25})`;
        ctx.fillRect(0, 0, w, h);
    }
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);

    const lines = caption.split('\n');
    const size = Math.min(w / 26, h / 14, 26);
    const boxWidth = Math.min(w - 120, Math.max(...lines.map((l) => l.length)) * size + size * 2);
    const boxHeight = lines.length * size * 1.5 + size;
    const boxX = (w - boxWidth) / 2;
    const boxY = 18;
    ctx.fillStyle = '#111';
    ctx.fillRect(boxX + 5, boxY + 5, boxWidth, boxHeight);
    ctx.fillStyle = '#FFFDE7';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.lineWidth = 3;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    ctx.fillStyle = '#111';
    ctx.font = `900 ${size}px 'Hiragino Sans', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => ctx.fillText(line, w / 2, boxY + size + i * size * 1.5));

    ctx.globalAlpha = 0.6 + Math.sin(t * 5) * 0.4;
    ctx.font = `bold ${size * 0.7}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFF';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 4;
    const hint = `${story.index + 1}/${story.panels.length}  タップでつぎへ ▶`;
    ctx.strokeText(hint, w - 24, h - 24);
    ctx.fillText(hint, w - 24, h - 24);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}
