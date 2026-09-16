import { randomUUID } from "node:crypto";
import { authenticated, equalSecret, sameOrigin } from "../../../../lib/riala-planner/security";
import { mutateWork, WorkConflict, WorkInputError } from "../../../../lib/work/model";
import { workStore, executionStore } from "../../../../lib/work/store";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
function worker(request: Request) {
  const key = process.env.WORK_OS_WORKER_SECRET ?? "";
  return key.length >= 32 && equalSecret(request.headers.get("authorization") ?? "", `Bearer ${key}`);
}
function externalAI(request: Request) {
  const key = process.env.WORK_OS_API_SECRET ?? "";
  return key.length >= 32 && equalSecret(request.headers.get("authorization") ?? "", `Bearer ${key}`);
}
export async function GET(request: Request) {
  if (!authenticated(request) && !worker(request) && !externalAI(request)) return json({ error: "認証が必要です" }, 401);
  try { const store = workStore(); if (!store) return json({ error: "中央保存先が未設定です" }, 503);
    const ledger = await store.read();
    const execution = await executionStore()?.read();
    return json({ ...ledger, execution });
  } catch { return json({ error: "中央データを取得できません" }, 503); }
}
export async function POST(request: Request) {
  const isWorker = worker(request);
  const isExternal = externalAI(request);
  if (!isWorker && !isExternal && !sameOrigin(request)) return json({ error: "Origin確認に失敗しました" }, 403);
  if (!isWorker && !isExternal && !authenticated(request)) return json({ error: "認証が必要です" }, 401);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSONが必要です" }, 415);
  try {
    const raw = await request.text(); if (raw.length > 100000) return json({ error: "入力が大きすぎます" }, 413);
    let body: Record<string, unknown>;
    try { const parsed = JSON.parse(raw); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); body = parsed; }
    catch { return json({ error: "入力形式を確認してください" }, 400); }
    if (isWorker && !["claim", "result"].includes(String(body.command))) return json({ error: "Workerは実行取得と結果保存のみ許可されています" }, 403);
    if (isExternal && !["initialize", "createTask", "updateTask", "createGoal", "updateGoal"].includes(String(body.command))) return json({ error: "外部AIは登録・編集のみ許可されています。成果物承認は人間が行います" }, 403);
    if (!isWorker && ["claim", "result"].includes(String(body.command))) return json({ error: "Worker認証が必要です" }, 403);
    const store = workStore(); if (!store) return json({ error: "中央保存先が未設定です" }, 503);
    const now = new Date().toISOString(), id = randomUUID();
    const execution = body.command === "claim" ? await executionStore()?.read() : null;
    const completed = Object.keys(execution?.snapshot?.completions ?? {});
    const result = await store.transact(l => mutateWork(l, body, now, id, completed));
    return json({ result, ledger: await store.read() });
  } catch (error) { return json({ error: error instanceof WorkConflict || error instanceof WorkInputError ? error.message : "更新結果を確認できません。再読み込みしてから判断してください" }, error instanceof WorkConflict ? 409 : error instanceof WorkInputError ? 400 : 503); }
}
