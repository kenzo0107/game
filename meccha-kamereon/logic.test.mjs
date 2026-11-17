import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    POSES,
    ROUNDS,
    STAGES,
    WORLD,
    cpuDisguise,
    disguiseLevel,
    pickStages,
    propAt,
    propBox,
    shuffle,
    spotChance,
} from './logic.js';

const seeded = (seed) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

test('ステージは 5 回戦より多くあり、物の色とポーズはそのステージにあるものだけ', () => {
    assert.ok(STAGES.length > ROUNDS);
    for (const s of STAGES) {
        assert.equal(s.colors.length, 5);
        for (const p of s.props) {
            assert.ok(p.color >= 0 && p.color < s.colors.length);
            assert.ok(POSES.some((pose) => pose.id === p.pose));
        }
    }
});

test('同じ列の物どうしは重ならず、画面からはみ出さない', () => {
    for (const s of STAGES) {
        const boxes = s.props.map((p) => ({ row: p.row, ...propBox(p) }));
        for (const b of boxes) {
            assert.ok(b.x0 >= 0 && b.x1 <= WORLD.width, `${s.id}`);
        }
        for (const a of boxes) {
            for (const b of boxes) {
                if (a === b || a.row !== b.row) continue;
                assert.ok(a.x1 <= b.x0 || b.x1 <= a.x0, `${s.id} で重なっている`);
            }
        }
    }
});

test('タップした位置の物を引ける。前の列と後ろの列が重なるところは前の列を優先する', () => {
    const props = [
        { pose: 'noppo', color: 0, x: 4, row: 0 },
        { pose: 'nagai', color: 1, x: 4, row: 1 },
    ];
    assert.equal(propAt(props, 4, 7.6), 1);
    assert.equal(propAt(props, 4, 4.5), 0);
    assert.equal(propAt(props, 12, 7.6), null);
});

test('色とポーズの両方があうと完全にかくれ、片方だけなら半分、物の前にいなければ丸見え', () => {
    const props = [{ pose: 'tako', color: 2, x: 4, row: 1 }];
    assert.equal(disguiseLevel({ propIndex: 0, color: 2, pose: 'tako' }, props), 1);
    assert.equal(disguiseLevel({ propIndex: 0, color: 2, pose: 'maru' }, props), 0.5);
    assert.equal(disguiseLevel({ propIndex: 0, color: 1, pose: 'maru' }, props), 0);
    assert.equal(disguiseLevel({ propIndex: null, color: 2, pose: 'tako' }, props), 0);
});

test('かくれかたが上手なほど見つかりにくく、回戦が進むと完全でも少し見つかりやすくなる', () => {
    assert.ok(spotChance(1, 0) < spotChance(0.5, 0));
    assert.ok(spotChance(0.5, 0) < spotChance(0, 0));
    assert.ok(spotChance(1, 4) > spotChance(1, 0));
    assert.ok(spotChance(1, 4) < 0.25);
});

test('CPU は上手さに応じて物にあわせ、あわせないときは必ず別の色・ポーズにする', () => {
    const prop = { pose: 'hoshi', color: 3 };
    assert.deepEqual(cpuDisguise(prop, 1, seeded(1)), { color: 3, pose: 'hoshi' });
    const rng = seeded(7);
    for (let i = 0; i < 100; i++) {
        const d = cpuDisguise(prop, 0, rng);
        assert.notEqual(d.color, 3);
        assert.notEqual(d.pose, 'hoshi');
        assert.ok(d.color >= 0 && d.color < 5);
    }
});

test('シャッフルしても要素は変わらない', () => {
    const list = [1, 2, 3, 4, 5, 6];
    assert.deepEqual(shuffle(list, seeded(3)).sort(), list);
});

test('1 ゲームでは 5 回戦ぶんのステージを、同じものを重ねずに選ぶ', () => {
    const picked = pickStages(seeded(5));
    assert.equal(picked.length, ROUNDS);
    assert.equal(new Set(picked.map((s) => s.id)).size, ROUNDS);
});

test('すべてのポーズがどこかのステージの物として出てくる', () => {
    const used = new Set(STAGES.flatMap((s) => s.props.map((p) => p.pose)));
    for (const pose of POSES) assert.ok(used.has(pose.id), pose.id);
});
