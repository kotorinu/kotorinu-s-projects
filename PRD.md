# AI Work OS v1 — Product Requirements

## 0. このプロダクトの目的

自分専用のAI Work OSを作る。

目的は、
「人生の目標から今日の行動までをつなぎ、
タスクを見失わず、
HumanとAIが役割分担して実行できる状態を作ること」

このアプリ自体で収益化する予定はないため、
初期・運用コストは極力かけない。

### 最重要ルール
- 追加固定費は実質ほぼ0円を目標にする
- スマホファースト
- 機能を増やしすぎない
- TODAY / TASK MAP / GOAL TREE の3画面を中心にする
- Google Calendarは実行時間の管理
- AI Work OSは目標・タスク・期限・履歴のSource of Truth
- ChatGPT / Claude Code / Gemini等に依存しない
- 将来AIを交換・追加できる構造にする

---

# 1. 全体アーキテクチャ

        ChatGPT
           │
        Claude Code
           │
        Gemini等
           │
           ▼
      API / MCP Layer
           │
           ▼
      AI Work OS DB
       /     |     \
      /      |      \
   PWA    Calendar   AI Worker

重要：
ChatGPTやClaude Code自体を本体にしない。
本体はAI Work OSの中央DB。

どのAIから操作しても、
同じGoal / Task / Calendar / AI Runデータを見る。

---

# 2. 初期技術構成

Frontend:
- Next.js
- PWA
- スマホ最適化

Backend / DB:
- Supabase無料枠を第一候補
- 無料枠で十分な範囲に抑える

Calendar:
- Google Calendar API

AI:
- 初期はClaude Code中心
- ChatGPT連携は後から
- Gemini等も後から追加可能にする

MCP:
- 初期必須ではない
- APIだけでも動く構造にする
- MCPは必要になったら追加
- 常時有料サーバー前提にしない

---

# 3. 画面構成

画面は原則3つ。

1. TODAY
2. TASK MAP
3. GOAL TREE

追加画面は本当に必要な場合のみ。

---

# 4. TODAY

目的：
「今日何をやるか」だけを見る。

最重要画面。

### 表示内容

- 今日の日付
- 今日やるタスク
- 期限超過件数
- 2日以内の期限タスク
- 下部ナビゲーション

### 表示イメージ

```
┌──────────────────────┐
│ ☀ TODAY        9/5   │
├──────────────────────┤
│ 今日やる             │
│                      │
│ □ 研修動画①②を見る  │
│   営業代行｜60分     │
│   期限 9/8           │
│                      │
│ □ ○○を実施           │
│   GENESIS｜20分      │
├──────────────────────┤
│ ⚠ 期限超過 0         │
│ ▸ 2日以内 2件        │
├──────────────────────┤
│ TODAY | TASKS | GOALS│
└──────────────────────┘
```

### 2日以内

初期仕様では「2日以内」まで。

5日以内は表示しない。

理由：
未来の情報を見せすぎると、
今日の集中を邪魔するため。

2日以内部分は折りたたみ式。

押すとタスク一覧を展開。

---

# 5. TASK MAP

目的：
「全部ちゃんと管理されているか」を確認する。

### 月切り替え

画面上部に月セレクタを置く。

例：

◀  2026年9月 ▼  ▶

または

9月 ▼

10月を選択したら、
10月のタスクだけ表示。

### 月単位で表示する情報

- 全タスク
- 完了
- 進行中
- 未着手
- AI担当
- 期限超過
- 7日以内

例：

全23
完了6
進行5
未着手10
AI担当2

期限超過0
7日以内7

### タスク一覧

表示項目：

- タスク名
- タグ
- 期限
- 重要度
- 緊急度
- 担当
- 状態

タスク名にカテゴリ名を含めない。

NG:
営業代行｜研修動画を見る

OK:
研修動画①②を視聴し、重要点を記録する

Areaはタグで表示。

### フィルター

- 全部
- 未着手
- 進行中
- AI担当
- 営業代行
- RIALA
- GENESIS
- その他

### 並び替え

- 期限順
- 重要度
- 緊急度

初期表示は期限順。

---

# 6. TASK MAP最下部

その月の
「月末にどういう状態になっていたいか」
を表示する。

例：

🎯 9月末の状態

営業代行
- 営業開始に必要な理解と準備が完了している

RIALA
- 定型運営業務のAI移管範囲が整理されている

GENESIS
- 期限付き課題を継続している

10月を選んだら、
10月末の状態に切り替える。

これはタスク一覧とは別だが、
同じ月に紐づけて表示する。

---

# 7. GOAL TREE

目的：
「何のためにやっているか」を確認する。

普段は見ない。

構造：

人生の目的・価値観
↓
5年後
↓
3年後
↓
1年後
↓
3か月後
↓
1か月後
↓
今週
↓
必要な成果
↓
具体タスク

各Goalには：

- Desired State
- Achievement Criteria
- Target Date
- Parent Goal

を持つ。

達成基準は必須。

タスクから上位Goalへ遡れること。

---

# 8. Taskデータ構造

TASKS

- id
- title
- area
- deadline
- work_date
- estimate_minutes
- importance
- urgency
- owner
- ai_mode
- status
- definition_of_done
- goal_id
- source
- created_at
- updated_at

### owner

- Human
- AI
- Hybrid

### ai_mode

- Execute
- Draft
- Assist
- Decision

### status

- 未着手
- 進行中
- 待ち
- 完了
- Archive

---

# 9. Goalデータ構造

GOALS

- id
- parent_id
- title
- target_date
- desired_state
- achievement_criteria
- status
- created_at
- updated_at

過去Goalは消さない。

Target Dateを過ぎても上書きしない。

達成状況を保存してArchiveする。

---

# 10. Calendar

Google Calendarは
「いつ実行するか」
のために使う。

TASK MAP:
何を / いつまでに

Google Calendar:
いつ作業するか

### ルール

- 前日の時点で翌日の作業予定を基本確定
- 朝に予定を考えない
- 1日1〜2時間の予備時間を必ず残す
- カレンダーを100%埋めない
- DeadlineとWork Dateを分ける
- Deadline超過タスクは消さない
- 完了または明示的な再設定まで残す

---

# 11. AI担当

AIと表示するだけで終わらせない。

owner = AI のタスクは、
可能なら作成直後に実行開始。

Flow:

Task created
↓
owner = AI ?
↓
YES
↓
ai_mode確認
↓
実行可能？
├ Execute → 自動実行
├ Draft → 下書き作成
├ Assist → 人間作業を補助
└ Decision → 案だけ出して人間判断

外部権限が必要な場合や、
情報不足の場合はBlockedにする。

AI Status:

- 未着手
- 実行中
- 人間確認待ち
- 完了
- Blocked

---

# 12. AI自動実行

初期は過剰実装しない。

まずは以下だけ。

- AI担当タスクを検知
- 実行可能なら実行
- Output保存
- 人間確認が必要なら待機
- 状態更新

定期実行・複雑なAgent処理は
Phase 2以降。

---

# 13. 自然言語からタスク登録

将来的にChatGPT / Claude Code / Geminiなどから、

「9/8までに研修動画3本見るの追加して」

と言ったら、

AIが以下へ変換：

- title
- area
- deadline
- estimate
- importance
- urgency
- owner
- definition_of_done
- goal_id

そして中央DBへ登録。

重要：
AI別に別データベースを作らない。

---

# 14. アプリ内のタスク追加について

PWA内から手動追加しても、
必ず中央DBへ保存する。

ローカル保存だけは禁止。

つまり、
アプリから追加しても
AI Work OSに登録されたことになる。

---

# 15. アプリ内AIチャット

初期バージョンでは作らない。

「AIに相談」ボタンも不要。

理由：
- ChatGPTやClaudeをそのまま使えばいい
- APIコストを増やしたくない
- UIを複雑化させない

---

# 16. 全タスクの意味

「全量タスク」という曖昧な表現はUIでは使わない。

表示名は：

「全タスク」

TASK MAPに登録された全タスクを意味する。

Areaフィルターを押せば、
RIALAだけ、
営業代行だけ、
GENESISだけ、
など全部確認できる。

洗い出したタスクは必ず見えること。

---

# 17. コスト方針

最重要。

### 目標

追加固定費：
実質ほぼ0円

### 優先

- Supabase無料枠
- Vercel無料枠
- Google Calendar API
- GitHub
- 既存契約のChatGPT
- 既存契約のClaude Code
- Gemini等の無料枠

### 避ける

- 最初から常時稼働の高額サーバー
- 不要なAI API大量実行
- 不要な有料DB
- 不要なネイティブアプリ
- AIチャットの再実装
- 初期段階での複雑なMCP構成

---

# 18. AI非依存設計

ChatGPT
Claude
Gemini
今後のAI

どれでも使える構造にする。

Core LogicはAIサービスから分離。

例：

```
interface AIProvider {
  executeTask()
  parseTask()
  analyze()
}
```

将来Provider追加で対応できる構造にする。

---

# 19. 開発フェーズ

## Phase 1
スマホUI

- TODAY
- TASK MAP
- GOAL TREE

ダミーデータで実装。

最優先：
実際にスマホで触る。

UIの正しさを確認する。

---

## Phase 2
DB接続

Supabase

- Task CRUD
- Goal CRUD
- 月切り替え
- ステータス集計
- フィルター
- Deadline管理

---

## Phase 3
Google Calendar

- Calendar読み取り
- Work Date配置
- タスクの時間ブロック化
- 1〜2時間のBuffer維持

---

## Phase 4
AI Worker

- AI担当タスク検知
- 自動実行
- Output保存
- Human Review

---

## Phase 5
外部AI連携

- Claude Code
- ChatGPT
- Gemini
- MCP / API

必要性とコストを見て追加。

---

# 20. 絶対に守るUX原則

1.
スマホファースト。

2.
今日やることを最優先。

3.
未来の情報を見せすぎない。
TODAYは2日以内まで。

4.
TASK MAPでは月全体を確認できる。

5.
月を切り替えたら、
その月のタスクと月末状態が切り替わる。

6.
タスクは期限を過ぎても消さない。

7.
タスク名は具体的行動を書く。

8.
カテゴリはタグ。

9.
AI担当は可能なら実際にAIが実行。

10.
アプリ内に不要なAIチャットを作らない。

11.
機能を追加する前に、
TODAY / TASK MAP / GOAL TREE
のどこに必要か説明できること。

12.
説明できない機能は原則追加しない。

13.
コストを増やす実装は、
無料・低コスト代替を先に検討する。

---

# 21. Phase 1で最初に作ってほしいもの

まずコードを書く前に、

1. Mobile 390px想定の3画面
2. ダミーデータ
3. Bottom Navigation
4. TASK MAP月切り替え
5. 2日以内折りたたみ
6. 月末状態表示

を実装。

完成後、
READMEに起動方法を書く。

機能追加はまだしない。

まずスマホで触って、
「毎日これを見るか」を確認する。

---

# 22. Data Integrity Rule（2026-09-05追加・恒久ルール）

実データ運用へ移行して以降、必ず守ること。

NEVER invent:
- user goals
- task titles
- deadlines
- KPIs
- training dates
- project requirements

不明な期限・数値・課題名・目標は勝手に作らない。
不明な値は null / TBD / PROVISIONAL のまま扱う。

Dummy/fixture data must never appear in production once real-data
operation begins for that Area.

Fixtureを実データに置き換えるときは、
古いFixtureを追記の上に残さず、DELETEしてから実データを入れる。
併存させない。

実データがまだ投入されていないAreaやMonthは、
「準備中」のような偽の説明文を表示せず、
空状態（未設定であることが分かる表示）のままにする。

現状（2026-09-05時点）：
- GENESIS：60日チャレンジOutcome・Recurring Rule 3件は実データ
- 営業代行：Sales Master（17フェーズ）＋実行Task8件は実データ。
  ただし①基礎（PDFワークシートの実内容）は本人未提供のため空
- RIALA：Operations Master（7カテゴリ）・Workflow・AI Operation Matrix
  （candidate）・Current Audit（ほぼUNKNOWN）は実データ。
  Actual TaskはACTIVEと確認できた1件のみ
- GOAL TREE：実データ投入前のため空

---

# 23. Permanent Data Rule（2026-09-05追加・恒久ルール）

Master ≠ Workflow ≠ Actual Task。

Templateは、具体的な対象（実在するイベント・メンバー・問い合わせ等）と
実行の必要性が確認できない限り、Actual TaskとしてTASK MAPへ出さない。

Never invent：
- goals
- tasks
- deadlines
- events
- people
- URLs
- completion state

不明な場合は UNKNOWN / BLOCKED / PROVISIONAL のまま保持する。

「過去にやっていた記録がある」だけで DONE にしない。
現在の完了条件を満たした根拠が必要。
逆に、記録があるからといって ACTIVE にもしない
（現在の対象・必要性が確認できて初めてACTIVE）。
