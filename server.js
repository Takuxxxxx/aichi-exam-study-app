import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import * as db from './lib/db.js';
import { isConfigured } from './lib/ai.js';
import { extractPdfText } from './lib/pdf.js';
import { generateProblems, generateApplicationQuestions } from './lib/generator.js';
import { gradeModeA, gradeModeB, gradeModeC, gradeModeD } from './lib/grader.js';
import { updateSchedule } from './lib/scheduler.js';

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

const currentDir = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));
if (process.pkg) {
  dotenv.config({ path: path.join(path.dirname(process.execPath), '.env') });
} else {
  dotenv.config();
}
const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

app.use(express.json({ limit: '10mb' }));
if (process.pkg) app.use(express.static(path.join(path.dirname(process.execPath), 'public')));
app.use(express.static(path.join(currentDir, 'public')));

function safe(fn) {
  return (req, res) => {
    try {
      fn(req, res);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message || 'サーバーエラー' });
    }
  };
}

const asyncSafe = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(e);
    res.status(500).json({ error: e.message || 'サーバーエラー' });
  });

function withQuestion(q) {
  if (!q) return q;
  const out = { ...q };
  out.acceptable = safeParse(out.acceptable);
  out.points = safeParse(out.points);
  out.options = safeParse(out.options);
  const ci = Number(out.correct_index);
  out.correct_index = Number.isInteger(ci) && ci >= 0 ? ci : -1;
  delete out.material_id;
  return out;
}

function safeParse(s) {
  if (Array.isArray(s)) return s;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

app.get('/api/status', (req, res) => {
  res.json({ aiConfigured: isConfigured() });
});

/* ---------------- 資料 ---------------- */

app.post('/api/materials/upload', upload.single('file'), asyncSafe(async (req, res) => {
  const { title, subject = '', unit = '' } = req.body;
  if (!req.file) return res.status(400).json({ error: 'ファイルが選択されていません。' });
  if (!title) return res.status(400).json({ error: 'タイトルを入力してください。' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  let content;
  if (ext === '.pdf') {
    content = await extractPdfText(req.file.buffer);
  } else if (['.txt', '.md', '.csv', '.text'].includes(ext)) {
    content = req.file.buffer.toString('utf8');
  } else {
    return res.status(400).json({ error: '対応形式は PDF / TXT / MD です。' });
  }

  const material = db.createMaterial({ title, subject, unit, sourceType: ext, content });
  res.json({ material });
}));

app.post('/api/materials/text', asyncSafe(async (req, res) => {
  const { title, subject = '', unit = '', content } = req.body;
  if (!title) return res.status(400).json({ error: 'タイトルを入力してください。' });
  if (!content || !content.trim()) return res.status(400).json({ error: '本文を入力してください。' });
  const material = db.createMaterial({ title, subject, unit, sourceType: 'text', content });
  res.json({ material });
}));

app.get('/api/materials', (req, res) => {
  const materials = db.listMaterials().map((m) => ({
    ...m,
    questionCount: db.countQuestionsByMaterial(m.id),
  }));
  res.json({ materials });
});

app.get('/api/materials/:id', (req, res) => {
  const m = db.getMaterial(Number(req.params.id));
  if (!m) return res.status(404).json({ error: '資料が見つかりません。' });
  res.json({ material: m });
});

app.delete('/api/materials/:id', (req, res) => {
  db.deleteMaterial(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/materials/:id/generate', asyncSafe(async (req, res) => {
  const material = db.getMaterial(Number(req.params.id));
  if (!material) return res.status(404).json({ error: '資料が見つかりません。' });

  const modeA = Math.min(Math.max(Number(req.body.modeA) || 0, 0), 30);
  const modeB = Math.min(Math.max(Number(req.body.modeB) || 0, 0), 30);
  if (modeA + modeB <= 0) return res.status(400).json({ error: '生成数を指定してください。' });

  const { questions, modeA: genA, modeB: genB } = await generateProblems({
    content: material.content,
    materialInfo: { title: material.title, subject: material.subject, unit: material.unit },
    modeACount: modeA,
    modeBCount: modeB,
  });

  db.insertQuestions(material.id, questions);
  res.json({ inserted: questions.length, modeA: genA, modeB: genB, questions });
}));

/* ---------------- 問題 ---------------- */

app.get('/api/questions', (req, res) => {
  const materialId = req.query.materialId ? Number(req.query.materialId) : null;
  const mode = req.query.mode || null;
  const rows = db.listQuestions({ materialId, mode }).map(withQuestion);
  res.json({ questions: rows });
});

app.put('/api/questions/:id', (req, res) => {
  const { text, blank_word, acceptable, theme, model_answer, points, explanation } = req.body;
  const updated = db.updateQuestion(Number(req.params.id), {
    text, blank_word, acceptable, theme, model_answer, points, explanation,
  });
  if (!updated) return res.status(404).json({ error: '問題が見つかりません。' });
  res.json({ question: withQuestion(updated) });
});

app.delete('/api/questions/:id', (req, res) => {
  db.deleteQuestion(Number(req.params.id));
  res.json({ ok: true });
});

/* ---------------- 出題セッション ---------------- */

const sessions = new Map();

// セッション取得（メモリになければDBから復元。再起動後も継続できる）
function loadSession(token) {
  let s = sessions.get(token);
  if (!s) {
    const saved = db.getSession(token);
    if (saved) {
      s = saved;
      sessions.set(token, s);
    }
  }
  return s || null;
}

function persistSession(token) {
  const s = sessions.get(token);
  if (s) {
    try {
      db.saveSession(token, s);
    } catch (e) {
      console.error('セッション保存失敗:', e.message);
    }
  }
}

app.post('/api/session/start', asyncSafe(async (req, res) => {
  const { materialIds = [], count = 10, mode = 'mix', direction = 'ja_to_en' } = req.body;
  const dir = ['ja_to_en', 'en_to_ja', 'both'].includes(direction) ? direction : 'ja_to_en';
  const ids = Array.isArray(materialIds) ? materialIds.filter(Boolean).map(Number) : [];
  if (!ids.length) {
    return res.status(400).json({ error: '資料を1つ以上選択してください。' });
  }
  const materials = ids.map((id) => db.getMaterial(id)).filter(Boolean);
  if (!materials.length) {
    return res.status(400).json({ error: '資料が見つかりません。' });
  }

  const target = Math.max(1, Math.min(Number(count) || 10, 30));
  const queue = [];

  const modeFilter = mode === 'mix' ? null : mode;
  const dirFilter = modeFilter === 'D' && dir !== 'both' ? dir : null;

  const due = db.pickDueQuestions({ materialIds: ids, mode: modeFilter, direction: dirFilter, limit: target });
  queue.push(...due);
  const restAfterDue = target - queue.length;

  const unanswered = db.listUnansweredQuestions({ materialIds: ids, mode: modeFilter, direction: dirFilter });
  queue.push(...unanswered.slice(0, restAfterDue));

  const reusedCount = queue.length;
  const remaining = target - queue.length;

  if (remaining > 0) {
    const existing = db.listQuestions({ materialIds: ids });
    // avoidリストは直近60件に絞る（プロンプト肥大化防止。listQuestionsは新しい順なので先頭が直近）
    const AVOID_LIMIT = 60;
    const avoidA = [...new Set(existing.filter((q) => q.mode === 'A').map((q) => q.blank_word).filter(Boolean))].slice(0, AVOID_LIMIT);
    const avoidB = [...new Set(existing.filter((q) => q.mode === 'B').map((q) => q.theme).filter(Boolean))].slice(0, AVOID_LIMIT);
    const avoidC = [...new Set(existing.filter((q) => q.mode === 'C').map((q) => q.theme).filter(Boolean))].slice(0, AVOID_LIMIT);
    const avoidD = [...new Set(existing.filter((q) => q.mode === 'D').map((q) => q.theme).filter(Boolean))].slice(0, AVOID_LIMIT);

    const genCounts = new Array(materials.length).fill(0);
    for (let i = 0; i < remaining; i++) genCounts[i % materials.length]++;

    for (let mi = 0; mi < materials.length; mi++) {
      const n = genCounts[mi];
      if (!n) continue;
      const m = materials[mi];
      let modeA = 0;
      let modeB = 0;
      let modeC = 0;
      let modeD = 0;
      if (mode === 'A') modeA = n;
      else if (mode === 'B') modeB = n;
      else if (mode === 'C') modeC = n;
      else if (mode === 'D') modeD = n;
      else {
        modeA = Math.max(1, Math.round(n * 0.5));
        modeB = Math.max(0, Math.round(n * 0.25));
        modeC = n - modeA - modeB;
      }
      try {
        const { questions } = await generateProblems({
          content: m.content,
          materialInfo: { title: m.title, subject: m.subject, unit: m.unit },
          modeACount: Math.min(modeA, 25),
          modeBCount: Math.min(modeB, 10),
          modeCCount: Math.min(modeC, 10),
          modeDCount: Math.min(modeD, 25),
          direction: dir,
          avoidA,
          avoidB,
          avoidC,
          avoidD,
        });
        if (questions.length) {
          const savedIds = db.insertQuestions(m.id, questions);
          for (const id of savedIds) {
            const q = db.getQuestion(id);
            if (q) queue.push(q);
          }
        }
      } catch (e) {
        console.error('資料からの問題生成に失敗。応用レベルで補充します:', e.message);
      }
    }
  }

  // 指定数に届かない場合は、応用レベル（思考問題）で必ず補充する
  let shortfall = target - queue.length;
  if (shortfall > 0) {
    const existingThemes = db.listQuestions({ materialIds: ids }).map((q) => q.theme).filter(Boolean);
    const appAvoid = [...new Set(existingThemes)].slice(0, 60);
    const appQuestions = await generateApplicationQuestions({
      subject: materials[0]?.subject || '',
      unit: materials[0]?.unit || '',
      count: Math.max(shortfall, 0),
      avoid: appAvoid,
    });
    if (appQuestions.length) {
      const savedIds = db.insertQuestions(materials[0].id, appQuestions);
      for (const id of savedIds) {
        const q = db.getQuestion(id);
        if (q) queue.push(q);
      }
    }
  }

  if (queue.length === 0) {
    return res.status(400).json({ error: '問題を生成できませんでした。AI APIキーとレート制限を確認してください。' });
  }

  queue.length = Math.min(queue.length, target);

  const token = crypto.randomBytes(16).toString('hex');
  sessions.set(token, {
    queue,
    stats: { answered: 0, correct: 0, partial: 0, wrong: 0, totalScore: 0 },
    history: [],
  });
  persistSession(token);
  res.json({ token, total: queue.length, reused: reusedCount });
}));

function findNextQuestion(session) {
  if (!session.queue.length) return null;
  const q = session.queue.shift();
  return q;
}

app.get('/api/session/:token', (req, res) => {
  const s = loadSession(req.params.token);
  if (!s) return res.status(404).json({ error: 'セッションが見つかりません（期限切れの可能性があります）。' });
  res.json({ total: s.queue.length + s.stats.answered, stats: s.stats });
});

app.get('/api/session/:token/next', (req, res) => {
  const s = loadSession(req.params.token);
  if (!s) return res.status(404).json({ error: 'セッションが見つかりません。' });
  const q = findNextQuestion(s);
  persistSession(req.params.token);
  if (!q) {
    db.deleteSession(req.params.token);
    return res.json({ done: true, stats: s.stats });
  }
  res.json({ question: withQuestion(q), index: s.stats.answered + 1, total: s.queue.length + s.stats.answered + 1, done: false });
});

app.post('/api/session/:token/answer', asyncSafe(async (req, res) => {
  const s = loadSession(req.params.token);
  if (!s) return res.status(404).json({ error: 'セッションが見つかりません。' });

  const { questionId, answer } = req.body;
  const question = db.getQuestion(Number(questionId));
  if (!question) return res.status(404).json({ error: '問題が見つかりません。' });
  question.points = safeParse(question.points);
  question.acceptable = safeParse(question.acceptable);
  question.options = safeParse(question.options);
  const qci = Number(question.correct_index);
  question.correct_index = Number.isInteger(qci) && qci >= 0 ? qci : -1;

  let grading;
  if (question.mode === 'A') {
    grading = fastGradeModeA(question, answer ?? '') || (await gradeModeA({ question, userAnswer: answer ?? '' }));
  } else if (question.mode === 'C') {
    grading = await gradeModeC({ question, userAnswer: answer ?? '' });
  } else if (question.mode === 'D') {
    grading = gradeModeD(question, answer ?? '');
  } else {
    grading = fastGradeModeB(question, answer ?? '') || (await gradeModeB({ question, userAnswer: answer ?? '' }));
  }

  const result = normalizeResult(grading?.result);
  const score = clampScore(grading?.score);
  const feedback = grading?.feedback || '';

  const sched = db.getSchedule(question.id);
  const next = updateSchedule(sched, result);
  db.upsertSchedule(question.id, next);
  db.addHistory({ questionId: question.id, result, score, answer: answer ?? '', feedback });

  s.stats.answered += 1;
  s.stats[result] += 1;
  s.stats.totalScore += score;

  const nextQuestion = findNextQuestion(s);
  persistSession(req.params.token);
  if (!nextQuestion) db.deleteSession(req.params.token);

  res.json({
    grading: { result, score, feedback, good_points: grading?.good_points ?? [], missing_points: grading?.missing_points ?? [] },
    correctAnswer: question.mode === 'C' ? (question.options[question.correct_index] ?? question.blank_word ?? '') : (question.mode === 'A' ? question.blank_word : question.mode === 'D' ? question.blank_word : question.theme),
    explanation: question.explanation || '',
    modelAnswer: question.mode === 'B' ? question.model_answer : '',
    stats: s.stats,
    next: nextQuestion ? withQuestion(nextQuestion) : null,
    done: !nextQuestion,
    index: s.stats.answered,
    total: s.stats.answered + (nextQuestion ? s.queue.length + 1 : 0),
  });
}));

function normalizeResult(r) {
  if (r === 'correct' || r === 'partial' || r === 'wrong') return r;
  return 'wrong';
}

function normText(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\s\u3000]/g, '')
    .replace(/[。、．.,！!？?・'"“”]/g, '');
}

function fastGradeModeA(question, userAnswer) {
  const blank = question.blank_word || '';
  const a = normText(userAnswer);
  if (!a) {
    return {
      result: 'wrong', score: 0, feedback: '回答が入力されていません。',
      good_points: [], missing_points: [`正解は「${blank}」です`],
    };
  }
  const candidates = [question.blank_word, ...(question.acceptable ?? [])];
  const exact = candidates.some((c) => a === normText(c));
  const contained = candidates.some((c) => {
    const n = normText(c);
    return n && n.length >= 2 && a.includes(n);
  });
  if (exact) {
    return {
      result: 'correct', score: 100, feedback: '正解です！',
      good_points: ['正解の語句を正確に書けています'], missing_points: [],
    };
  }
  if (contained) {
    return {
      result: 'partial', score: 60, feedback: '正解の語句が含まれています。表記や表現を確認しましょう。',
      good_points: ['正解の語句が含まれています'], missing_points: [`正しい表記は「${blank}」です`],
    };
  }
  return null;
}

// 模範解答から内容語（漢字・カタカナ・英数字の2文字以上の連続）を抽出
function extractKeywords(text, theme) {
  const t = normText(text) + normText(theme);
  const words = t.match(/[一-鿐々〆ヵヶァ-ヶーa-z0-9]{2,}/g) || [];
  const uniq = [...new Set(words)];
  // より長い語に含まれる短い語は重複カウント防止のため除外
  return uniq.filter((w) => !uniq.some((o) => o !== w && o.includes(w)));
}

function fastGradeModeB(question, userAnswer) {
  const a = normText(userAnswer);
  if (!a) {
    return {
      result: 'wrong', score: 0, feedback: '回答が入力されていません。',
      good_points: [], missing_points: [`正解例: ${question.model_answer || question.theme}`],
    };
  }
  const model = normText(question.model_answer);
  if (model && model.length >= 4 && a.includes(model)) {
    return {
      result: 'correct', score: 100, feedback: '正解です（模範解答の要点を含んでいます）。',
      good_points: ['模範解答の要点を含んでいます'], missing_points: [],
    };
  }
  // キーワード含有率で判定（AIを呼ばずに済ませる）
  const keywords = extractKeywords(question.model_answer, question.theme);
  if (keywords.length >= 3) {
    const hit = keywords.filter((k) => a.includes(k));
    const ratio = hit.length / keywords.length;
    if (ratio >= 0.7) {
      return {
        result: 'correct', score: 90, feedback: `正解です（要点 ${hit.length}/${keywords.length} を含んでいます）。`,
        good_points: [`要点 ${hit.length}/${keywords.length} を含んでいます`], missing_points: [],
      };
    }
    if (ratio >= 0.35) {
      return {
        result: 'partial', score: 50, feedback: `要点が一部含まれています（${hit.length}/${keywords.length}）。足りない点を補いましょう。`,
        good_points: [`要点 ${hit.length}/${keywords.length} を含んでいます`], missing_points: ['模範解答と見比べて不足分を補いましょう'],
      };
    }
  }
  return null;
}

function clampScore(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/* ---------------- 履歴・復習 ---------------- */

app.get('/api/history', (req, res) => {
  res.json({ history: db.listHistory() });
});

app.get('/api/review', (req, res) => {
  res.json({ review: db.listReviewStatus() });
});

app.get('/api/stats', (req, res) => {
  const questions = db.countQuestions();
  const materials = db.listMaterials().length;
  const dueCount = db.countDue();
  const historyCount = db.countHistory();
  res.json({ questions, materials, dueCount, historyCount, aiConfigured: isConfigured() });
});

app.listen(PORT, '0.0.0.0', () => {
  const lan = getLanIp();
  console.log(`愛知県入試対策 暗記アプリ起動中: http://localhost:${PORT}`);
  if (lan) console.log(`スマホなど同じWi-Fiの端末から: http://${lan}:${PORT}`);
  if (!isConfigured()) {
    console.log('注意: AI_API_KEY が未設定です。.env に設定してください。');
  }
  if (process.pkg) {
    setTimeout(() => {
      try {
        exec(`start "" "http://localhost:${PORT}"`);
      } catch {
        /* ブラウザ自動起動は失敗しても無視 */
      }
    }, 600);
  }
});
