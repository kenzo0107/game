import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpuMove, judge, other } from './logic.js';

const parse = (s) => [...s.replace(/\s/g, '')].map((c) => (c === '.' ? null : c));

function play(first, strategies) {
    const board = Array(9).fill(null);
    let turn = first;
    for (;;) {
        board[strategies[turn](board, turn)] = turn;
        const result = judge(board);
        if (result) return result.winner;
        turn = other(turn);
    }
}

test('縦・横・斜めのそろいを勝ちと判定する', () => {
    assert.deepEqual(judge(parse('ooo ... ...')), { winner: 'o', line: [0, 1, 2] });
    assert.deepEqual(judge(parse('x.. x.. x..')), { winner: 'x', line: [0, 3, 6] });
    assert.deepEqual(judge(parse('..o .o. o..')), { winner: 'o', line: [2, 4, 6] });
});

test('埋まって誰もそろっていなければ引き分け、空きがあれば続行', () => {
    assert.equal(judge(parse('oxo oxx xox')).winner, 'draw');
    assert.equal(judge(parse('ox. ... ...')), null);
});

test('ふつうは勝てる手を守る手より優先する', () => {
    assert.equal(cpuMove(parse('xx. oo. ...'), 'x', 'normal'), 2);
    assert.equal(cpuMove(parse('oo. x.. ...'), 'x', 'normal'), 2);
});

test('つよいは即勝ちできる手を選ぶ', () => {
    assert.equal(cpuMove(parse('xx. oo. o..'), 'x', 'hard'), 2);
});

test('つよいはランダムな相手に一度も負けない', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 300; n++) {
        const first = n % 2 ? 'o' : 'x';
        const winner = play(first, {
            o: (b, m) => cpuMove(b, m, 'easy', random),
            x: (b, m) => cpuMove(b, m, 'hard', random),
        });
        assert.notEqual(winner, 'o');
    }
});

test('つよい同士は必ず引き分ける', () => {
    const hard = (b, m) => cpuMove(b, m, 'hard');
    assert.equal(play('o', { o: hard, x: hard }), 'draw');
});
