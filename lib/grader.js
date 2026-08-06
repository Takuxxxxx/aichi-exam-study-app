import { chatJSON } from './ai.js';

const GRADE_A_SYSTEM = `あなたは採点者です。穴埋め問題の解答を採点してください。

【採点基準】
- 正解語句が表記ゆれ・ひらがな/漢字・一部言い換え・助詞の有無などの違いで書かれていても正解とする。
- 意味が完全に合っていれば correct（100点）。
- 意味は概ね合っているが不正確・曖昧、または部分的な正解は partial（50点前後）。
- 明らかに間違い、または無回答は wrong（0点）。

【出力形式】JSONのみ。
{"result":"correct|partial|wrong","score":0〜100の整数,"feedback":"簡潔なフィードバック（日本語）","good_points":["正しく書けていた点（正解・合っていた部分）"],"missing_points":["不足している点・誤り"]}`;

const GRADE_B_SYSTEM = `あなたは採点者です。用語説明問題の解答を採点してください。

【採点基準】
- 模範解答を参照し、ユーザーの説明が観点(points)で示された項目（誰が・いつ・どこで・内容・なぜ・結果など）をどの程度カバーし、意味が正しいかをチェックする。
- 3段階（〇／△／×）で判定し、score は0〜100で部分点をつける。
  - correct（〇）: 主要な観点をおおむね含み、意味が正しい（80点以上）
  - partial（△）: 一部の観点が含まれる、または曖昧・不正確（30〜79点）
  - wrong（×）: 観点がほぼ含まれない、または誤り（30点未満）
- good_points には、ユーザーの解答で「正しく書けていた点・良かった点」だけを具体的に入れる。
- missing_points には、「不足していた観点・間違っていた点」と正しい内容を具体的に入れる。

【出力形式】JSONのみ。
{"result":"correct|partial|wrong","score":0〜100の整数,"feedback":"簡潔なフィードバック（日本語）","good_points":["正しく書けていた点（合っていた部分）"],"missing_points":["不足・誤り1","不足・誤り2"]}`;

const GRADE_C_SYSTEM = `あなたは採点者です。入試レベルの記述問題の解答を採点してください。

【採点基準】
- 模範解答と観点(points)を参照し、ユーザーの説明が観点（誰が・いつ・内容・なぜ・結果・影響など）をどの程度カバーし、理由や関係性を論理的に説明できているかをチェックする。
- 3段階（〇／△／×）で判定し、score は0〜100で部分点をつける。
  - correct（〇）: 主要な観点をほぼ網羅し、論理が正しい（80点以上）
  - partial（△）: 一部の観点のみ、または論理が不明瞭・不正確（30〜79点）
  - wrong（×）: 観点がほぼ含まれず、または誤り（30点未満）
- good_points には、ユーザーの解答で「正しく書けていた点・良かった点」だけを具体的に入れる。
- missing_points には、「不足していた観点・間違っていた点」と正しい内容を具体的に入れる。

【出力形式】JSONのみ。
{"result":"correct|partial|wrong","score":0〜100の整数,"feedback":"簡潔なフィードバック（日本語）","good_points":["正しく書けていた点"],"missing_points":["不足・誤り1","不足・誤り2"]}`;

export async function gradeModeA({ question, userAnswer }) {
  const acceptable = Array.isArray(question.acceptable) ? question.acceptable : [];
  const user = `【問題】${question.text}\n【正解語句】${question.blank_word}\n【許容する別表記】${acceptable.join('、')}\n【ユーザーの解答】${userAnswer || '(未回答)'}\n\nこの解答を採点してください。`;
  return chatJSON({ system: GRADE_A_SYSTEM, user, temperature: 0.2, maxTokens: 1024 });
}

export async function gradeModeB({ question, userAnswer }) {
  const points = Array.isArray(question.points) ? question.points : [];
  const user = `【テーマ】${question.theme}\n【模範解答】${question.model_answer}\n【キーポイント】${points.join('、')}\n【ユーザーの説明】${userAnswer || '(未回答)'}\n\nこの説明を採点してください。`;
  return chatJSON({ system: GRADE_B_SYSTEM, user, temperature: 0.2, maxTokens: 1024 });
}

export async function gradeModeC({ question, userAnswer }) {
  const points = Array.isArray(question.points) ? question.points : [];
  const user = `【問題】${question.text}\n【テーマ】${question.theme}\n【模範解答】${question.model_answer}\n【観点】${points.join('、')}\n【ユーザーの解答】${userAnswer || '(未回答)'}\n\nこの解答を採点してください。`;
  return chatJSON({ system: GRADE_C_SYSTEM, user, temperature: 0.2, maxTokens: 1024 });
}
