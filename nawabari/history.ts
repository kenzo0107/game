const HISTORY_STORAGE_KEY = 'nawabariHistory';
const MAX_HISTORY_RECORDS = 20;

type MatchOutcome = 'win' | 'lose' | 'draw';

interface MatchRecord {
    playedAt: number;
    outcome: MatchOutcome;
    cpuLevel: number;
    playerPercent: number;
    cpuPercent: number;
}

interface MatchTotals {
    win: number;
    lose: number;
    draw: number;
}

interface HistoryData {
    // 一覧は直近だけ残すが、通算成績は消えた試合も含めて数えたいので別に持つ
    totals: MatchTotals;
    records: MatchRecord[];
}

const OUTCOME_LABELS: Record<MatchOutcome, string> = {
    win: '勝ち',
    lose: '負け',
    draw: '引き分け'
};

const emptyHistory = (): HistoryData => ({ totals: { win: 0, lose: 0, draw: 0 }, records: [] });

const isMatchRecord = (value: unknown): value is MatchRecord => {
    const r = value as MatchRecord;
    return (
        typeof r === 'object' &&
        r !== null &&
        typeof r.playedAt === 'number' &&
        Object.prototype.hasOwnProperty.call(OUTCOME_LABELS, r.outcome) &&
        typeof r.cpuLevel === 'number' &&
        typeof r.playerPercent === 'number' &&
        typeof r.cpuPercent === 'number'
    );
};

class MatchHistory {
    private data = this.load();

    get records(): readonly MatchRecord[] {
        return this.data.records;
    }

    get totals(): Readonly<MatchTotals> {
        return this.data.totals;
    }

    add(record: MatchRecord): void {
        this.data.totals[record.outcome]++;
        this.data.records = [record, ...this.data.records].slice(0, MAX_HISTORY_RECORDS);
        this.save();
    }

    clear(): void {
        this.data = emptyHistory();
        this.save();
    }

    private load(): HistoryData {
        try {
            const parsed = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) ?? 'null');
            if (!parsed || !Array.isArray(parsed.records)) return emptyHistory();
            const totals = parsed.totals ?? {};
            return {
                totals: {
                    win: Number(totals.win) || 0,
                    lose: Number(totals.lose) || 0,
                    draw: Number(totals.draw) || 0
                },
                records: parsed.records.filter(isMatchRecord).slice(0, MAX_HISTORY_RECORDS)
            };
        } catch {
            return emptyHistory();
        }
    }

    private save(): void {
        try {
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(this.data));
        } catch {
            // 保存できない環境でも、このページを開いている間の履歴は表示する
        }
    }
}
