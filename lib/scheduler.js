const MAX_INTERVAL = 30;
const CORRECT_BASE = 3; // 正解時の基本間隔（日）: 正解回数に応じて2倍で延びる
const WRONG_BASE = 1; // 不正解・部分点時の基本間隔（日）

function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * 回答結果に基づいて復習スケジュールを更新する。
 * 正解した問題は間隔を大きく伸ばしてすぐに再出題されないようにし、
 * 不正解・部分点の問題だけを短い間隔で再出題する。
 * @param {object} s 既存のスケジュール（無ければ null）
 * @param {string} result 'correct' | 'partial' | 'wrong'
 * @returns {{interval_days:number, next_review_at:string, consecutive_correct:number, last_result:string, total_correct:number, total_wrong:number, requeue:boolean}}
 */
export function updateSchedule(s, result) {
  const cur = s ?? {
    interval_days: WRONG_BASE,
    consecutive_correct: 0,
    last_result: '',
    total_correct: 0,
    total_wrong: 0,
  };

  let interval = Number(cur.interval_days) || WRONG_BASE;
  let consecutive = Number(cur.consecutive_correct) || 0;
  let totalCorrect = Number(cur.total_correct) || 0;
  let totalWrong = Number(cur.total_wrong) || 0;

  let requeue = false;
  const now = new Date();

  if (result === 'correct') {
    consecutive += 1;
    totalCorrect += 1;
    interval = Math.min(CORRECT_BASE * Math.pow(2, consecutive - 1), MAX_INTERVAL);
  } else if (result === 'partial') {
    consecutive = 0;
    totalWrong += 1;
    interval = WRONG_BASE;
    requeue = true;
  } else {
    consecutive = 0;
    totalWrong += 1;
    interval = WRONG_BASE;
    requeue = true;
  }

  const nextDate = addDays(now, interval);

  return {
    interval_days: Math.round(interval * 10) / 10,
    next_review_at: fmtDate(nextDate),
    consecutive_correct: consecutive,
    last_result: result,
    total_correct: totalCorrect,
    total_wrong: totalWrong,
    requeue,
  };
}

export const REQUEUE_GAP = 3;
