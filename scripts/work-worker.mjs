/** Provider-neutral, single-run worker. Never sends external business messages. */
const base = process.env.WORK_OS_URL;
const secret = process.env.WORK_OS_WORKER_SECRET;
const endpoint = process.env.WORK_OS_PROVIDER_URL;
const providerToken = process.env.WORK_OS_PROVIDER_TOKEN;
if (!base || !secret || secret.length < 32 || !endpoint) throw new Error("WORK_OS_URL / WORK_OS_WORKER_SECRET / WORK_OS_PROVIDER_URL を設定してください");
for (const value of [base, endpoint]) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.hash) throw new Error("HTTPS URLが必要です");
}
const url = new URL("/api/riala/work", base);
async function read() {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("中央データを取得できません");
  return response.json();
}
async function post(body) {
  const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`中央更新は停止しました（HTTP ${response.status}）。結果を確認してください`);
  return response.json();
}
let ledger = await read();
const claimed = await post({ command: "claim", version: ledger.version, provider: process.env.WORK_OS_PROVIDER_NAME ?? "configured-provider" });
const { run, task } = claimed.result;
if (!run) { console.log("実行待ちのタスクはありません"); process.exit(0); }
if (run.status === "BLOCKED") { console.log("入力不足で停止しました。アプリで確認してください"); process.exit(0); }
let result;
try {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(providerToken ? { Authorization: `Bearer ${providerToken}` } : {}) },
    body: JSON.stringify({ runId: run.id, task: { title: task.title, description: task.description, definitionOfDone: task.definitionOfDone,
      sourceLinks: task.sourceLinks, requiredInputs: task.requiredInputs }, permissions: { externalSend: false, purchase: false, completionRequiresReview: true } }),
    redirect: "error", signal: AbortSignal.timeout(10 * 60000) });
  if (!response.ok) throw new Error();
  result = await response.json();
  if (!result || typeof result.output !== "string" || !Array.isArray(result.evidence) || !result.evidence.every(e => typeof e === "string")) throw new Error();
} catch { result = { blocker: "Providerから有効な成果物を取得できませんでした。自動再実行はしていません", evidence: [] }; }
ledger = await read();
await post({ command: "result", version: ledger.version, id: run.id, claim: run.claim, ...result });
console.log("結果を中央保存しました。アプリで成果物と根拠を確認してください");
