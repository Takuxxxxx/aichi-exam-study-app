import 'dotenv/config';

const API_KEY = process.env.AI_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim() || '';
const BASE_URL = (process.env.AI_BASE_URL?.trim() || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
const MODEL = process.env.AI_MODEL?.trim() || 'deepseek-chat';
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 60000;

export function isConfigured() {
  return !!API_KEY;
}

export async function chatJSON({ system, user, temperature = 0.4, maxTokens = 4096 }) {
  if (!API_KEY) {
    const err = new Error('AI API キーが設定されていません。.env の AI_API_KEY にAPIキーを設定してください。');
    err.code = 'NO_API_KEY';
    throw err;
  }

  // プロバイダによっては response_format（JSONモード）に対応していない。
  // まず JSON モード付きで試し、400/422 等で拒否されたら JSON モードなしで再試行する。
  const tryWithJsonMode = async () => {
    const body = buildBody({ system, user, temperature, maxTokens, jsonMode: true });
    return request(body);
  };
  const tryWithoutJsonMode = async () => {
    const body = buildBody({ system, user, temperature, maxTokens, jsonMode: false });
    return request(body);
  };

  try {
    return await tryWithJsonMode();
  } catch (e) {
    if (e.code === 'AI_API_ERROR' && (e.status === 400 || e.status === 422 || e.status === 404)) {
      console.warn('JSONモードが拒否されたため、JSONモードなしで再試行します。');
      return await tryWithoutJsonMode();
    }
    throw e;
  }
}

function buildBody({ system, user, temperature, maxTokens, jsonMode }) {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    max_tokens: maxTokens,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  return body;
}

async function request(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const err = new Error(
      e.name === 'AbortError'
        ? `AI の応答が ${Math.round(TIMEOUT_MS / 1000)} 秒以上かかりタイムアウトしました。ネットワークまたはAPIの状態を確認してください。`
        : `AI API への接続に失敗しました: ${e.message}`
    );
    err.code = e.name === 'AbortError' ? 'AI_TIMEOUT' : 'AI_API_ERROR';
    throw err;
  }
  clearTimeout(timer);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`AI API エラー (HTTP ${res.status}): ${text.slice(0, 500)}`);
    err.code = 'AI_API_ERROR';
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  return parseJSON(content);
}

function parseJSON(content) {
  if (!content) throw new Error('AI の応答が空でした。');
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const attempts = [
    () => JSON.parse(cleaned),
    () => {
      if (cleaned.startsWith('{')) {
        const end = cleaned.lastIndexOf('}');
        if (end > 0) return JSON.parse(cleaned.slice(0, end + 1));
      }
      throw new Error('not object');
    },
    () => {
      if (cleaned.startsWith('[')) {
        const end = cleaned.lastIndexOf(']');
        if (end > 0) return JSON.parse(cleaned.slice(0, end + 1));
      }
      throw new Error('not array');
    },
  ];
  for (const fn of attempts) {
    try {
      return fn();
    } catch {
      // 次の方式へ
    }
  }
  throw new Error('AI の応答がJSONとして解釈できませんでした。');
}
