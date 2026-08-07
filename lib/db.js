import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.pkg
  ? path.join(path.dirname(process.execPath), 'data')
  : path.join(currentDir, '..', 'data');

mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'app.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subject TEXT DEFAULT '',
  unit TEXT DEFAULT '',
  source_type TEXT DEFAULT 'text',
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('A', 'B', 'C', 'D')),
  text TEXT NOT NULL,
  blank_word TEXT DEFAULT '',
  acceptable TEXT DEFAULT '[]',
  theme TEXT DEFAULT '',
  model_answer TEXT DEFAULT '',
  points TEXT DEFAULT '[]',
  options TEXT DEFAULT '[]',
  correct_index INTEGER DEFAULT -1,
  direction TEXT DEFAULT '',
  explanation TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS study_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  result TEXT NOT NULL CHECK(result IN ('correct', 'partial', 'wrong')),
  score REAL NOT NULL DEFAULT 0,
  answer TEXT DEFAULT '',
  feedback TEXT DEFAULT '',
  answered_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS review_schedule (
  question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  interval_days REAL NOT NULL DEFAULT 1,
  next_review_at TEXT DEFAULT '',
  consecutive_correct INTEGER NOT NULL DEFAULT 0,
  last_result TEXT DEFAULT '',
  total_correct INTEGER NOT NULL DEFAULT 0,
  total_wrong INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_questions_material ON questions(material_id);
CREATE INDEX IF NOT EXISTS idx_history_question ON study_history(question_id);
`);

function migrateQuestionModes() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'questions'").get();
  if (!row || !row.sql) return;
  if (row.sql.includes("CHECK(mode IN ('A', 'B'))")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      ALTER TABLE questions RENAME TO questions_old;
      CREATE TABLE questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK(mode IN ('A', 'B', 'C')),
        text TEXT NOT NULL,
        blank_word TEXT DEFAULT '',
        acceptable TEXT DEFAULT '[]',
        theme TEXT DEFAULT '',
        model_answer TEXT DEFAULT '',
        points TEXT DEFAULT '[]',
        options TEXT DEFAULT '[]',
        correct_index INTEGER DEFAULT -1,
        explanation TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      INSERT INTO questions (id, material_id, mode, text, blank_word, acceptable, theme, model_answer, points, explanation, created_at) SELECT id, material_id, mode, text, blank_word, acceptable, theme, model_answer, points, explanation, created_at FROM questions_old;
      DROP TABLE questions_old;
      CREATE INDEX IF NOT EXISTS idx_questions_material ON questions(material_id);
      ALTER TABLE study_history RENAME TO study_history_old;
      CREATE TABLE study_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        result TEXT NOT NULL CHECK(result IN ('correct', 'partial', 'wrong')),
        score REAL NOT NULL DEFAULT 0,
        answer TEXT DEFAULT '',
        feedback TEXT DEFAULT '',
        answered_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      INSERT INTO study_history SELECT * FROM study_history_old;
      DROP TABLE study_history_old;
      CREATE INDEX IF NOT EXISTS idx_history_question ON study_history(question_id);
      ALTER TABLE review_schedule RENAME TO review_schedule_old;
      CREATE TABLE review_schedule (
        question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
        interval_days REAL NOT NULL DEFAULT 1,
        next_review_at TEXT DEFAULT '',
        consecutive_correct INTEGER NOT NULL DEFAULT 0,
        last_result TEXT DEFAULT '',
        total_correct INTEGER NOT NULL DEFAULT 0,
        total_wrong INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      INSERT INTO review_schedule SELECT * FROM review_schedule_old;
      DROP TABLE review_schedule_old;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
    console.log('DBマイグレーション完了: モードC（入試レベル）を追加');
  }
}

migrateQuestionModes();

function migrateQuestionOptions() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'questions'").get();
  if (!row || !row.sql) return;
  if (!row.sql.includes('options TEXT')) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      ALTER TABLE questions RENAME TO questions_old;
      CREATE TABLE questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK(mode IN ('A', 'B', 'C')),
        text TEXT NOT NULL,
        blank_word TEXT DEFAULT '',
        acceptable TEXT DEFAULT '[]',
        theme TEXT DEFAULT '',
        model_answer TEXT DEFAULT '',
        points TEXT DEFAULT '[]',
        options TEXT DEFAULT '[]',
        correct_index INTEGER DEFAULT -1,
        explanation TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      INSERT INTO questions (id, material_id, mode, text, blank_word, acceptable, theme, model_answer, points, explanation, created_at) SELECT id, material_id, mode, text, blank_word, acceptable, theme, model_answer, points, explanation, created_at FROM questions_old;
      DROP TABLE questions_old;
      CREATE INDEX IF NOT EXISTS idx_questions_material ON questions(material_id);
      ALTER TABLE study_history RENAME TO study_history_old;
      CREATE TABLE study_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        result TEXT NOT NULL CHECK(result IN ('correct', 'partial', 'wrong')),
        score REAL NOT NULL DEFAULT 0,
        answer TEXT DEFAULT '',
        feedback TEXT DEFAULT '',
        answered_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      INSERT INTO study_history SELECT * FROM study_history_old;
      DROP TABLE study_history_old;
      CREATE INDEX IF NOT EXISTS idx_history_question ON study_history(question_id);
      ALTER TABLE review_schedule RENAME TO review_schedule_old;
      CREATE TABLE review_schedule (
        question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
        interval_days REAL NOT NULL DEFAULT 1,
        next_review_at TEXT DEFAULT '',
        consecutive_correct INTEGER NOT NULL DEFAULT 0,
        last_result TEXT DEFAULT '',
        total_correct INTEGER NOT NULL DEFAULT 0,
        total_wrong INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      INSERT INTO review_schedule SELECT * FROM review_schedule_old;
      DROP TABLE review_schedule_old;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
    console.log('DBマイグレーション完了: 選択式（モードC）用の列を追加');
  }
}

migrateQuestionOptions();

function migrateQuestionModeD() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'questions'").get();
  if (!row || !row.sql) return;
  const sh = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'study_history'").get();
  const rs = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'review_schedule'").get();
  const fkBroken =
    (sh && /questions_old/.test(sh.sql)) || (rs && /questions_old/.test(rs.sql));
  if (row.sql.includes("CHECK(mode IN ('A', 'B', 'C'))") || fkBroken) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      ALTER TABLE questions RENAME TO questions_old;
      ALTER TABLE study_history RENAME TO study_history_old;
      ALTER TABLE review_schedule RENAME TO review_schedule_old;
      CREATE TABLE questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK(mode IN ('A', 'B', 'C', 'D')),
        text TEXT NOT NULL,
        blank_word TEXT DEFAULT '',
        acceptable TEXT DEFAULT '[]',
        theme TEXT DEFAULT '',
        model_answer TEXT DEFAULT '',
        points TEXT DEFAULT '[]',
        options TEXT DEFAULT '[]',
        correct_index INTEGER DEFAULT -1,
        direction TEXT DEFAULT '',
        explanation TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      INSERT INTO questions (id, material_id, mode, text, blank_word, acceptable, theme, model_answer, points, options, correct_index, direction, explanation, created_at)
        SELECT id, material_id, mode, text, blank_word, acceptable, theme, model_answer, points, options, correct_index, direction, explanation, created_at FROM questions_old;
      DROP TABLE questions_old;
      CREATE INDEX IF NOT EXISTS idx_questions_material ON questions(material_id);
      CREATE TABLE study_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        result TEXT NOT NULL CHECK(result IN ('correct', 'partial', 'wrong')),
        score REAL NOT NULL DEFAULT 0,
        answer TEXT DEFAULT '',
        feedback TEXT DEFAULT '',
        answered_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      INSERT INTO study_history (id, question_id, result, score, answer, feedback, answered_at) SELECT id, question_id, result, score, answer, feedback, answered_at FROM study_history_old;
      DROP TABLE study_history_old;
      CREATE INDEX IF NOT EXISTS idx_history_question ON study_history(question_id);
      CREATE TABLE review_schedule (
        question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
        interval_days REAL NOT NULL DEFAULT 1,
        next_review_at TEXT DEFAULT '',
        consecutive_correct INTEGER NOT NULL DEFAULT 0,
        last_result TEXT DEFAULT '',
        total_correct INTEGER NOT NULL DEFAULT 0,
        total_wrong INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      INSERT INTO review_schedule (question_id, interval_days, next_review_at, consecutive_correct, last_result, total_correct, total_wrong, created_at) SELECT question_id, interval_days, next_review_at, consecutive_correct, last_result, total_correct, total_wrong, created_at FROM review_schedule_old;
      DROP TABLE review_schedule_old;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
    console.log('DBマイグレーション完了: モードD（英単語）を追加（CHECK制約を更新）');
  }
}

migrateQuestionModeD();

function migrateEnglishDirection() {
  const cols = db.prepare("PRAGMA table_info(questions)").all().map((c) => c.name);
  if (!cols.includes('direction')) {
    db.exec('ALTER TABLE questions ADD COLUMN direction TEXT DEFAULT \'\';');
    console.log('DBマイグレーション完了: 英単語モード用の向き（direction）列を追加');
  }
}

migrateEnglishDirection();

export function getMaterial(id) {
  return db.prepare('SELECT * FROM materials WHERE id = ?').get(id) ?? null;
}

export function listMaterials() {
  return db
    .prepare('SELECT * FROM materials ORDER BY created_at DESC')
    .all();
}

export function createMaterial({ title, subject, unit, sourceType, content }) {
  const info = db
    .prepare(
      'INSERT INTO materials (title, subject, unit, source_type, content) VALUES (?, ?, ?, ?, ?)'
    )
    .run(title, subject ?? '', unit ?? '', sourceType ?? 'text', content);
  return getMaterial(Number(info.lastInsertRowid));
}

export function deleteMaterial(id) {
  db.prepare('DELETE FROM materials WHERE id = ?').run(id);
}

export function listQuestions({ materialId, mode } = {}) {
  let sql = 'SELECT q.*, m.title AS material_title FROM questions q JOIN materials m ON m.id = q.material_id';
  const conds = [];
  const args = [];
  if (materialId) {
    conds.push('q.material_id = ?');
    args.push(materialId);
  }
  if (mode) {
    conds.push('q.mode = ?');
    args.push(mode);
  }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY q.id DESC';
  return db.prepare(sql).all(...args);
}

export function listUnansweredQuestions({ materialIds = [], mode = null, direction = null } = {}) {
  let sql = `SELECT q.*, m.title AS material_title FROM questions q
    JOIN materials m ON m.id = q.material_id
    WHERE NOT EXISTS (SELECT 1 FROM study_history h WHERE h.question_id = q.id)`;
  const conds = [];
  const args = [];
  if (materialIds.length) {
    conds.push('q.material_id IN (' + materialIds.map(() => '?').join(',') + ')');
    args.push(...materialIds);
  }
  if (mode) {
    conds.push('q.mode = ?');
    args.push(mode);
  }
  if (direction) {
    conds.push('q.direction = ?');
    args.push(direction);
  }
  if (conds.length) sql += ' AND ' + conds.join(' AND ');
  sql += ' ORDER BY q.id ASC';
  return db.prepare(sql).all(...args);
}

export function getQuestion(id) {
  return db
    .prepare('SELECT q.*, m.title AS material_title FROM questions q JOIN materials m ON m.id = q.material_id WHERE q.id = ?')
    .get(id) ?? null;
}

export function insertQuestions(materialId, questions) {
  if (!questions.length) return [];
  const ids = [];
  const stmt = db.prepare(
    'INSERT INTO questions (material_id, mode, text, blank_word, acceptable, theme, model_answer, points, options, correct_index, direction, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  db.exec('BEGIN');
  try {
    for (const q of questions) {
      const info = stmt.run(
        materialId,
        q.mode,
        q.text,
        q.blank_word ?? '',
        JSON.stringify(q.acceptable ?? []),
        q.theme ?? '',
        q.model_answer ?? '',
        JSON.stringify(q.points ?? []),
        JSON.stringify(q.options ?? []),
        Number.isInteger(q.correct_index) ? q.correct_index : -1,
        q.direction ?? '',
        q.explanation ?? ''
      );
      ids.push(Number(info.lastInsertRowid));
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return ids;
}

export function updateQuestion(id, fields) {
  const q = getQuestion(id);
  if (!q) return null;
  const next = { ...q, ...fields };
  db.prepare(
    `UPDATE questions SET text = ?, blank_word = ?, acceptable = ?, theme = ?, model_answer = ?, points = ?, options = ?, correct_index = ?, direction = ?, explanation = ? WHERE id = ?`
  ).run(
    next.text,
    next.blank_word ?? '',
    JSON.stringify(next.acceptable ?? []),
    next.theme ?? '',
    next.model_answer ?? '',
    JSON.stringify(next.points ?? []),
    JSON.stringify(next.options ?? []),
    Number.isInteger(next.correct_index) ? next.correct_index : -1,
    next.direction ?? '',
    next.explanation ?? '',
    id
  );
  return getQuestion(id);
}

export function deleteQuestion(id) {
  db.prepare('DELETE FROM questions WHERE id = ?').run(id);
}

export function deleteQuestionsByMaterial(materialId) {
  db.prepare('DELETE FROM questions WHERE material_id = ?').run(materialId);
}

export function countQuestions() {
  return db.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
}

export function countQuestionsByMaterial(materialId) {
  return db.prepare('SELECT COUNT(*) AS n FROM questions WHERE material_id = ?').get(materialId).n;
}

export function countDue() {
  return db
    .prepare(`SELECT COUNT(*) AS n FROM review_schedule WHERE next_review_at = '' OR next_review_at <= datetime('now', 'localtime')`)
    .get().n;
}

export function countHistory() {
  return db.prepare('SELECT COUNT(*) AS n FROM study_history').get().n;
}

export function getSchedule(questionId) {
  return db.prepare('SELECT * FROM review_schedule WHERE question_id = ?').get(questionId) ?? null;
}

export function upsertSchedule(questionId, fields) {
  const existing = getSchedule(questionId);
  if (existing) {
    db.prepare(
      `UPDATE review_schedule SET interval_days = ?, next_review_at = ?, consecutive_correct = ?, last_result = ?, total_correct = ?, total_wrong = ? WHERE question_id = ?`
    ).run(
      fields.interval_days ?? existing.interval_days,
      fields.next_review_at ?? existing.next_review_at,
      fields.consecutive_correct ?? existing.consecutive_correct,
      fields.last_result ?? existing.last_result,
      fields.total_correct ?? existing.total_correct,
      fields.total_wrong ?? existing.total_wrong,
      questionId
    );
  } else {
    db.prepare(
      `INSERT INTO review_schedule (question_id, interval_days, next_review_at, consecutive_correct, last_result, total_correct, total_wrong) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      questionId,
      fields.interval_days ?? 1,
      fields.next_review_at ?? '',
      fields.consecutive_correct ?? 0,
      fields.last_result ?? '',
      fields.total_correct ?? 0,
      fields.total_wrong ?? 0
    );
  }
}

export function addHistory({ questionId, result, score, answer, feedback }) {
  const info = db
    .prepare(
      'INSERT INTO study_history (question_id, result, score, answer, feedback) VALUES (?, ?, ?, ?, ?)'
    )
    .run(questionId, result, score, answer, feedback);
  return Number(info.lastInsertRowid);
}

export function listHistory({ questionId } = {}) {
  let sql = `SELECT h.*, q.mode AS mode, q.text AS question_text, q.theme AS theme, q.blank_word AS blank_word, m.title AS material_title
             FROM study_history h
             JOIN questions q ON q.id = h.question_id
             JOIN materials m ON m.id = q.material_id`;
  const args = [];
  if (questionId) {
    sql += ' WHERE h.question_id = ?';
    args.push(questionId);
  }
  sql += ' ORDER BY h.id DESC LIMIT 500';
  return db.prepare(sql).all(...args);
}

export function listReviewStatus() {
  return db.prepare(`
    SELECT rs.*, q.mode AS mode, q.text AS question_text, q.theme AS theme, q.blank_word AS blank_word,
           m.title AS material_title, m.subject AS subject, m.unit AS unit
    FROM review_schedule rs
    JOIN questions q ON q.id = rs.question_id
    JOIN materials m ON m.id = q.material_id
    ORDER BY
      CASE WHEN rs.next_review_at = '' OR rs.next_review_at <= datetime('now', 'localtime') THEN 0 ELSE 1 END,
      rs.next_review_at ASC
  `).all();
}

export function pickDueQuestions({ materialIds, mode = null, direction = null, limit }) {
  const conds = [];
  const args = [];
  if (materialIds && materialIds.length) {
    conds.push(`q.material_id IN (${materialIds.map(() => '?').join(',')})`);
    args.push(...materialIds);
  }
  if (mode) {
    conds.push('q.mode = ?');
    args.push(mode);
  }
  if (direction) {
    conds.push('q.direction = ?');
    args.push(direction);
  }
  let sql = `
    SELECT q.*, m.title AS material_title
    FROM questions q
    JOIN materials m ON m.id = q.material_id
    LEFT JOIN review_schedule rs ON rs.question_id = q.id
  `;
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ` AND (rs.next_review_at = '' OR rs.next_review_at <= datetime('now', 'localtime'))
          ORDER BY COALESCE(rs.next_review_at, '1900-01-01') ASC, q.id ASC LIMIT ?`;
  args.push(limit);
  return db.prepare(sql).all(...args);
}

export function pickRandomQuestions({ materialIds, limit }) {
  const conds = [];
  const args = [];
  if (materialIds && materialIds.length) {
    conds.push(`q.material_id IN (${materialIds.map(() => '?').join(',')})`);
    args.push(...materialIds);
  }
  let sql = `
    SELECT q.*, m.title AS material_title
    FROM questions q
    JOIN materials m ON m.id = q.material_id
  `;
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY RANDOM() LIMIT ?';
  args.push(limit);
  return db.prepare(sql).all(...args);
}
