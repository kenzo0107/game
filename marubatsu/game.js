import { cpuMove, judge, other } from './logic.js';

const MARK_SVG = {
    o: '<svg viewBox="0 0 100 100"><circle class="stroke" cx="50" cy="50" r="40" /></svg>',
    x: '<svg viewBox="0 0 100 100"><line class="stroke" x1="12" y1="12" x2="88" y2="88" /><line class="stroke" x1="88" y1="12" x2="12" y2="88" /></svg>',
};
const MODES = ['easy', 'normal', 'hard', 'pvp'];
const CPU_DELAY_MS = 450;

const boardEl = document.getElementById('board');
const winLine = document.getElementById('win-line');
const message = document.getElementById('message');
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const players = { o: document.querySelector('.player.o'), x: document.querySelector('.player.x') };
const scoreEls = {
    o: document.getElementById('score-o'),
    x: document.getElementById('score-x'),
    draw: document.getElementById('score-draw'),
};

const cells = Array.from({ length: 9 }, (_, i) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.setAttribute('aria-label', `${Math.floor(i / 3) + 1}ぎょう ${(i % 3) + 1}れつ`);
    cell.addEventListener('click', () => onCellClick(i));
    boardEl.insertBefore(cell, winLine);
    return cell;
});

let mode = 'normal';
try {
    const saved = localStorage.getItem('marubatsuMode');
    if (MODES.includes(saved)) mode = saved;
} catch {}

let board;
let turn;
let firstTurn = 'x';
let over;
let cpuTimer = null;
let scores = { o: 0, x: 0, draw: 0 };

const isCpu = (mark) => mode !== 'pvp' && mark === 'x';

let audio = null;
function beep(notes, type = 'square') {
    try {
        audio ??= new (window.AudioContext || window.webkitAudioContext)();
        if (audio.state === 'suspended') audio.resume();
        const t = audio.currentTime;
        for (const [freq, start, length] of notes) {
            const osc = audio.createOscillator();
            const gain = audio.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.06, t + start);
            gain.gain.exponentialRampToValueAtTime(0.001, t + start + length);
            osc.connect(gain).connect(audio.destination);
            osc.start(t + start);
            osc.stop(t + start + length);
        }
    } catch {}
}
const sfx = {
    o: () => beep([[660, 0, 0.08]]),
    x: () => beep([[440, 0, 0.08]]),
    win: () => beep([[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.3]]),
    lose: () => beep([[392, 0, 0.15], [330, 0.15, 0.15], [262, 0.3, 0.35]], 'triangle'),
    draw: () => beep([[523, 0, 0.12], [523, 0.15, 0.2]], 'triangle'),
};

function renderScores() {
    for (const key of Object.keys(scoreEls)) scoreEls[key].textContent = scores[key];
}

function renderMode() {
    for (const button of modeButtons) {
        button.setAttribute('aria-checked', String(button.dataset.mode === mode));
    }
    document.getElementById('name-o').textContent = mode === 'pvp' ? 'まる' : 'あなた';
    document.getElementById('name-x').textContent = mode === 'pvp' ? 'ばつ' : 'CPU';
}

function renderTurn() {
    players.o.classList.toggle('turn', !over && turn === 'o');
    players.x.classList.toggle('turn', !over && turn === 'x');
    for (const [i, cell] of cells.entries()) cell.disabled = over || Boolean(board[i]) || isCpu(turn);
    if (over) return;
    message.className = 'message';
    if (mode === 'pvp') message.textContent = `${turn === 'o' ? '○' : '×'} のばん`;
    else message.textContent = isCpu(turn) ? 'CPU がかんがえちゅう…' : 'あなたのばん';
}

function showWinLine([a, , c]) {
    const center = (i) => [(i % 3) + 0.5, Math.floor(i / 3) + 0.5];
    const [x1, y1] = center(a);
    const [x2, y2] = center(c);
    const line = winLine.querySelector('line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    winLine.classList.add('show');
}

function finish({ winner, line }) {
    over = true;
    scores[winner] += 1;
    renderScores();
    message.className = 'message win';
    if (winner === 'draw') {
        message.textContent = 'ひきわけ！';
        sfx.draw();
    } else {
        showWinLine(line);
        cells.forEach((cell, i) => cell.classList.add(line.includes(i) ? 'win' : 'lose'));
        if (mode === 'pvp') {
            message.textContent = `${winner === 'o' ? '○' : '×'} のかち！`;
            sfx.win();
        } else if (winner === 'o') {
            message.textContent = 'あなたのかち！';
            sfx.win();
        } else {
            message.textContent = 'CPU のかち…';
            sfx.lose();
        }
    }
    renderTurn();
}

function place(i) {
    board[i] = turn;
    cells[i].classList.add(turn);
    cells[i].innerHTML = MARK_SVG[turn];
    sfx[turn]();
    const result = judge(board);
    if (result) {
        finish(result);
        return;
    }
    turn = other(turn);
    renderTurn();
    scheduleCpu();
}

function scheduleCpu() {
    if (over || !isCpu(turn)) return;
    cpuTimer = setTimeout(() => {
        cpuTimer = null;
        place(cpuMove(board, turn, mode));
    }, CPU_DELAY_MS);
}

function onCellClick(i) {
    if (over || board[i] || isCpu(turn)) return;
    place(i);
}

function newRound() {
    clearTimeout(cpuTimer);
    cpuTimer = null;
    board = Array(9).fill(null);
    firstTurn = other(firstTurn);
    turn = firstTurn;
    over = false;
    winLine.classList.remove('show');
    for (const cell of cells) {
        cell.className = 'cell';
        cell.innerHTML = '';
    }
    renderTurn();
    scheduleCpu();
}

function resetScores() {
    scores = { o: 0, x: 0, draw: 0 };
    firstTurn = 'x';
    renderScores();
    newRound();
}

for (const button of modeButtons) {
    button.addEventListener('click', () => {
        if (button.dataset.mode === mode) return;
        mode = button.dataset.mode;
        try {
            localStorage.setItem('marubatsuMode', mode);
        } catch {}
        renderMode();
        resetScores();
    });
}
document.getElementById('restart').addEventListener('click', newRound);
document.getElementById('reset').addEventListener('click', resetScores);

renderMode();
resetScores();
