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

const MODE_C_SYSTEM = `あなたは愛知県公立高校入試対策の問題作成者です。
資料から、「入試レベル」の4択問題（選択肢問題）を作成してください。

【ルール】
- 愛知県公立高校入試で実際に出題されそうな、思考力・判断力を問う4択問題を作成する。
- text は「次の文の（　）に当てはまる語句として最も適当なものを、次のア〜エから選びなさい。」「〜した理由として最も適当なものを選びなさい。」など、入試らしい聞き方の日本語で書く。
- 選択肢(options)は必ず4つ。正解は correct_index（0〜3）の1つだけ。
- 正解以外の3つは「紛らわしい」誤りにする（年代・人物・原因・結果の取り違え、似た語句、正解と逆の内容など）。明らかに違う選択肢や、明らかに正解とわかる選択肢は作らない。
- 選択肢に「ア．」「イ．」などの記号は付けない。中身の語句・文のみを入れる。
- theme には題材の用語を入れる。
- explanation には、なぜそれが正解で、他の選択肢がどこが誤りかを簡潔に解説する。
- テーマは偏りがないように時代・分野をまんべんなく選ぶ。すでに出題済みで避けるべきテーマが指定された場合は、それ以外を選ぶ。

【出力形式】JSONのみ。
{"questions":[{"text":"問題文","theme":"題材","options":["選択肢1","選択肢2","選択肢3","選択肢4"],"correct_index":0,"explanation":"解説"}]}`;

const MODE_D_SYSTEM = `あなたは中学〜高校レベルの英語学習の問題作成者です。
資料から、重要な英単語を抽出して単語帳形式の問題を作成してください。

【ルール】
- 資料（英文・和文のどちらでも）から重要な英単語（名詞・動詞・形容詞・副詞など）を選ぶ。
- 英単語は原形で表記する。固有名詞・数詞・助動詞・機能語（the, of, to など）は避ける。
- meaning には主な日本語訳を簡潔に入れる。
- acceptable には「意味の言い換えや別訳」を最大3つ入れる（英語→日本語の問題で正解判定に使う）。
- example にはその単語を使った英文例を1つ入れる（できるだけ簡単な文）。
- 単語は偏りがないように品詞・分野をまんべんなく選ぶ。すでに出題済みで避けるべき単語が指定された場合は、それ以外を選ぶ。

【出力形式】JSONのみ。
{"questions":[{"english":"単語","meaning":"主な日本語訳","acceptable":["別訳1","別訳2"],"example":"英文例"}]}`;

const MODE_APPLICATION_SYSTEM = `あなたは愛知県公立高校入試対策の問題作成者です。
【応用レベル・思考問題】を作成してください。

【ルール】
- 知識だけでは答えられない、理由・原因・結果・比較・自分の考えを問う記述式の思考問題を作る。
- 特定の資料に依存せず、一般的な知識と思考力で答えられるようにする。
- 科目が指定された場合はその科目の範囲内で、指定されなければ入試で出そうな分野から選ぶ。
- theme は題材・用語。model_answer は模範解答例。points には採点観点を3つ程度。
- explanation には補足解説を入れる。
- テーマは偏りがないように選ぶ。すでに出題済みで避けるべきテーマが指定された場合は、それ以外を選ぶ。

【出力形式】JSONのみ。
{"questions":[{"theme":"題材","model_answer":"模範解答例","points":["観点 1","観点 2","観点 3"],"explanation":"解説"}]}`;

export async function generateApplicationQuestions({ subject = '', unit = '', count = 1, avoid = [] }) {
  const used = new Set(avoid.map(norm).filter(Boolean));
  const rows = [];
  const MAX_TRIES = 3;
  for (let attempt = 0; attempt < MAX_TRIES && rows.length < count; attempt++) {
    const need = count - rows.length;
    const avoidList = [...used];
    const user = `【条件】\n科目: ${subject || '未指定'}\n単元: ${unit || '未指定'}\n\n${need}問の応用レベルの思考問題を生成してください。\n【避けるべきテーマ（すでに出題済み。これら以外のテーマを選ぶこと）】\n${avoidList.length ? avoidList.map((a) => `- ${a}`).join('\n') : '（指定なし）'}`;
    const data = await chatJSON({ system: MODE_APPLICATION_SYSTEM, user });
    for (const q of extractQuestions(data)) {
      const theme = String(q.theme ?? '').trim();
      const modelAnswer = String(q.model_answer ?? '').trim();
      const key = norm(theme);
      if (!theme || !modelAnswer || !key || used.has(key)) continue;
      used.add(key);
      rows.push({
        mode: 'B',
        level: 'application',
        theme,
        model_answer: modelAnswer,
        points: Array.isArray(q.points) ? q.points : [],
        explanation: q.explanation ?? '',
        text: theme,
      });
    }
  }
  return rows.slice(0, count);
}

function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\s\u3000]/g, '');
}

function extractQuestions(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.questions)) return data.questions;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

async function generateModeA(chunk, perChunk, materialInfo, avoid = []) {
  const avoidList = avoid.length
    ? `\n\n【避けるべき正解語句（すでに出題済み。これら以外の語句から選ぶこと）】\n${avoid.map((a) => `- ${a}`).join('\n')}`
    : '';
  const user = `【資料情報】\nタイトル: ${materialInfo.title}\n科目: ${materialInfo.subject || '未指定'}\n単元: ${materialInfo.unit || '未指定'}\n\n【資料の抜粋】\n${chunk}\n\n${perChunk}問程度の穴埋め問題を生成してください。${avoidList}`;
  const data = await chatJSON({ system: MODE_A_SYSTEM, user });
  const rows = extractQuestions(data).map((q) => ({
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
  const rows = extractQuestions(data).map((q) => ({
    mode: 'B',
    theme: q.theme ?? '',
    model_answer: q.model_answer ?? '',
    points: Array.isArray(q.points) ? q.points : [],
    explanation: q.explanation ?? '',
    text: q.theme ?? '',
  }));
  return rows.filter((r) => r.theme && r.model_answer);
}

async function generateModeC(chunk, perChunk, materialInfo, avoid = []) {
  const avoidList = avoid.length
    ? `\n\n【避けるべきテーマ（すでに出題済み。これら以外のテーマを選ぶこと）】\n${avoid.map((a) => `- ${a}`).join('\n')}`
    : '';
  const user = `【資料情報】\nタイトル: ${materialInfo.title}\n科目: ${materialInfo.subject || '未指定'}\n単元: ${materialInfo.unit || '未指定'}\n\n【資料の抜粋】\n${chunk}\n\n${perChunk}問程度の入試レベルの4択問題を生成してください。${avoidList}`;
  const data = await chatJSON({ system: MODE_C_SYSTEM, user });
  const rows = extractQuestions(data)
    .map((q) => {
      const options = (Array.isArray(q.options) ? q.options : [])
        .map((o) => String(o ?? '').replace(/^[アイウエオ]\s*[.、)）:：]\s*/, '').trim())
        .filter(Boolean);
      const ci = Number(q.correct_index);
      const correctIndex = Number.isInteger(ci) && ci >= 0 && ci < options.length ? ci : -1;
      return {
        mode: 'C',
        theme: q.theme ?? '',
        text: q.text ?? '',
        options,
        correct_index: correctIndex,
        blank_word: correctIndex >= 0 ? options[correctIndex] : '',
        explanation: q.explanation ?? '',
      };
    });
  // 正解の選択肢が常に先頭（ア）にならないよう、位置をランダムに並べ替える
  const shuffled = rows.map((r) => {
    if (r.correct_index < 0 || r.options.length < 2) return r;
    const src = r.options.slice();
    const correct = src[r.correct_index];
    const rest = src.filter((_, i) => i !== r.correct_index);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const pos = Math.floor(Math.random() * src.length);
    const out = [...rest.slice(0, pos), correct, ...rest.slice(pos)];
    return { ...r, options: out, correct_index: pos, blank_word: correct, text: r.text };
  });
  return shuffled.filter((r) => r.text && r.options.length >= 3 && r.correct_index >= 0);
}

async function generateModeD(chunk, perChunk, materialInfo, direction = 'ja_to_en', avoid = []) {
  const avoidList = avoid.length
    ? `\n\n【避けるべき単語（すでに出題済み。これら以外の単語を選ぶこと）】\n${avoid.map((a) => `- ${a}`).join('\n')}`
    : '';
  const user = `【資料情報】\nタイトル: ${materialInfo.title}\n科目: ${materialInfo.subject || '未指定'}\n単元: ${materialInfo.unit || '未指定'}\n\n【資料の抜粋】\n${chunk}\n\n${perChunk}問程度の英単語を抽出して生成してください。${avoidList}`;
  const data = await chatJSON({ system: MODE_D_SYSTEM, user });
  const dirs = direction === 'both' ? ['ja_to_en', 'en_to_ja'] : [direction];
  const rows = extractQuestions(data).flatMap((q) => {
    const english = String(q.english ?? '').trim();
    const meaning = String(q.meaning ?? '').trim();
    if (!english || !meaning) return [];
    const example = String(q.example ?? '').trim();
    const acceptable = [meaning, ...(Array.isArray(q.acceptable) ? q.acceptable : [])].map((s) => String(s).trim()).filter(Boolean);
    return dirs.map((d) => ({
      mode: 'D',
      direction: d,
      theme: english,
      text: d === 'ja_to_en'
        ? `次の日本語を英語で答えなさい: 「${meaning}」`
        : `次の英単語を日本語で答えなさい: 「${english}」`,
      blank_word: d === 'ja_to_en' ? english : meaning,
      acceptable: d === 'ja_to_en' ? [english] : acceptable,
      explanation: example ? `例文: ${example}` : '',
    }));
  });
  return rows;
}

/**
 * 資料テキストから問題を生成する
 * @param {object} param0
 * @param {string} param0.content 資料本文
 * @param {object} param0.materialInfo {title, subject, unit}
 * @param {number} param0.modeACount 生成するモードA問題数
 * @param {number} param0.modeBCount 生成するモードB問題数
 * @param {number} param0.modeCCount 生成するモードC問題数
 * @param {number} param0.modeDCount 生成するモードD（英単語）問題数
 * @param {string} param0.direction モードDの向き（ja_to_en / en_to_ja / both）
 * @param {string[]} param0.avoidA 避けるべき既出の正解語句（モードA）
 * @param {string[]} param0.avoidB 避けるべき既出のテーマ（モードB）
 * @param {string[]} param0.avoidC 避けるべき既出のテーマ（モードC）
 * @param {string[]} param0.avoidD 避けるべき既出の英単語（モードD）
 */
export async function generateProblems({ content, materialInfo, modeACount = 8, modeBCount = 4, modeCCount = 0, modeDCount = 0, direction = 'ja_to_en', avoidA = [], avoidB = [], avoidC = [], avoidD = [] }) {
  const chunks = chunkText(content);
  const errors = [];
  // 生成に使うチャンク上限と並行数：待ち時間を削減するため、多数のチャンクを並列処理しつつ
  // 呼び出し総数を上限で抑える（大きな資料でも極端に遅くなるのを防ぐ）
  const MAX_GEN_CHUNKS = 8;
  const CONCURRENCY = 3;
  const genChunks = chunks.slice(0, MAX_GEN_CHUNKS);

  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let i = 0;
    async function worker() {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
  }

  async function collect(mode, target, initialAvoid) {
    const used = new Set(mode === 'D'
      ? initialAvoid.flatMap((w) => [norm(w + '|ja_to_en'), norm(w + '|en_to_ja')]).filter(Boolean)
      : initialAvoid.map(norm).filter(Boolean));
    const rows = [];
    const MAX_TRIES = 3;
    for (let attempt = 0; attempt < MAX_TRIES && rows.length < target; attempt++) {
      const need = target - rows.length;
      const perChunk = Math.ceil(need / genChunks.length);
      const genPerChunk = mode === 'D' && direction === 'both' ? Math.ceil(perChunk / 2) : perChunk;
      const results = await mapLimit(genChunks, CONCURRENCY, async (chunk) => {
        try {
          return mode === 'A'
            ? await generateModeA(chunk, perChunk, materialInfo, initialAvoid)
            : mode === 'B'
              ? await generateModeB(chunk, perChunk, materialInfo, initialAvoid)
              : mode === 'C'
                ? await generateModeC(chunk, perChunk, materialInfo, initialAvoid)
                : await generateModeD(chunk, genPerChunk, materialInfo, direction, initialAvoid);
        } catch (e) {
          console.error(`${mode === 'A' ? 'モードA' : mode === 'B' ? 'モードB' : mode === 'C' ? 'モードC' : 'モードD'}生成エラー:`, e.message);
          errors.push(e);
          return [];
        }
      });
      for (const got of results) {
        for (const r of got) {
          const key = mode === 'D'
            ? norm(r.theme + '|' + r.direction)
            : norm(mode === 'A' ? r.blank_word : r.theme);
          if (key && !used.has(key)) {
            used.add(key);
            rows.push(r);
          }
        }
      }
    }
    return rows.slice(0, target);
  }

  const modeA = modeACount > 0 ? await collect('A', modeACount, avoidA) : [];
  const modeB = modeBCount > 0 ? await collect('B', modeBCount, avoidB) : [];
  const modeC = modeCCount > 0 ? await collect('C', modeCCount, avoidC) : [];
  const modeD = modeDCount > 0 ? await collect('D', modeDCount, avoidD) : [];

  if (modeA.length + modeB.length + modeC.length + modeD.length === 0 && errors.length) {
    throw errors[0];
  }

  return {
    questions: [...modeA, ...modeB, ...modeC, ...modeD],
    modeA: modeA.length,
    modeB: modeB.length,
    modeC: modeC.length,
    modeD: modeD.length,
  };
}
