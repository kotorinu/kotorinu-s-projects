import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeClock } from "../lib/clock";
import { allGapItems, capabilities, goals } from "../lib/dummy-data";
import { liveTimeBlocks, planLastChangedAt } from "../lib/livePlan";
import {
  areaGoals,
  goalPath,
  journeySpine,
  nextMilestone,
  pathProgress,
  philosophyGoals,
} from "../lib/goalTree";
import { calendarSnapshot } from "../lib/calendarSnapshot";

// GOAL TREE と計画の信頼性 (2026-09-09, P0〜P5).

const TODAY = "2026-09-09";

test("P2: 一番近いMilestoneは 1か月後 (10/1)、あと22日", () => {
  const m = nextMilestone(goals, TODAY);
  assert.ok(m, "近い未来のGoalが1つは必要");
  assert.equal(m.id, "g-1month");
  assert.equal(m.targetDate, "2026-10-01");
  const days = Math.round(
    (new Date("2026-10-01").getTime() - new Date(TODAY).getTime()) / 86_400_000
  );
  assert.equal(days, 22, "9/9 → 10/1 は22日");
});

test("P5: Journeyは近い順に 1M → 3M → 6M → 1Y → 3Y → 5Y", () => {
  const spine = journeySpine(goals, TODAY);
  assert.deepEqual(spine.map((n) => n.goal.horizon), ["1M", "3M", "6M", "1Y", "3Y", "5Y"]);
  // 日付そのものも昇順でなければ「近い順」を名乗れない。
  for (let i = 1; i < spine.length; i++) {
    assert.ok(
      (spine[i - 1].goal.targetDate as string) < (spine[i].goal.targetDate as string),
      `${spine[i - 1].goal.title} が ${spine[i].goal.title} より後になっている`
    );
  }
  assert.equal(spine.filter((n) => n.isNextMilestone).length, 1, "NEXTは常に1つ");
});

test("P1: すべての期間Goalに、開かずに読めるdesiredStateがある", () => {
  for (const node of journeySpine(goals, TODAY)) {
    assert.ok(node.goal.desiredState.trim().length > 10, `${node.goal.title} の理想が薄い`);
  }
});

test("P3: 営業の1か月Goalは 9/30までに成約1件", () => {
  const sales = goals.find((g) => g.id === "g-sales-agency");
  assert.ok(sales);
  assert.match(sales.desiredState, /9月30日までに/);
  assert.match(sales.desiredState, /成約を1件/);
  assert.ok(sales.currentGap, "いまとの差が書かれていること");
  assert.ok(sales.nextEvidence, "次に積むEvidenceが1つ決まっていること");
});

test("P3: 営業のPathは 17フェーズ理解 → 商品理解 → ロープレ → テスト → 実商談 → FB → 成約", () => {
  const sales = goals.find((g) => g.id === "g-sales-agency");
  assert.ok(sales);
  const path = goalPath(sales, allGapItems);
  assert.equal(path.length, sales.pathGapIds.length, "参照切れのGapがある");
  const titles = path.map((p) => p.title).join(" / ");
  assert.match(titles, /17フェーズ/);
  assert.match(titles, /商品を説明できる/);
  assert.match(titles, /ロープレ/);
  assert.match(titles, /テストに合格する/);
  assert.match(titles, /実商談を始める/);
  assert.match(titles, /成約1件/);
  // 商品理解は相手待ちのまま。勝手にREADYへ格上げしない。
  const product = path.find((p) => p.id === "gap-sales-path-product");
  assert.equal(product?.status, "WAITING");
  assert.ok(product?.waitingOn, "待ちなら理由が要る");
});

test("P3: 営業Goalに根拠のない数値目標を置いていない", () => {
  const sales = goals.find((g) => g.id === "g-sales-agency");
  assert.ok(sales);
  const text = sales.desiredState + sales.achievementCriteria;
  // 「成約1件」「9月30日」以外の数値ノルマ（商談◯件・成約率◯%）を作らない。
  assert.equal(/成約率/.test(text), false, "成約率は本人にも未共有");
  assert.equal(/商談\d+件/.test(text), false, "必要商談数は逆算していない");
});

test("P3: RIALAは「移行」と「利用促進」を区別している", () => {
  const riala = goals.find((g) => g.id === "g-riala");
  assert.ok(riala);
  assert.match(riala.desiredState, /移行/);
  assert.match(riala.desiredState, /使う人・投稿する人/);
  const path = goalPath(riala, allGapItems);
  assert.equal(path.length, riala.pathGapIds.length);
  assert.equal(path[0].id, "gap-riala-migration", "まず移行を締める");
  assert.equal(path[1].id, "gap-riala-path-baseline", "次にBaseline");
});

test("P3: RIALAはBaselineが無いので人数目標を作っていない", () => {
  const riala = goals.find((g) => g.id === "g-riala");
  assert.ok(riala);
  const text = riala.desiredState + riala.achievementCriteria + (riala.currentGap ?? "");
  assert.equal(/\d+人(増|に|まで)/.test(text), false, "Baseline未取得で人数目標は置かない");
  assert.match(riala.currentGap ?? "", /未取得/);
  const baseline = allGapItems.find((g) => g.id === "gap-riala-path-baseline");
  assert.ok(baseline);
  assert.match(baseline.doneWhen, /Active User/);
});

test("P3/P5: GENESISはPortable Skills中心で、問い切りだけではない", () => {
  const genesis = goals.find((g) => g.id === "g-genesis-60day");
  assert.ok(genesis);
  for (const skill of ["論理的思考", "やり抜く力", "リーダーシップ", "基準値", "継続"]) {
    assert.match(genesis.desiredState, new RegExp(skill), `${skill} が理想に入っていない`);
  }
});

test("P4: 5つのCapabilityがあり、点数フィールドを持たない", () => {
  const genesisCaps = capabilities.filter((c) => c.area === "GENESIS");
  assert.deepEqual(
    genesisCaps.map((c) => c.title),
    ["論理的思考", "リーダーシップ", "やり抜く力", "基準値", "継続"]
  );
  for (const c of genesisCaps) {
    assert.equal("score" in c, false, `${c.title} にscoreがある`);
    assert.equal("level" in c, false, `${c.title} にlevelがある`);
    assert.ok(c.currentGap.trim().length > 0, `${c.title} のCurrent Gapが空`);
    assert.ok(c.nextPractice.trim().length > 0, `${c.title} のNext Practiceが空`);
    assert.ok(c.practices.length > 0, `${c.title} の練習内容が空`);
  }
});

test("P4: 各Capabilityの練習内容が指定どおり", () => {
  const byId = new Map(capabilities.map((c) => [c.id, c]));
  assert.deepEqual(byId.get("cap-logical")?.practices, [
    "Goal → Fact → Gap",
    "Central Questionを1つに決める",
    "Sub Questionsへ分解する",
    "優先順位をつける",
    "Actionへ落とす",
    "実行する",
    "事実と解釈を分ける",
  ]);
  assert.deepEqual(byId.get("cap-leadership")?.practices, [
    "問いを決める",
    "担当を決める",
    "時間を決める",
    "回答を統合する",
    "次の問いを出す",
  ]);
  assert.deepEqual(byId.get("cap-grit")?.practices, ["決めたことを最後までやる", "未達なら原因を書いて再計画する"]);
  assert.deepEqual(byId.get("cap-standard")?.practices, [
    "完了条件（DoD）を先に決める",
    "DoDを満たさないものをDONEにしない",
  ]);
  assert.deepEqual(byId.get("cap-consistency")?.practices, [
    "思考トレーニング",
    "Action",
    "Calendarへ落とす",
    "日報を出す",
  ]);
});

test("Goalのすべての pathGapIds が実在する", () => {
  const known = new Set(allGapItems.map((g) => g.id));
  const dangling: string[] = [];
  for (const g of goals) {
    for (const id of g.pathGapIds) if (!known.has(id)) dangling.push(`${g.id} → ${id}`);
  }
  assert.deepEqual(dangling, []);
});

test("道筋の進捗はGapItemのstatusから導出され、勝手に進まない", () => {
  const sales = goals.find((g) => g.id === "g-sales-agency");
  assert.ok(sales);
  const path = goalPath(sales, allGapItems);
  const progress = pathProgress(path);
  assert.equal(progress.total, path.length);
  assert.equal(progress.done, path.filter((p) => p.status === "DONE").length);
  assert.ok(progress.current, "次にどこを見ればいいかが常に1つ決まる");
});

test("AREA / PHILOSOPHY はJourneyの時間軸に乗せない", () => {
  const spineIds = new Set(journeySpine(goals, TODAY).map((n) => n.goal.id));
  for (const g of [...areaGoals(goals), ...philosophyGoals(goals)]) {
    assert.equal(spineIds.has(g.id), false, `${g.title} が時間軸に混ざっている`);
  }
  assert.equal(areaGoals(goals).length, 4, "営業 / RIALA / GENESIS / 合宿");
});

test("P0: 予定を動かしていなければ planLastChangedAt は null", () => {
  assert.equal(planLastChangedAt({ timeBlockOverrides: {} }), null);
});

test("P0: 照合後に予定を動かしたら snapshot は古いと判定できる", () => {
  const afterSnapshot = "2026-09-09T21:00:00+09:00";
  const changed = planLastChangedAt({
    timeBlockOverrides: {
      "tbo-x": {
        id: "tbo-x",
        taskId: "t-x",
        label: "移動した予定",
        date: "2026-09-10",
        startTime: "20:00",
        endTime: "21:00",
        createdOnDate: "2026-09-09",
        createdAt: afterSnapshot,
        replacesBlockId: "tb-0909-sales-v1",
        reason: "翌日へ",
      },
    },
  });
  assert.equal(changed, afterSnapshot);
  assert.ok(
    (changed as string) > calendarSnapshot.readAt,
    "照合時刻より後の変更は「再照合が必要」と判定されなければならない"
  );
});

test("P0: OS内部の整合とCalendar一致は別物である", () => {
  // Validatorが0件でも、それはCalendarについて何も言っていない。
  const live = liveTimeBlocks({ timeBlockOverrides: {}, supersededBlockIds: new Set() });
  assert.ok(live.length > 0);
  // snapshotは「読んだ時刻」を必ず持つ。これが無ければ「いつ時点か」を言えない。
  assert.match(calendarSnapshot.readAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(calendarSnapshot.coverageStart <= calendarSnapshot.coverageEnd);
  // 念のため、clockと同じ日付基準で扱えること。
  assert.equal(fakeClock(TODAY, "07:27").today, TODAY);
});
