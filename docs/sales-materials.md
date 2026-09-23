# 営業資料の入口・保存先

2026-09-24：営業代行エリアと営業Masterに共通の資料カードを追加。
リンク定義は `lib/salesResources.ts`、表示は `components/SalesResources.tsx`。

## 正本

- 資料：[WorkOS/03_営業代行](https://drive.google.com/drive/folders/1Nbbv_zOmk0bl-gWo5xrXrPR3z-9Tec0f)
- Word・PDF：[⑦杉山さん商談実戦カンペ_完成版](https://drive.google.com/drive/folders/1EHM-FMSBl6JcWJgGSdIh7R4mXxgM-kZP)
- PDFは2026-09-23保存版。アプリの杉山版修正版・クラウド編集内容とは別。自動同期を装わない。
- Driveの共有状態は変更しない。PDF本体をpublicへ置かない。
- 各環境からHTTPSの同一Driveファイルを開く。アクセスには権限のあるGoogleアカウントが必要。

## 更新

1. DriveのWordを編集。
2. 内容照合後PDFを更新。Drive上の既存ファイルの版を更新しIDを維持する。
3. IDを変更した場合のみリンク定義と営業資料READMEを更新。
4. アプリ内台本にも反映する場合は、別作業として差分を確認する。

## 公開・検証状況

実装はGoogle Drive内のアプリ編集元に保存。2026-09-24に本番公開済み。
本番元のコミット `766f1754331d4fe23336106865385ce209ccd0fe` に今回の4つのコードファイルのみを加え、一時実行環境から公開した。正本はGoogle Drive上に保持。

- [営業代行](https://kotorinu-s-projects.vercel.app/area/sales)
- [営業Master](https://kotorinu-s-projects.vercel.app/sales-master)
- デプロイ：`dpl_BM4bk36SPSG4DfQE9P6zfpnM4pFG`（Production / READY）
- Next.js本番ビルド成功、型チェック成功、変更ファイルのESLint成功。
- 上記2画面でHTTP 200とPDF・Word・フォルダのリンクを確認。
- RIALA画面に営業資料が出ないこと、既存sales-script画面のHTTP 200を確認。
- Google Driveから更新後のREADMEを再取得し、同期済み本文を確認。
別PC実機の動作確認は未実施。
既存の杉山さん台本・API・テストの未コミット変更はこの作業の対象外。
