# 愛知県公立高校入試対策 暗記アプリ

資料（PDF / テキスト）をアップロードすると、AI（Google Gemini 無料枠 / DeepSeek など OpenAI 互換 API）が一問一答形式の問題を自動生成する暗記学習アプリです。
穴埋め（モードA）と用語説明（モードB）の両方に対応し、スパン反復方式の復習スケジュールで記憶の定着を支援します。

## 主な機能

- **資料の登録**: PDF（文字埋め込み）・TXT・MD のファイル、またはテキスト貼り付けで登録
- **出題時に問題を自動生成（未回答問題は再利用）**:
  - 出題開始時、作成済みでまだ回答していない問題があればそれを優先して出題し、足りない分だけ AI が新規生成（事前生成は不要）
  - モードA（穴埋め）: 重要な短文から空欄を1個作る。空欄位置を変えて複数問生成（原因・結果・背景・人物・制度・年代を優先）
  - モードB（用語説明）: テーマ（用語）を自分の言葉で説明 → AIが採点
- **出題**: 1問ずつ出題し、回答後に AI 採点・正解・解説を表示。問題数（5〜50問）を指定可能
- **復習システム**: 不正解の問題は数問進めてから再出題。間隔を「1日→2日→4日…（上限30日）」と自動的に伸ばして再出題。生成した問題は保存され、正誤履歴と復習間隔も記録
- **管理画面**: 問題の一覧・編集・削除、復習状況・正誤履歴の確認

## 必要環境

- Node.js v22.5 以上（SQLite の `node:sqlite` を利用。v24 推奨）
- AI API キー（無料の Google Gemini、または DeepSeek など OpenAI 互換 API）

## セットアップと起動

```bash
# 1. 依存パッケージをインストール
npm install

# 2. AI APIキーを設定（.env.example をコピーして編集）
copy .env.example .env

# 3. 起動
npm start
```

ブラウザで http://localhost:3000 を開きます。

## 無料のAI APIを設定する（Google Gemini おすすめ）

DeepSeek は課金制です。**無料で使いたい場合は Google の Gemini 無料枠** が日本語品質・無料枠の広さで最適です。

1. https://aistudio.google.com/apikey に Google アカウントでアクセス → 「Create API key」でキーを取得（クレジットカード不要）
2. `.env` を以下のように設定:

```ini
AI_API_KEY=ここにGeminiのAPIキー
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_MODEL=gemini-3.5-flash-lite
```

3. **重要（プライバシー）**: 無料枠は初期設定で「プロンプトがAIの学習に使われる」ことがあります。AI Studio の設定画面 → Data Controls で「Don't use my prompts to improve your models」に変更してください。

### 他の無料/有料プロバイダも使える

`.env` の `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` を変えるだけで OpenAI 互換 API なら何でも使えます。

| プロバイダ | 設定例（AI_BASE_URL / AI_MODEL） | 料金 |
|---|---|---|
| Gemini 無料枠 | `https://generativelanguage.googleapis.com/v1beta/openai` / `gemini-3.5-flash-lite` | 無料枠あり |
| DeepSeek | `https://api.deepseek.com/v1` / `deepseek-chat` | 課金制（安価） |
| Groq | `https://api.groq.com/openai/v1` / `llama-3.3-70b-versatile` | 無料枠あり |

※ JSON出力（`response_format`）に対応しないプロバイダは、自動的にJSONモードなしで再試行します。

## 使い方

1. **資料タブ** で資料を登録（タイトル・科目・単元つき）
2. **出題タブ** で資料と問題数を選んで「出題を開始」→ 未回答の問題があれば再利用し、足りない分だけ AI が新規生成（数秒〜数十秒）
3. 1問ずつ回答 → 採点結果・正解・解説を確認しながら進める（間違えた問題は数問後に再出題）
4. 生成した問題は保存されるので、**問題管理タブ** で編集・削除も可能
5. **復習・履歴タブ** で次回出題日・正誤履歴を確認

※ 未回答の問題を再利用するので、使い続けるほど新規生成が減ります。生成時のみ「生成分＋採点分」のトークンを消費します（無料枠でも毎日100問程度なら十分）。

## データの保存

- データは `data/app.db`（SQLite）に保存され、サーバーを再起動しても復習スケジュールは保持されます
- 回答・採点履歴はすべて手元の PC にのみ保存され、外部へ送信されません（AI API へのリクエストに含まれるのは問題文・解答のみ）

## 注意事項

- PDF は文字情報が埋め込まれたものに対応します。スキャン画像 PDF は文字抽出できないため、テキスト貼り付けで登録してください
- AI API キーが未設定の場合は問題生成・採点ができません（設定方法は上記「無料のAI APIを設定する」参照）
- 無料のクラウド AI（Gemini 無料枠など）は、プロンプトが学習に使われないよう設定で OFF にしてください（README 記載の手順）
- API キーはソースコード・ログに残さず、`.env` でのみ管理してください

## GitHub などでの公開について

このアプリはバックエンド（Node.js）と SQLite を必要とするため、静的ホスティング（GitHub Pages）では動作しません。
**Render（無料プラン）** にデプロイすると、URL だけで誰でも使えるようになります。

### Render にデプロイする手順（無料）

1. https://render.com にサインアップ（無料・クレジットカード不要）
2. ダッシュボード右上の **New +** → **Blueprint** を選択
3. GitHub 連携し、リポジトリ `Takuxxxxx/aichi-exam-study-app` を選択
4. リポジトリ内の `render.yaml` が読み込まれます。**AI_API_KEY** の値を入力（Gemini の API キー）
   - 事前に https://aistudio.google.com/apikey でキーを取得しておくこと
5. **Apply / Deploy** を押すとデプロイ開始（数分）。完了後 `https://aichi-exam-study-app.onrender.com` にアクセス

### Render デプロイの注意点

- **無料プランは一定時間アクセスがないとスリープ**し、次回アクセス時に再起動（初回だけ数十秒かかる）。デプロイごとにファイルシステムもリセットされるため、**データ（`data/app.db`）はデプロイのたびに消えます**。一時的なデモ用とお考えください
- データを永続化したい場合は、PostgreSQL 対応や有料プラン、または Railway / Fly.io を検討してください
- API キーは必ず **サーバー側の環境変数**（Render ダッシュボード → Environment）に設定し、フロントエンドやソースコードに露出させないこと
- 現状は1ユーザー前提の構成です。複数ユーザー向けに公開する場合は認証とユーザー別データ管理の追加が必要です

## Windows 用 EXE（Node.js 不要で起動）

`npm run build:exe` で **`dist/aichi-exam-app.exe`**（Node ランタイム内蔵の単一 EXE）を生成できます。

- 生成物: `dist/` に EXE と `public/` フォルダが作られます
- 使い方: `dist/` に `.env`（AI_API_KEY 等）を置き、EXE をダブルクリック → ブラウザが自動で開きます。コンソールを閉じるとサーバーも終了
- データは EXE と同じフォルダの `data/` に保存されます
- ビルドには `esbuild` と `@yao-pkg/pkg` が必要（`npm install` で導入済み）

## スマホから使う（同じWi-FiのLAN内）

PC（または EXE）を起動したまま、スマホのブラウザから同じ家の Wi-Fi に繋いでアクセスできます。データ・AI 設定はすべて PC 側にあります。

1. PC とスマホを**同じ Wi-Fi** に接続
2. 起動時のコンソールに表示される `スマホなど同じWi-Fiの端末から: http://192.168.x.x:3000` の URL をスマホのブラウザで開く（IP を確認するには `ipconfig` の IPv4 アドレス）
3. **初回は Windows ファイアウォールの許可ダイアログが出たら「許可」**を選ぶ。出ない場合は、Windows セキュリティ → ファイアウォールとネットワーク保護 → 詳細設定 で `aichi-exam-app.exe`（または `node.exe`）の受信接続を許可する
4. スマホのブラウザのメニューから「**ホーム画面に追加**」するとアプリのようにフルスクリーンで使えます

注意:
- PC がスリープ・終了するとアクセスできません（PC を起動したままにする）
- 家の外（外出先）から使うには、ポート開放や ngrok / Cloudflare Tunnel などのトンネルが必要です（セキュリティに注意）。複数人で使う場合は認証の追加も検討してください
- URL を直接入力する場合は `http://<PCのIP>:3000`（末尾に `/` を付けない）

## 構成

```
server.js        Express サーバー（API + 静的ファイル配信）
lib/db.js        SQLite データベース層（資料・問題・履歴・復習スケジュール）
lib/ai.js        AI API クライアント（OpenAI 互換・Gemini/DeepSeek/Groq 対応）
lib/generator.js 問題生成（モードA/B）
lib/grader.js    AI 採点（モードA/B）
lib/scheduler.js スパン反復スケジュール
lib/pdf.js       PDF テキスト抽出（pdfjs-dist）
public/          Web フロントエンド（単一HTML/JS/CSS）
data/app.db      データベース（自動生成）
```
