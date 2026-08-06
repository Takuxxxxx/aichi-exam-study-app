# AGENTS.md

## 変更反映ルール（毎回必ず実施）

コードを変更したら、必ず以下の手順を最後まで行う：

1. **構文チェック**: 変更した JS ファイルに `node --check <file>` を実行
2. **静的ファイル反映**: `Copy-Item public\index.html,public\app.js,public\style.css dist\public\ -Force`
3. **EXE 再ビルド**: `server.js` または `lib/` 配下を変更した場合は `npm run build:exe` を実行（静的ファイルのみの変更なら省略可）
4. **動作確認**: EXE を起動して `/api/status`・UI配信・主要エンドポイントを確認し、終了する
5. **GitHub 反映**: 変更をコミットしてプッシュする（リポジトリ: `https://github.com/Takuxxxxx/aichi-exam-app` / master ブランチ）

コミットメッセージは日本語で簡潔に（例: `未回答問題を再利用する仕様に変更`）。

## プロジェクト概要

愛知県公立高校入試対策の暗記学習アプリ（ローカル運用、Gemini無料枠）。

- AI設定: `.env` の `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL`
- サーバー: `server.js`、問題生成: `lib/generator.js`、採点: `lib/grader.js`、DB: `lib/db.js`（SQLite）
- 出題開始時、未回答の問題を再利用し、足りない分だけAIが新規生成する
- EXEは `dist/aichi-exam-app.exe`（`npm run build:exe` で生成）。`dist/public` と `dist/.env` が必須
