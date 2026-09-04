# AI Work OS — Phase 1

目標を見失わない！タスク管理アプリ

自分専用の AI Work OS。人生の目標から今日の行動までをつなぎ、
Human と AI が役割分担して実行できる状態を作るためのアプリ。
詳細な要件は [PRD.md](./PRD.md) を参照。

Phase 1 はスマホUIプロトタイプ（DB接続なし）。
GENESISの60日チャレンジは実データ、それ以外（営業代行/RIALA/その他）はまだダミーデータ。

## デプロイ

Production: https://kotorinu-s-projects.vercel.app

GitHub (`kotorinu/kotorinu-s-projects`, `main`) への push で Vercel が自動デプロイする。

## 起動方法

```bash
npm install
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開く（`/` は自動的に `/today` へリダイレクト）。

スマホ実機で確認する場合は、同じWi-Fiに繋いだ端末から `http://<このPCのIPアドレス>:3000` を開く。

このリポジトリを Claude Code のワークスペースから開いている場合、
`.claude/launch.json` に `ai-work-os`（ポート4620）が登録済みなので、
Preview から直接起動できる。

## 画面構成（Phase 1）

- `/today` — TODAY：今日やるタスクのみ表示。期限超過件数と「2日以内」の折りたたみ表示付き
- `/tasks` — TASK MAP：月切り替え・集計（全タスク/完了/進行/未着手/AI担当/期限超過/7日以内）・フィルター・並び替え・月末の状態
- `/goals` — GOAL TREE：人生の目的から具体タスクまでの階層を開閉式で表示

下部ナビゲーションで3画面を行き来する。

## データ

`lib/dummy-data.ts` にタスク・ゴール・月末状態・Outcome・Recurring Ruleを定義。
日付は起動時点の「今日」からの相対オフセットで生成しているため、
いつ開いても期限超過・今日・2日以内・7日以内などの表示が破綻しない。

GENESISの `outcomes`（60日チャレンジ）と `recurringRules`（3つの日次習慣）は実データ。
それ以外のタスク・ゴールはまだダミーデータで、Phase 2（Supabase接続）以降に実データへ差し替える想定。

## 技術構成

- Next.js (App Router) / TypeScript / Tailwind CSS v4
- 状態はすべてクライアント側のダミーデータ・ローカルstateのみ（永続化なし）
