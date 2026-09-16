# AI Work OS

2026-09-17: Task/Goalの中央保存・編集、実績履歴同期、AI実行台帳、外部AI API、
PWAを追加しました。
現在の使い方・実装範囲は [docs/work-api.md](docs/work-api.md) と
[docs/completion-status.md](docs/completion-status.md) を参照してください。

TASK MAP / GOAL TREEから既存の操作キーでログインし、中央データへ登録できます。
期限・時間が未確定のタスクはBacklogに残します。実績は中央保存へ同期し、
失敗・衝突時は上書きを止めて端末記録を保持します。
AI成果物はTASK MAPの「AI実行・成果物」で確認します。
中央保存済み変更予定のICS書出しとホーム画面インストールにも対応しています。

本番: https://kotorinu-s-projects.vercel.app

検証: `npm.cmd test` / `npm.cmd run lint` / `npm.cmd run build`。
開発プレビューはworkspaceの `ai-work-os` 構成（4620）を利用します。

