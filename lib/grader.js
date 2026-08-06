import { chatJSON } from './ai.js';

const GRADE_A_SYSTEM = `あなたは採点者です。穴埋め問題の解答を採点してください。

【採点基準】
- 正解語句が表記ゆれ・ひらがな/漢字・一部言い換え・助詞の有無などの違いで書かれていても正解とする。
- 意味が完全に合っていれば correct（100点）。
- 意味は概ね合っているが不正確・曖昧、または部分的な正解は partial（50点前後）。
- 明らかに間違い、または無回答は wrong（0点）。

【出力形式】JSONのみ。
{"result":"correct|partial|wrong","score":0〜100の整数,"feedback":"簡潔なフィードバック（日本語）"}`;

const GRADE_B_SYSTEM = `あなたは採点者です。用語説明問題の解答を採点してください。

【採点基準】
- 模範解答を参照し、ユーザーの説明が観点(points)で示された項目（誰が・いつ・どこで・内容・なぜ・結果など）をどの程度カバーし、意味が正しいかをチェックする。
- 3段階（〇／△／×）で判定し、score は0〜100で部分点をつける。
  - correct（〇）: 主要な観点をおおむね含み、意味が正しい（80点以上）
  - partial（△）: 一部の観点が含まれる、または曖昧・不正確（30〜79点）
  - wrong（×）: 観点がほぼ含まれない、または誤り（30点未満）
- feedback には、不足している観点と正しい答えを具体的に示す。

【出力形式】JSONのみ。
{"result":"correct|partial|wrong","score":0〜100の整数,"feedback":"具体的なフィードバック（日本語）","missing_points":["不足した観点1","不足した観点2"]}`;

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
