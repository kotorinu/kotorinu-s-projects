import test from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../app/api/riala/work/route";
const origin = "https://work.example.test";
test("Work API: separate external and Worker credentials; CAS writes survive separate requests", async () => {
  const before = { ...process.env }; const originalFetch = globalThis.fetch;
  Object.assign(process.env, { VERCEL: "1", RIALA_APP_ORIGIN: origin,
    WORK_OS_API_SECRET: "a".repeat(64), WORK_OS_WORKER_SECRET: "w".repeat(64),
    RIALA_REDIS_REST_URL: "https://redis.example.test", RIALA_REDIS_REST_TOKEN: "fixture" });
  delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
  const data = new Map<string, string>();
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://redis.example.test");
    const args = JSON.parse(String(init?.body)); const command = args[0].toLowerCase();
    if (command === "get") return Response.json({ result: data.get(args[1]) ?? null });
    assert.equal(command, "eval");
    if ((data.get(args[3]) ?? "") !== args[4]) return Response.json({ result: 0 });
    data.set(args[3], args[5]); return Response.json({ result: 1 });
  };
  const req = (body: unknown, key = "a".repeat(64)) => new Request(`${origin}/api/riala/work`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const read = () => GET(new Request(`${origin}/api/riala/work`, { headers: { Authorization: `Bearer ${"a".repeat(64)}` } }));
  try {
    assert.equal((await GET(new Request(`${origin}/api/riala/work`))).status, 401);
    assert.equal((await POST(req({ command: "accept", version: 0 }))).status, 403);
    assert.equal((await POST(req({ command: "createTask", version: 0, title: "禁止" }, "w".repeat(64)))).status, 403);
    assert.equal((await POST(req({ command: "initialize", version: 0 }))).status, 200);
    const initial = await (await read()).json(); assert.equal(initial.version, 1);
    const created = await POST(req({ command: "createTask", version: 1, title: "API検証", description: "確認済み入力", definitionOfDone: ["成果物"], aiCapability: "AI_DRAFT" }));
    assert.equal(created.status, 200); const taskId = (await created.json()).ledger.tasks.at(-1).id;
    assert.equal((await POST(req({ command: "createTask", version: 1, title: "古い更新" }))).status, 409);
    const claim = await POST(req({ command: "claim", version: 2, provider: "fixture", taskId }, "w".repeat(64)));
    assert.equal(claim.status, 200); const result = (await claim.json()).result;
    const saved = await POST(req({ command: "result", version: 3, id: result.run.id, claim: result.run.claim, output: "成果物", evidence: ["確認済み入力"] }, "w".repeat(64)));
    assert.equal(saved.status, 200);
    const reopened = await (await read()).json(); assert.equal(reopened.version, 4);
    assert.equal(reopened.runs.at(-1).status, "REVIEW"); assert.equal(reopened.tasks.at(-1).status, "未着手");
    assert.equal(reopened.runs.at(-1).output, "成果物");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  }
});
