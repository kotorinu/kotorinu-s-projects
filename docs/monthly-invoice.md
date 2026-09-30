# 月次請求書PDF

毎月の業務委託料の請求書を、文字として読み取れるPDF（画像埋め込みではない）で作る。

## 作り方

```text
pip install reportlab
cp scripts/invoice/profile.example.json invoices/profile.local.json   # 初回のみ。値を入れる
python scripts/invoice/generate_invoice.py --month 2026-09
```

- 出力: `invoices/out/{YYYYMM}_請求書_{発行者名}.pdf`（例: `202609_請求書_緒方琴音.pdf`）
- 月ごとに変わるのは 請求書番号（`YYYYMM-OGATA`）、請求日（その月の末日）、品目の「◯月分」だけ。金額・住所・口座はプロファイルの値のまま。
- `--month` を省略すると実行日の月。

## 個人情報の扱い

- 住所・口座・宛先はGitに入れない。`invoices/` は `.gitignore` 済みで、プロファイルと生成PDFはここに置く。
- リポジトリにはスクリプトと伏せ字の `scripts/invoice/profile.example.json` だけを置く。

## 定期実行

- Claude Code のルーティンで毎月26日 8:50（日本時間）に当月分を作成し、PDFをセッションで渡す。
- 作成のみ。送付先へのメール送信は行わない（送信は本人が確認して行う）。
- 2026-06分を再生成し、元のPDFと画面上で一致することを確認済み。
