# 営業スクリプトのGit同期

## 正本

営業台本の正本は、専用のPrivate GitHubリポジトリ `kotorinu/workos-sales-scripts` です。Work OSの公開リポジトリへ本文を置きません。

- `sugiyama.md`：杉山さんロープレ版
- `mogi.md`：茂木さん実商談TTP版
- `nagashima-reference.md`：長嶋さん動画2本から個人情報を除いて再構成した参考版

アプリの自動保存はRedis上の作業中下書きです。「保存」を押した時に、同じ本文をGitHubの `main` へコミットします。GitHub更新の成否とコミットSHAをAPI応答へ含めます。GitHub同期が未設定・失敗の場合、Redisの下書きは保持しますがGit同期済みとは扱いません。

## 本番設定

VercelのProduction環境に次をSensitive値として設定します。

- `GITHUB_SCRIPT_TOKEN`：このリポジトリのContentsを更新できる最小権限トークン
- `GITHUB_SCRIPT_REPOSITORY`：Privateリポジトリ `kotorinu/workos-sales-scripts`（必須）
- `GITHUB_SCRIPT_BRANCH`：既定値 `main`

トークンはGit、Drive、ブラウザ、ログへ保存しません。Fine-grained tokenまたはGitHub Appを使用し、対象リポジトリのContents write以外を付けません。

## 完了確認

1. アプリで本文を編集し「保存」を押す。
2. 応答が `git.status=SYNCED` であることを確認する。
3. 返されたコミットSHAをGitHubで確認する。
4. `scripts/<edition>.md` の本文を再取得し、保存本文のSHA-256と一致することを確認する。
5. Vercel再デプロイ後も同じ本文が読めることを確認する。

GitHubとRedisを一つのトランザクションにはできません。GitHub失敗時にはRedis下書きが残るため、再度「保存」を実行して同期します。競合時は自動上書きせず、Git差分を確認します。
