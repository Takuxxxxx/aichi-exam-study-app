const MAX_INTERVAL = 30;
const MIN_EASE = 1.3; // Anki同様、1.3未満には下げない（低間隔地獄の防止）
const MAX_EASE = 3.0;
const DEFAULT_EASE = 2.5;

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
 * 回答結果に基づいて復習スケジュールを更新する（Anki/SM-2方式）。
 * - 正解: 覚えやすさ（ease）に応じて間隔を指数で伸ばす（初回正解は翌日）
 * - 部分点・不正解: 間隔1日に戻し、同じ出題内で再出題する（requeue）
 * - easeは問題ごとに調整され、苦手な問題ほど短い間隔で出る
 * @param {object} s 既存のスケジュール（無ければ null）
 * @param {string} result 'correct' | 'partial' | 'wrong'
 * @param {number} score 0〜100のスコア（ease調整に使用）
 */
export function updateSchedule(s, result, score = 100) {
  const cur = s ?? {
    interval_days: 1,
    consecutive_correct: 0,
    last_result: '',
    total_correct: 0,
    total_wrong: 0,
    ease: DEFAULT_EASE,
  };

  let interval = Number(cur.interval_days) || 1;
  let consecutive = Number(cur.consecutive_correct) || 0;
  let totalCorrect = Number(cur.total_correct) || 0;
  let totalWrong = Number(cur.total_wrong) || 0;
  let ease = Number(cur.ease) || DEFAULT_EASE;
  if (!(ease >= MIN_EASE)) ease = DEFAULT_EASE;

  let requeue = false;
  const now = new Date();

  if (result === 'correct') {
    consecutive += 1;
    totalCorrect += 1;
    if (score >= 90) ease = Math.min(ease + 0.15, MAX_EASE);
    interval = consecutive <= 1 ? 1 : Math.min(Math.max(1, Math.round(interval * ease)), MAX_INTERVAL);
  } else if (result === 'partial') {
    consecutive = 0;
    totalWrong += 1;
    ease = Math.max(ease - 0.15, MIN_EASE);
    interval = 1;
    requeue = true;
  } else {
    consecutive = 0;
    totalWrong += 1;
    ease = Math.max(ease - 0.3, MIN_EASE);
    interval = 1;
    requeue = true;
  }

  const nextDate = addDays(now, interval);

  return {
    interval_days: interval,
    next_review_at: fmtDate(nextDate),
    consecutive_correct: consecutive,
    last_result: result,
    total_correct: totalCorrect,
    total_wrong: totalWrong,
    ease: Math.round(ease * 100) / 100,
    requeue,
  };
}

export const REQUEUE_GAP = 3;
export const LEECH_WRONG_THRESHOLD = 8; // Ankiのleech基準：累計不正解8回で苦手認定
