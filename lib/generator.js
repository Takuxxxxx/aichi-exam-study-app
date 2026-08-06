import { chatJSON } from './ai.js';

const CHUNK_SIZE = 4000;

export function chunkText(text, size = CHUNK_SIZE) {
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (current.length + line.length > size && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += line + '\n';
    if (current.length >= size) {
      chunks.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [''];
}

const MODE_A_SYSTEM = `あなたは愛知県公立高校入試対策の問題作成者です。
資料から、暗記に必要な「重要語句」と「原因・結果・背景・流れ」を問う問題を作成してください。

【ルール】
- 資料から重要な短文（1〜2文）を抽出する。
- その短文の重要な語句1個を空欄（　）に置き換えて1問とする。空欄は1問につき必ず1個のみ。
- 空欄の語句は「原因・結果・背景・人物・制度・年代」に関わるものを優先する。
- 同一の短文・正解語句からは1問のみ生成する（空欄の位置を変えた複数問生成はしない）。
- 語句は偏りがないように、時代・分野・人物・出来事をまんべんなく選ぶ。同じ語句を繰り返さない。
- すでに出題済みで避けるべき語句が指定された場合は、それ以外の語句を必ず選ぶ。
- 空欄は全角の（　）で表記する。
- acceptable には、表記ゆれ・ひらがな/漢字・言い換えを含めた正解候補を入れる。
- explanation には、なぜその答えになるのかの簡潔な解説を入れる。

【出力形式】以下はJSONのみを返す。
{"questions":[{"text":"問題文（空欄は（　））","blank_word":"正解の語句","acceptable":["正解","ひらがな","別表記"],"explanation":"解説"}]}`;

const MODE_B_SYSTEM = `あなたは愛知県公立高校入試対策の問題作成者です。
資料から、題名・人物・出来事・制度・条文などの「用語（テーマ）」を選び、用語説明問題を作成してください。

【ルール】
- 入試で問われやすい用語（人物・出来事・制度・法律・事件・年代など）を選ぶ。
- テーマは偏りがないように、時代・分野をまんべんなく選ぶ。同じテーマを繰り返さない。
- すでに出題済みで避けるべきテーマが指定された場合は、それ以外のテーマを必ず選ぶ。
- 模範解答は、背景・内容・結果・影響が分かる3〜5文で作成する。
- points には、説明を書くための「抽象的な観点」を3〜5個入れる。例: 「誰が（人物）」「いつ（時代・年代）」「どこで」「何をしたか（内容）」「なぜ（目的・理由）」「その結果（影響）」。
- 観点はテーマに合わせて選ぶが、答えの内容そのものを連想させる固有名詞・具体的な語句・答えの言い換えを絶対に含めないこと（正解が丸見えにならないように）。「背景」「理由」「影響」のような抽象語にする。
- explanation には補足解説を入れる。

【出力形式】以下はJSONのみを返す。
{"questions":[{"theme":"用語","model_answer":"模範解答","points":["観点1","観点2"],"explanation":"補足解説"}]}`;

function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\s\u3000]/g, '');
}

async function generateModeA(chunk, perChunk, materialInfo, avoid = []) {
  const avoidList = avoid.length
    ? `\n\n【避けるべき正解語句（すでに出題済み。これら以外の語句から選ぶこと）】\n${avoid.map((a) => `- ${a}`).join('\n')}`
    : '';
  const user = `【資料情報】\nタイトル: ${materialInfo.title}\n科目: ${materialInfo.subject || '未指定'}\n単元: ${materialInfo.unit || '未指定'}\n\n【資料の抜粋】\n${chunk}\n\n${perChunk}問程度の穴埋め問題を生成してください。${avoidList}`;
  const data = await chatJSON({ system: MODE_A_SYSTEM, user });
  const rows = (data?.questions ?? []).map((q) => ({
    mode: 'A',
    text: q.text,
    blank_word: q.blank_word ?? '',
    acceptable: Array.isArray(q.acceptable) ? q.acceptable : [q.blank_word].filter(Boolean),
    explanation: q.explanation ?? '',
  }));
  return rows.filter((r) => r.text && r.blank_word);
}

async function generateModeB(chunk, perChunk, materialInfo, avoid = []) {
  const avoidList = avoid.length
    ? `\n\n【避けるべきテーマ（すでに出題済み。これら以外のテーマを選ぶこと）】\n${avoid.map((a) => `- ${a}`).join('\n')}`
    : '';
  const user = `【資料情報】\nタイトル: ${materialInfo.title}\n科目: ${materialInfo.subject || '未指定'}\n単元: ${materialInfo.unit || '未指定'}\n\n【資料の抜粋】\n${chunk}\n\n${perChunk}問程度の用語説明問題を生成してください。${avoidList}`;
  const data = await chatJSON({ system: MODE_B_SYSTEM, user });
  const rows = (data?.questions ?? []).map((q) => ({
    mode: 'B',
    theme: q.theme ?? '',
    model_answer: q.model_answer ?? '',
    points: Array.isArray(q.points) ? q.points : [],
    explanation: q.explanation ?? '',
    text: q.theme ?? '',
  }));
  return rows.filter((r) => r.theme && r.model_answer);
}

/**
 * 資料テキストから問題を生成する
 * @param {object} param0
 * @param {string} param0.content 資料本文
 * @param {object} param0.materialInfo {title, subject, unit}
 * @param {number} param0.modeACount 生成するモードA問題数
 * @param {number} param0.modeBCount 生成するモードB問題数
 * @param {string[]} param0.avoidA 避けるべき既出の正解語句（モードA）
 * @param {string[]} param0.avoidB 避けるべき既出のテーマ（モードB）
 */
export async function generateProblems({ content, materialInfo, modeACount = 8, modeBCount = 4, avoidA = [], avoidB = [] }) {
  const chunks = chunkText(content);
  const errors = [];

  async function collect(mode, target, initialAvoid) {
    const used = new Set(initialAvoid.map(norm).filter(Boolean));
    const rows = [];
    const MAX_TRIES = 3;
    for (let attempt = 0; attempt < MAX_TRIES && rows.length < target; attempt++) {
      const need = target - rows.length;
      const perChunk = Math.ceil(need / chunks.length);
      const avoidList = [...used];
      for (const chunk of chunks) {
        try {
          const got = mode === 'A'
            ? await generateModeA(chunk, perChunk, materialInfo, avoidList)
            : await generateModeB(chunk, perChunk, materialInfo, avoidList);
          for (const r of got) {
            const key = norm(mode === 'A' ? r.blank_word : r.theme);
            if (key && !used.has(key)) {
              used.add(key);
              rows.push(r);
            }
          }
        } catch (e) {
          console.error(`${mode === 'A' ? 'モードA' : 'モードB'}生成エラー:`, e.message);
          errors.push(e);
        }
      }
    }
    return rows.slice(0, target);
  }

  const modeA = modeACount > 0 ? await collect('A', modeACount, avoidA) : [];
  const modeB = modeBCount > 0 ? await collect('B', modeBCount, avoidB) : [];

  if (modeA.length + modeB.length === 0 && errors.length) {
    throw errors[0];
  }

  return { questions: [...modeA, ...modeB], modeA: modeA.length, modeB: modeB.length };
}
