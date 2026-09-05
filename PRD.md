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

---

# 24. Calendar Source of Truth Rule（2026-09-05追加・恒久ルール）

Google Calendarを一律に「古い可能性あり」と扱わない。
予定の種類によって扱いを分ける。

### PRIORITY 1: USER_CONFIRMED

ユーザーが明示的に「これは決まっている」「これは確定」と言った情報。
最優先。

### PRIORITY 2: FIXED_ALL_DAY_EVENT

Google Calendarの終日予定は、原則として固定予定／制約として扱う。

例：
- 2026-10-03〜10-04 GENESIS合宿
- 2026-10-05〜10-08 北海道旅行
- 書籍の読了対象／締切として登録された終日予定

ただし、明らかにメモ・仮置きと書かれている場合は除く。

### PRIORITY 3: CONFIRMED_WEEKLY_READING

60日チャレンジで読む本は、Google Calendarに登録されているものをCONFIRMEDとして扱う。
CALENDAR_ONLY / NEEDS_CONFIRMATIONにはしない。

ユーザー確認済みルール：「本に関しては確定でいい」

Calendar上で確認できる例：仕事の教科書／THE FORMAT／地頭力を鍛える／鬼速PDCA など。

タイトル・読了予定日をWeeklyReadingへ正式に取り込んでよい。

### PRIORITY 4: TIMED_EXECUTION_BLOCK

通常の時間指定予定。

例：19:45〜21:45 営業準備／04:45〜06:45 朝ルーティン／読書実行ブロック／RIALA作業時間

これらは「現在の実行計画」として参照するが、固定事実とは扱わない。
ユーザーの予定変更により随時動く可能性がある。

つまり：Task / Goalの根拠ではなく、Execution Plan / Work Dateとして扱う。

## 固定予定によるPlanning Constraint

固定終日予定はTaskではなくAvailability Constraintとしても扱う。

**2026-10-03〜10-04 GENESIS合宿**
- type: MILESTONE
- planningConstraint: BLOCK_NORMAL_WORK

**2026-10-05〜10-08 北海道旅行**
- type: TRAVEL
- planningConstraint: NO_HEAVY_WORK

この期間に、通常と同じ量の営業準備／RIALA／GENESIS追加作業／読書大量消化／AI Work OS開発を自動配置しない。
ただし、ユーザーが明示的に実施すると決めたものは除く。

特に、10/3〜10/4合宿→10/5〜10/8旅行と連続するため、
GENESIS合宿準備の実質的な完成期限は10/3当日ではなく、原則10/2までに完成状態へ持っていく。
10/3朝に大量の準備Taskを残さない。

## Weekly Reading Rule

60日チャレンジ：毎週1冊読む。本は事前に決まっている。
Google Calendarに登録された書籍予定はCONFIRMED。

WeeklyReadingには以下を持つ：
bookTitle / targetDate / calendarEventIds[] / status / learningPoints[] / personalExamples[] / actionItems[]

本に複数の時間指定読書ブロックが存在する場合：
Weekly Reading Task ↓ Calendar Execution Blocks として紐づける。

時間ブロックが移動しても「今週この本を読む」というWeekly Task自体は消えない。

## 合宿直後の旅行を逆算へ反映

10/3〜10/4 GENESIS合宿、10/5〜10/8 北海道旅行のため、10月第1週を通常稼働週として扱わない。

9月最終週までに以下を蓄積：
- 60日チャレンジEvidence整理
- 合宿で話せるBefore / After
- 未達・改善点整理
- 読書から行動化した事例
- 具体⇄抽象の変化
- 問題解決の変化
- 期限遵守／逆算管理の変化

Phaseとして扱う：
- 10/1〜10/2：FINALIZE期間
- 10/3〜10/4：OUTPUT / CAMP
- 10/5〜10/8：TRAVEL

## 固定された個別予定

以下はGoogle Calendar上で確認済みのため、CONFIRMED_FIXED_EVENTとして扱う。

**2026-09-22 11:00〜15:00「ポンテイデア 佐々木みなみさんのタロット」**
- type: FIXED_APPOINTMENT
- planningConstraint: BLOCK_TIME

この4時間には他のTaskを自動配置しない。
ユーザーが別途変更した場合のみ更新する。

## 表示方針（2026-09-05修正）

TASK MAPは「今月の前進」（月次Outcome／Task Progress／Outcome Achievement／
Task Coverage／GENESIS進捗／Weekly Reading／営業代行／RIALA）を最優先表示する。
固定予定（FixedCalendarEvent）はTASK MAPのメイン情報ではない。

- 普通の固定予定（個人の予約等）→ TASK MAPには原則出さない
- 旅行・合宿などGoal/Outcomeに直接影響する重要イベント →
  Planning Constraintとしてデータは保持しつつ、該当Outcome/Goal Tree側で
  文脈付き表示する（TASK MAPには出さない）
- 時間指定の通常Calendar予定（実行計画）→ TASK MAPには出さず、
  TODAYやスケジュール画面側で参照する

TASK MAPでは、その月の固定予定は最下部に「◯月の固定予定 N件」という
折りたたみ表示としてのみ置いてよい（デフォルト閉、件数のみ表示）。

「TASK MAPから見えなくする」ことと「データを削除する」ことは別。
Master / Workflow / Template / Calendar Constraint / Historical Record は、
表示から外れても実データとして保持し続ける。

---

# 25. Execution OS — Goal → Decompose → Execute → Measure → Improve（2026-09-05追加・恒久ルール）

このOSの基本ループ：

```
GOAL（目標）
↓
DECOMPOSE（分解）
↓
EXECUTE（実行）
↓
MEASURE（計測）
↓
IMPROVE（改善）
```

Task管理は「やった／やっていない」だけでは足りない。
何を達成するか→何に分解するか→何分でやる予定か→何分かかったか→
なぜ差が出たか→次回どう変えるか、まで扱える構造にする
（Task.estimateMinutes/actualMinutes/varianceMinutes/variancePercent/
varianceReason/nextEstimateMinutes/nextImprovement）。

## Decompose：分解品質

人間が実行時に考えなくてよい粒度までTask/Subtaskを分解する。

悪い例：「ロープレする」
良い例：前日（台本を開ける状態にする／録音準備／顧客設定を決める）→
当日（台本確認／ロープレ／録音確認／詰まりを記録／改善点を決める）

## Preparation Task

「実行前準備」を正式概念にする。Preparationは通常のTaskと同じ型を使い、
`preparationForTaskId`で実行Taskに紐付ける（別の親エンティティは作らない）。

fields: `preparationForTaskId` / `recommendedTiming`
（PREVIOUS_NIGHT/EARLY_MORNING/BEFORE_LEAVING/BEFORE_MEETING/
START_OF_TASK/DURING_COMMUTE/ANYTIME） / `contextTags`

Context/Timingタグは実行時に迷わないために必要なものだけ。
大量にタグを作って管理負荷を増やさない。

## Manager Mode / Executor Mode

ユーザーの中の「経営者」と「実行者」をOS上でも分ける。

**Manager Mode**（原則、前日の夜）：翌日の実行者が考えなくても動ける状態を
作る。明日の成功状態／TOP Goal／必要Task／Subtask／Preparation／
やらないこと／Estimate／実行順／Calendar時間／Buffer／完了条件を確定する。
Definition of Done：翌朝TODAYを開けば「何を・何時に・どこまで」やるか
決まっている。

**Executor Mode**（翌朝〜実行中）：優先順位を考え直さない。TODAYに並んだ
Next Actionを上から実行する。新しい事情が発生した場合のみReplanを起動。

Night Planningの確定出力は`DayPlan`型（date/successState/topGoalId/
taskIds/doNotList/estimateTotalMinutes/bufferMinutes/status/
confirmedAt）。**Phase 1では型のみ定義**——実際にManager Modeを毎晩回す
UI（TOMORROW PLAN画面）はまだ実装していない。実データのないまま
Weekly Review的な集計画面を先に作ると、0件の実績を「実績のように」
見せてしまうため、UIより先にスキーマだけを固めた。

## TODAY = Executor画面

TODAYの目的は「考えること」ではなく「実行すること」。

表示優先順位：NOW → NEXT → LATER TODAY。各Taskには最低限、
何をする／何分／完了条件（1件目のみ表示）／必要な準備件数／Context Tagだけを
見せる。Goalや長い理由は詳細を開いたときに確認（TaskDetailSheet）。
朝に大量なTask整理をさせない。完了済みは折りたたんで下部に格納する。

（2026-09-05実装：`app/today/page.tsx`がNOW/NEXT/LATER TODAY構成へ変更済み）

## 計測（Estimate vs Actual）

完了時にEstimate/Actualの差分（varianceMinutes/variancePercent）を記録する。
大幅超過時だけ理由を`varianceReason`（UNDER_DECOMPOSED/MISSING_INFO/
LOST_FOCUS/UNEXPECTED_WORK/TECHNICAL_ISSUE/ESTIMATE_MISS/SCOPE_ADDED）
から選ばせる。毎回長文入力を求めない。

同種Taskの履歴が溜まったら次回Estimateを`nextEstimateMinutes`としてAIが
提案できる構造にする（将来のpersistent DB移行を想定したSchema）。
**Phase 1では実績が1件も無いため、この値は常にnullのまま**。
架空の実績・架空の次回見積もりを入れない。

## AI Executor

Taskごとの`aiCapability`（HUMAN/AI_EXECUTE/AI_DRAFT/HYBRID/DECISION/
BLOCKED、既存）で「実行者」をAIへ移す。原則：AIができる処理はAIが実行、
AIができない人間作業はAIがPreparationまで終わらせ、人間は最後の実行だけを行う。
例：RIALAの情報整理／文章作成／分類／QAはAI、最終承認・必要な送信はHuman。
営業の台本整理／FB統合／想定顧客作成／改善候補はAI、声を出すロープレ・
実商談はHuman。

## Help Need Workflow

人へ相談する前の事前準備を`ConsultationPrep`として型定義する
（purpose/currentSituation/whatIKnow/whatIDontKnow/hypothesis/concern/
helpType/desiredAnswer/recipient/bestTiming/bestChannel）。
helpType: INFORMATION/ADVICE/DECISION/REVIEW/EXECUTION_HELP/SHARING_ONLY。

「Slackで相談する」だけのTaskは禁止。何を・なぜ・誰に・何を答えてほしいか
まで具体化する。**Phase 1では型のみ、実インスタンス・UIは未実装**。

## Yes But / Help Need行動原則

「まずやります」→必要なら条件・Helpを明確にする、という行動原則を
Practice Principleとして保持する。これは自動承諾機能ではなく行動原則／
Review項目。安全・法務・金銭・契約など即答が不適切なものまで自動YESには
しない。

例：「営業をやってみる」→YES。ただし「現時点では経験が不足しているため、
最初の2〜3回同行してほしい」のようにHelp Needを具体化する。

## Speed Practice / Weekly Review

Weekly Reviewで確認する項目（`SpeedPracticeCheck`、本人確認済みの7項目のみ）：
目標を立てたか／分解したか／時間を測ったか／事前準備したか／
実行時に迷わなかったか／すぐ着手したか／Help Needを明確にしたか。

本で読んだ「3つのすぐ」は正確な3項目が確認できていないため、
名称・定義を勝手に補完しない。現在確認できている7項目のみ保持する。

Weekly Reviewの集計（`WeeklyReview`型：Task完了数／Estimate・Actual合計／
平均超過率／大きく超過したTask／分解不足Task／Preparation不足Task／
改善後に速くなったTask／Help Need活用／来週改善1〜3件）は、
**実際に完了しactualMinutesが記録されたTaskが無い限り生成しない**。
数字が存在しないものは推測しない——0件の実績から「平均超過率0%」のような
見かけ上の数字を作らない。

## Goal Tree（2026-09-05復元）

2026-09-05のFixture削除（commit 8b41a7e）でgoals/tasks/monthEndStatesが
空になって以降、Goal Treeは長らく空のままだった。これは「意図的な空状態」
ではなく「本来存在すべき確定データがまだ投入されていない」状態だったため、
本人確認済みの内容のみで再構築した：

- Life Philosophy → Work Philosophy → 長期方向（Direction）の直列チェーン
- Direction配下に GENESIS 60日チャレンジ／営業代行／RIALA の3分岐
- GENESIS 60日チャレンジ配下に GENESIS合宿（10/3〜10/4）Milestone

5年／3年／1年／3か月／1か月の各階層は本人確認済みの具体的内容がまだ
無いため、ノードを作らずUNKNOWNのまま扱う（削除された旧Fixture Goalの
内容をそのまま復元することは禁止）。

Goal TreeのUIは単一チェーン前提だったため、Direction配下の3分岐が
描画から欠落する実装バグがあった。2026-09-05に親子マップを
`Map<parentId, Goal[]>`へ一般化し、複数子を持つツリーとして描画するよう
修正済み。

---

# 26. Work Principles / 仕事の型 — Knowledge Layer（2026-09-05追加・恒久ルール）

TaskでもCalendar Eventでもない第3のデータ種別。
「ユーザーが覚えて毎回意識する」のではなく、
Taskの種類（`workContext`）に応じてAIが必要なPrincipleを自動参照する。

## 本人確認済みPrinciple（6件、`WorkPrinciple`型）

- **PURPOSE FIRST**：コミュニケーション開始時に目的を明示する。
  purposeType＝CONSULTATION/SHARING/DECISION/CONFIRMATION/REQUEST。
  必要に応じて所要時間も先に伝える
- **CONCLUSION FIRST**：文章・見出しでは何を伝える／してほしいかを先に置く
- **SHORT SENTENCE**：1文40文字以内、できれば20文字以内。
  一般的な絶対ルールではなく、本人が今回採用する仕事上の文章基準
- **FACT / INTERPRETATION**：事実と解釈を混ぜない。FACT→INTERPRETATION
  の順で整理する。InterpretationにはGOOD/BAD/NOT_CLEARを付けられる。
  AIはFACTとINTERPRETATIONを勝手に混同しない
- **HUMAN INTERPRETATION**：AIによる事実整理だけで完了させない。
  重要な判断では「本人はどう解釈するか」「なぜそう解釈するか」を
  残せる構造にする。本人の解釈をAIが勝手に捏造しない
- **QUALITY BAR**：可能であれば事前に水準（MINIMUM/BEST/BEST_EVER）を
  確認する。1年／3年／5〜10年という期間との厳密な対応関係は本の内容を
  完全に確認できていないため固定仕様化しない

## Taskとの連携（`workContext`→Principle自動参照）

Work Principleをすべてのタスクに毎回表示しない。`Task.workContext`が
設定されている時だけ、対応するPrincipleをTaskDetailSheetの
「今回使う仕事の型」セクションに小さく表示する。

確定済みマッピング：

| workContext | 参照するPrinciple |
|---|---|
| Slack相談 | PURPOSE FIRST / FACT・INTERPRETATION / Help Need / SHORT SENTENCE |
| RIALA告知文 | PURPOSE FIRST / CONCLUSION FIRST / SHORT SENTENCE |
| 営業FB相談 | PURPOSE FIRST / FACT・INTERPRETATION / Help Need |
| 振り返り | FACT・INTERPRETATION（GOOD/BAD/NOT_CLEAR） |
| 重要成果物 | QUALITY BAR |

Help Needは新しいPrincipleではなく、既存のHelp Need Workflow
（`ConsultationPrep`、PRD.md §25）への参照。

**2026-09-05時点：既存の実Task（営業8件・RIALA1件）にはworkContextを
一切設定していない**。どのタスクがどのcontextに該当するかは本人の判断が
必要なため、勝手に分類しない。

## UI方針

大きな新ページは作らない。Knowledge Layer自体は`workPrinciples`配列
（`lib/dummy-data.ts`）に保持し、TaskDetailSheet内でTask.workContextに
応じて必要な分だけ参照する設計に留める。Goal Tree / Sales Master / RIALA
/ GENESIS / TODAY / TASK MAPの既存実装は変更しない。

---

# 27. TODAYをメイン実行画面へ（2026-09-05追加・恒久ルール）

## 画面の役割分担

- **TODAY**：今日を実行する画面（通常利用の中心、HOME）
- **TASK MAP**：Taskを管理・俯瞰する画面
- **GOAL TREE**：なぜやるかを確認する画面

アプリ起動時のファーストビューはTODAY（`app/page.tsx`は`/today`へ
redirect、BottomNavも先頭がTODAY——これは2026-09-05以前から実装済みで、
今回変更していない。恒久ルールとして明文化する）。

## Task ≠ Time Block

Task＝何を完成させるか。TimeBlock＝いつ実行するか。1つのTaskを複数の
TimeBlockに分けてよい。TimeBlockが動いてもTaskの完了基準は変わらない。

```
TimeBlock
- id
- taskId
- date (YYYY-MM-DD)
- startTime / endTime (HH:mm)
- status: PLANNED/IN_PROGRESS/DONE/SKIPPED
- calendarEventId (nullable)
- source: AI_WORK_OS / GOOGLE_CALENDAR / USER
```

将来Google Calendarと同期できるSchemaにする（`calendarEventId`）。
**2026-09-05時点：`timeBlocks`は空配列**。実際のスケジュールがまだ
確定していないため、架空のTime Blockは作らない。

## TODAYのTimeline化

今日のTimeBlock（Task紐付き）と今日の時間指定Fixed Calendar Eventを
時刻順にマージし、現在時刻を基準にPAST/NOW/NEXT/LATERを判定して表示する
（`lib/timeline.ts`の`buildTimeline`）。

- NOW：Task名・残り時間・完了条件（1件目）・準備件数・Context Tag・
  AI Capabilityを表示。情報過多にしないため、完了条件は全件でなく1件目＋
  件数のみ
- NEXT：現在Taskの直後に行うものを明確にする
- PAST：薄く表示（完了/未完了に関わらず時間が過ぎたことが分かる程度）

TimeBlockが無いTaskは「時間未定」として別枠にフラットに並べる。時間が
無いTaskに対して勝手にNOW/NEXTを割り当てない（時間の裏付けがない優先度
表示は誤解を招くため）。

## 固定予定（Fixed Calendar Event）の扱い

固定予定はTaskとして扱わない。Timeline上では時間指定のものだけ「予定」
ブロックとして表示し（チェックボックス無し、タップ不可）、終日予定は
Timelineの上に「本日終日：◯◯」という一行としてのみ表示する。
**Task Progress（今日の前進の完了/全体）には含めない**——元々Task
Progressの分母はTaskのみで計算されており、この点は今回の変更前から
正しかったため、実装変更はしていない。

## Google Calendarの位置づけ

Google Calendarは削除しない。将来的な役割は、外部予定・固定予定・
Meeting・Travel・Calendar Constraintを取得するSourceとして使う。
AI Work OSのTODAYを日常的に見るメイン画面とする。

Google Calendar API連携はまだ無い。今回、疑似同期・自動インポートは
作らない。Schema（TimeBlock.calendarEventId、FixedCalendarEvent）だけ
将来対応可能にしてある。

## Manager → Executorの時間軸

前夜（Manager Mode）：Task分解 → Estimate → Preparation → Time Block配置
翌朝（Executor Mode／TODAY Timeline）：NOW → NEXT → 実行

Manager Modeの夜間プランニングUI自体はPhase1でまだ実装しない（PRD.md
§25参照、`DayPlan`型のみ）。今回はTODAY側（実行時の受け皿）だけを
Timeline化した。

## 今回やらなかったこと（意図的）

- Google Calendar双方向同期
- 自動スケジューリングエンジン（TimeBlockを自動生成する機能）
- 大規模Manager Mode UI（夜間プランニング画面）
- 架空Time Block・架空の今日Taskの作成

実データ（TimeBlock・今日のTask）が無い場合はTODAYに正直なEmpty State
を表示する。

---

# 28. 実運用開始ラウンド — 実データ投入 + Countdown + Filter整理（2026-09-05追加・恒久ルール）

## Calendar Event → Task / TimeBlock変換ルール

Calendar Event ≠ 必ずTask。

- 明確な成果物・DoDがあるCalendar Event → Task + TimeBlock
- 純粋な休憩・生活・固定予定（昼食・夕食・入浴等）→ TimeBlockのみ
  （`taskId`/`recurringRuleId`ともnull、`label`で表示）
- Recurring Practice → 既存RecurringRuleにTimeBlockを紐付ける
  （新規Taskを重複作成しない）

「朝・4つの力」のように複数の異なる活動が1つのCalendar Blockへ
束ねられている場合、無理に既存RecurringRule 1件へ押し込めるより、
不確かならunlinkedなplain TimeBlockのまま保持し、本人に確認する。

## 過去時間帯の完了を捏造しない

現在時刻より前のTimeBlock/Taskだからといって自動的にDONE/checkedにしない。
未確認の過去TimeBlockはTimeline上で「・未確認」と表示し、ユーザーが
チェックボックスで確認するまでは未完了のまま扱う。

## TimeBlockの拡張（Task ≠ Time、再改訂）

`TimeBlock.taskId`／`recurringRuleId`をnullable化し、どちらにも
紐付かない`label`ベースのブロック（休憩・生活等）を追加。ちょうど1つだけ
設定し、両方settingしない。

`Task.estimateMinutes`もnullable化した（本当に予定時間が未確認な
Task——例：鬼速PDCAの読書時間——のために、架空の見積もりを作らない
選択肢を用意するため）。

## Reading Task化（Task ≠ TimeBlock）

WeeklyReadingは1冊＝1 Actual Task（`WeeklyReading.taskId`で紐付け）。
1冊に複数のCalendar実行枠があっても、Task自体は1つのまま。

## RIALAの当日実務Actual Task化

Templateに戻さず、その日のGoogle Calendarに具体的な実作業が存在する
場合はActual Task化する。判断基準：Taskは成果物単位、Stepsは手順。
5件のサブ作業を無理に5個のTaskへ分割せず、「1 Parent Task + Steps」を
第一候補とする。

対応するOperationalAuditは、現在の対象・必要性が確認できた時点で
UNKNOWN→ACTIVEへ更新し、`actualTaskId`をセットする。完了の証拠が
無い限りDONEにはしない。

## Countdown（あと○日）

Milestone/Goalの`targetDate`から`daysBetween`で毎日自動計算する。
ハードコードしない。Multi-day MilestoneのCountdown基準日は
**startDate**（GENESIS合宿は10/3〜10/4だが、targetDateは10/3）。

視覚強度：3日以内＝強調／7日以内＝やや強調／30日以内＝通常／
それ以外＝薄め。危機感を煽る赤色は使わない（`lib/countdown.ts`）。

Goal Tree（Milestoneノード）とGENESIS Outcome詳細（固定予定
セクション）の両方に表示する。

## TASK MAP Filter整理

「全部／未着手／進行中／AI」のChip行を廃止。代わりに「今月の前進」の
Summary Metric（進行中／未着手／AI担当／7日以内）自体をタップ可能な
Filter Buttonにし、もう一度タップすると解除する（同時に有効な
QuickFilterは1つ）。詳細条件（Area/担当/重要度/緊急度）は「絞り込み」に
残す。並び替えも残す。期限超過は情報表示のみ（Filterにしない）。

## Daily Stack達成Motion / prefers-reduced-motion

ヘッダー右上の「✦ 完了エフェクト切替」ボタンは撤去し、演出は常時有効
（オフスイッチを持たせない）。ただし`prefers-reduced-motion: reduce`が
設定されている場合はConfetti等のアニメーションだけをスキップし、
テキスト・状態変化は通常通り表示する（`lib/useReducedMotion.ts`）。

Achievement階層は変更なし：Task完了＝micro feedback／毎日の積み上げ
100%＝small victory motion／Today全体100%＝celebration。

## NOW Start / Complete と実測

TODAY TimelineのNOWカードのみ、チェックボックスの代わりに
「開始」「完了」ボタンを表示する。「開始」で`startedAt`相当のタイムスタンプを
記録し、「完了」で実際の経過分数を`actualMinutes`として記録する
（`lib/date.ts`の`minutesSince`、Phase1はセッション内のみ・DB未接続）。
架空のActualは作らない。

## 今回やらなかったこと（意図的）

- Google Calendar自動同期（引き続き手動でCalendar内容を転記）
- Manager Mode夜間プランニングUI
- Timelineの時間比例ビジュアル（時間軸目盛りに応じた高さ配置）— 現状は
  時刻順の縦リスト＋NOW Indicator行に留める
- Weekly Review集計UI（実績データがまだ薄いため）

# Execution UX + RIALA Daily Learning 改善ラウンド（2026-09-05）

「予定を見るアプリ」から「今やるTaskを選び、実行し、実績を蓄積する
Execution OS」への拡張。

## Early Start（予定時刻より前でも開始できる）

Plan（TimeBlockのstartTime/endTime）とActual（実際に開始・完了した時刻）
は絶対に混同しない。ユーザーはNOW以外のTask（NEXT/LATER/PAST、時間未定
リスト含む）にも「今から開始」を使え、押した瞬間にそのTaskだけが
グローバルなSTARTED Taskになる（`lib/timeline.ts`の`buildTimeline`が
`startedTaskId`引数を受け取り、そのTaskのTimelineスロットをPlanの
時刻に関係なくNOWへ強制昇格させる。TimeBlock自体のstartTime/endTimeは
一切書き換えない）。

同時にSTARTEDにできるTaskは1つだけ。既に別のTaskがSTARTEDの状態で
別のTaskの「今から開始」を押すと、「現在実行中のTaskがあります」の
確認シートが出る（`app/today/page.tsx`の`switchConfirmTaskId`）。
「切り替える」を押すまで前のTaskは実行中のまま保持され、勝手に完了
扱いにはしない。

TimeBlockを持たない（時間未定リストの）Taskを開始した場合は
Timelineに差し込む場所が無いため、Timelineの直前に`PinnedNowCard`
として固定表示する。現在の実データでは今日のTaskは全てTimeBlockを
持つため、この経路は現状のfixtureでは発火しない（架空のunscheduled
Taskを作ってまで発火させることはしていない）。

NOWの判定優先順位（`buildTimeline`）：
1. 実際にSTARTEDのTask
2. 現在時刻内のTimeBlock
3. NEXT（＝壁時計で次に来るTask。STARTEDが過去のTaskを指していても、
   「nowIndexの次の配列インデックス」ではなく「現在時刻より後に始まる
   最初のTask」で判定するよう修正済み — 実装中に見つけたバグ）

## Task状態の可視化とActual計測

Task状態を○（未着手・タップで開始）／▶（実行中・タップで完了）／
✓（完了・タップで取り消し）の1ボタン遷移で表現する
（`TaskStateButton`、`app/today/page.tsx`）。取り消し線や大量のBadgeは
使わない。

開始→完了で`actualMinutes`を計測し（`lib/date.ts`の`minutesSince`、
セッション内メモリのみ）、`estimateMinutes`があれば
`lib/execution.ts`の`computeVariance`で差分（例：`実績47分 (+17分)`）を
Timelineカード・TaskDetailSheetの両方に表示する。差が出た理由は
「なぜ差が出た？」チップ（想定外の確認／情報不足／AI待ち／集中切れ／
作業量過小評価／割り込み／分解不足／技術的な問題／Task範囲の追加／
その他、`VarianceReason`型）から本人が任意で選択する形にし、AIが
理由を勝手に生成することはない。実際の現在時刻NOWスロットで
`remaining`（残り分）がマイナスになることは時刻の定義上あり得ないため、
Early Startで大きく過去のTaskを開始した場合の「残り-355分」のような
無意味な表示は出さない（`remaining >= 0`のみ表示）。

## TASK MAP：Filter/Sort統合と重複UI削除

「絞り込み」と「並び替え」を1行にまとめ、Summary Metric（進行中／
未着手／AI担当／7日以内）をタップした際に表示していた重複Chip行
（`{quickFilter} ✕`ボタン）を撤去。フィルターが有効な間は小さな
「フィルター解除」リンクのみ表示する（`app/tasks/page.tsx`）。

## RIALA Daily Learning Share（Recurring Workflow）

RIALA Learning内の約119件のコンテンツ（個別タイトル・URL・内容は
このセッションから取得できないため件数のみ保持、架空生成しない）を
毎日1つ再発見してもらう施策。新規カテゴリ`oc-08`「コミュニティ学習
促進」＋Workflow`wf-08-daily-learning`として`/riala-master`に追加。
毎日Taskとしてdummy-dataへ増殖させず、Recurring Workflow（型）
1件のみ保持し、今日のInstanceは実際に着手されるまでTODAYへ生成しない
（架空のDraft・投稿を作らない）。予約投稿はしゅんさんへ依頼中で未実装
のため`schedulingCapability: "DRAFT_ONLY"`に留め、自動投稿できるとは
表示しない（`SchedulingCapability`型：UNAVAILABLE/DRAFT_ONLY/
HUMAN_APPROVAL/AUTO_SCHEDULE_AVAILABLE）。

## Problem Decomposition / 問い切りと統合（Knowledge Layer）

TaskにもCalendar Eventにもしない、Work Principlesと同種のKnowledge
（`ProblemDecompositionKnowledge`型、`lib/dummy-data.ts`の
`problemDecompositionKnowledge`）。GOAL→FACT→GAP→CENTRAL QUESTION→
DECOMPOSE→ASSIGN→SYNTHESIZE→PRIORITIZE→ACTIONの流れ、5つの視点
（DEFINITION/CURRENT STATE/GAP/METHOD/PRIORITY）、工程分解と論点分解の
違いを保持。GENESISの具体⇄抽象トレーニング（r-001）のRecurringDetail
Sheetから「関連Knowledge」として参照でき、GENESIS合宿（g-genesis-camp）
にも緩く関連付けるが、「合宿で必ずこの方法を使う」という確定Taskには
しない。

## 今回やらなかったこと（意図的）

- 「3つのすぐ」の正確な3項目（本の内容が未確認のため）
- RIALA Daily Learning Shareの今日のInstance生成・自動投稿
- Weekly Reviewへのvariance集計反映（実績データがまだ薄いため）
- Overdue/Upcomingの圧縮アラート行への開始ボタン追加（Today Timelineと
  時間未定リストの範囲に留めた）
