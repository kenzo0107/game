export const WORLD = { width: 16, height: 9 };
export const ROWS = [
    { y: 6.1, scale: 0.8 },
    { y: 7.8, scale: 1 },
];
export const ROUNDS = 5;

export const POSES = [
    { id: 'maru', name: 'まる', w: 1.3, h: 1.1 },
    { id: 'hoshi', name: 'ほし', w: 1.6, h: 1.6 },
    { id: 'tako', name: 'たこ', w: 1.6, h: 1.6 },
    { id: 'noppo', name: 'のっぽ', w: 0.9, h: 2.3 },
    { id: 'nagai', name: 'ながーい', w: 2.4, h: 0.8 },
    { id: 'kaeru', name: 'かえる', w: 1.7, h: 1.2 },
    { id: 'neko', name: 'ねこ', w: 1.3, h: 1.6 },
    { id: 'roketto', name: 'ロケット', w: 1.1, h: 2.2 },
    { id: 'haato', name: 'ハート', w: 1.5, h: 1.4 },
];

const LAYOUT = [
    [4, 0],
    [8, 0],
    [12, 0],
    [2, 1],
    [6, 1],
    [10, 1],
    [14, 1],
];

function stage(id, name, sky, ground, colors, picks) {
    return {
        id,
        name,
        sky,
        ground,
        colors,
        props: picks.map(([pose, color], i) => ({ pose, color, x: LAYOUT[i][0], row: LAYOUT[i][1] })),
    };
}

export const STAGES = [
    stage('mori', 'もり', ['#8fd3ff', '#cfeec0'], '#6b4a2b', ['#3fae4a', '#8b5a2b', '#e04a3a', '#ffcf3a', '#9a7fd1'], [
        ['noppo', 0], ['kaeru', 0], ['tako', 2], ['nagai', 1], ['hoshi', 3], ['maru', 1], ['neko', 4],
    ]),
    stage('umi', 'うみ', ['#1d6fb8', '#5fc6e8'], '#e9d39a', ['#ff7f7f', '#ff9f2e', '#9b5cff', '#ffe066', '#2ec4b6'], [
        ['tako', 2], ['hoshi', 1], ['noppo', 0], ['maru', 4], ['tako', 0], ['haato', 3], ['nagai', 4],
    ]),
    stage('hana', 'おはなばたけ', ['#a8e0ff', '#fff4c2'], '#5cb85c', ['#ff6fb1', '#ffd23f', '#ffffff', '#b07cff', '#ff4d4d'], [
        ['hoshi', 0], ['noppo', 1], ['haato', 4], ['kaeru', 3], ['tako', 2], ['nagai', 1], ['maru', 0],
    ]),
    stage('okashi', 'おかしのくに', ['#ffd6ec', '#fff0f7'], '#c98b5a', ['#7a4a2a', '#ff8fb8', '#9ef0c9', '#fff27a', '#ffffff'], [
        ['maru', 1], ['haato', 1], ['noppo', 2], ['tako', 3], ['nagai', 0], ['neko', 4], ['roketto', 0],
    ]),
    stage('machi', 'よるのまち', ['#0d1240', '#3a2f86'], '#3b3b4f', ['#8a8fa8', '#ffd23f', '#ff4d6d', '#45a8f0', '#b07cff'], [
        ['noppo', 0], ['neko', 4], ['nagai', 2], ['maru', 3], ['noppo', 1], ['hoshi', 1], ['roketto', 0],
    ]),
    stage('yuki', 'ゆきやま', ['#bcd8f0', '#f4f9ff'], '#f2f6fb', ['#ffffff', '#7fb8e8', '#2f6b4a', '#e04a3a', '#c9a27a'], [
        ['roketto', 2], ['maru', 0], ['neko', 1], ['maru', 1], ['noppo', 2], ['kaeru', 0], ['hoshi', 3],
    ]),
    stage('omocha', 'おもちゃばこ', ['#ffe9b8', '#fff7e0'], '#d9a066', ['#ff4d4d', '#3f7cff', '#ffd23f', '#3fae4a', '#ff8a2b'], [
        ['roketto', 0], ['haato', 0], ['kaeru', 3], ['nagai', 1], ['neko', 4], ['hoshi', 2], ['tako', 1],
    ]),
    stage('uchu', 'うちゅう', ['#05041a', '#1d1450'], '#4a4560', ['#c0c4d6', '#ff8a2b', '#29e7ff', '#b07cff', '#ffd23f'], [
        ['hoshi', 4], ['roketto', 0], ['tako', 3], ['maru', 1], ['roketto', 2], ['haato', 3], ['maru', 0],
    ]),
];

export function pickStages(rng = Math.random) {
    return shuffle(STAGES, rng).slice(0, ROUNDS);
}

export const poseOf = (id) => POSES.find((p) => p.id === id);

export function propBox(prop) {
    const pose = poseOf(prop.pose);
    const { y, scale } = ROWS[prop.row];
    return { x0: prop.x - (pose.w * scale) / 2, x1: prop.x + (pose.w * scale) / 2, y0: y - pose.h * scale, y1: y };
}

export function propAt(props, x, y) {
    const frontFirst = [...props.keys()].sort((a, b) => props[b].row - props[a].row);
    const hit = frontFirst.find((i) => {
        const b = propBox(props[i]);
        return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
    });
    return hit ?? null;
}

export function disguiseLevel(hider, props) {
    if (hider.propIndex === null) return 0;
    const prop = props[hider.propIndex];
    return ((hider.color === prop.color ? 1 : 0) + (hider.pose === prop.pose ? 1 : 0)) / 2;
}

export function spotChance(level, round) {
    if (level >= 1) return 0.04 + 0.03 * round;
    if (level >= 0.5) return 0.6;
    return 0.95;
}

export function shuffle(list, rng = Math.random) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function cpuDisguise(prop, skill, rng = Math.random, colorCount = 5) {
    const other = (value, count) => (value + 1 + Math.floor(rng() * (count - 1))) % count;
    const poseIndex = POSES.findIndex((p) => p.id === prop.pose);
    return {
        color: rng() < skill ? prop.color : other(prop.color, colorCount),
        pose: rng() < skill ? prop.pose : POSES[other(poseIndex, POSES.length)].id,
    };
}
