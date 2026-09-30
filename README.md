# AI Work OS

AI Work OSは、人生目標、営業、RIALA運営、日々の仕事を「目標 → 次の行動 → 実行 → 証拠 → 振り返り」までつなぐ個人用の実行基盤です。

本番: https://kotorinu-s-projects.vercel.app

## 最初に見る場所

| 知りたいこと | 正本 |
| --- | --- |
| 現在できること・残課題 | [docs/current-state.md](docs/current-state.md) |
| Git・Google Drive・PCの役割 | [docs/git-operations.md](docs/git-operations.md) |
| 製品の目的と判断基準 | [docs/product-north-star.md](docs/product-north-star.md) |
| データの正本 | [docs/source-of-truth.md](docs/source-of-truth.md) |
| AI Work API | [docs/work-api.md](docs/work-api.md) |
| RIALAの運営手順 | [docs/riala-browser-test-operations.md](docs/riala-browser-test-operations.md) |
| RIALA日次テスト履歴 | [operations/riala-test-runs/README.md](operations/riala-test-runs/README.md) |
| 全体監査 | [docs/whole-work-os-audit.md](docs/whole-work-os-audit.md) |

## 管理方針

- コード、仕様、運用ルール、残課題、検証結果はこのGitリポジトリを正本にする。
- 作業用チェックアウトは Google Drive の `WorkOS/02_プロジェクト/workspace/ai-work-os` を使う。
- GitHubの `main` は共有可能な最新状態。変更は小さなコミットで理由が分かるように残す。
- APIキー、Cookie、OAuthトークン、`.env*`、ブラウザログイン状態、会員の不要な個人情報はGitへ入れない。
- Gitにない実行結果を「完了」と扱わない。外部送信や公開は、外部側の読み戻し根拠も必要。

## 開発と確認

```text
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

開発プレビューは `ai-work-os` の構成（ポート4620）を使います。環境変数の名前と設定方法は文書化しますが、値は各PCまたはVercelの安全な設定へ置きます。
