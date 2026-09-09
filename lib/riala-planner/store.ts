import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { emptyLedger, type Ledger, type Store } from "./model";

export function decodeLedger(raw: string | null): Ledger {
  if (!raw) return emptyLedger();
  const data = JSON.parse(raw) as Ledger;
  if (data.schemaVersion !== 1 || !Number.isSafeInteger(data.version) || !Array.isArray(data.actions) ||
    !Array.isArray(data.runs) || !Array.isArray(data.seenMemberIds) || !data.settings || data.settings.autoSendAllowed !== false ||
    new Set(data.actions.map(a => a.businessKey)).size !== data.actions.length) throw new Error("Planner台帳が不正です。復元・確認が必要です");
  return data;
}
function encode(data: Ledger): string {
  const raw = JSON.stringify(data);
  if (Buffer.byteLength(raw) > 1500000) throw new Error("Planner保存上限です。履歴を保全して容量を確認してください");
  return raw;
}
/** Persistent single-host store. Never allowed on Vercel or another ephemeral deployment. */
export class FileStore implements Store {
  private file: string;
  constructor(private directory: string) { this.file = resolve(directory, "ledger.json"); }
  async read() {
    try { return decodeLedger(await readFile(this.file, "utf8")); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyLedger(); throw e; }
  }
  async transact<T>(fn: (ledger: Ledger) => T): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lockPath = resolve(this.directory, "transaction.lock");
    let lock;
    try { lock = await open(lockPath, "wx", 0o600); }
    catch { throw new Error("Plannerは処理中です。未完了処理を確認して再試行してください"); }
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      const data = await this.read(); const result = fn(data); data.version++;
      const file = await open(temp, "wx", 0o600);
      try { await file.writeFile(encode(data)); await file.sync(); } finally { await file.close(); }
      await rename(temp, this.file); return result;
    } finally { await unlink(temp).catch(() => {}); await lock.close(); await unlink(lockPath); }
  }
}
/** Atomic CAS against a persistent Redis REST database. No expiring send locks. */
export class RedisStore implements Store {
  constructor(private url: string, private token: string, private key = "riala:planner:v1") {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("安全なPlanner Store URLが必要です");
  }
  private async command(args: unknown[]) {
    const response = await fetch(this.url, { method: "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, body: JSON.stringify(args), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Planner Storeに接続できません");
    const body = await response.json() as { result?: unknown; error?: unknown };
    if (body.error) throw new Error("Planner Store処理に失敗しました"); return body.result;
  }
  private async raw() { const result = await this.command(["GET", this.key]); if (result !== null && typeof result !== "string") throw new Error("Planner Store応答が不正です"); return result as string | null; }
  async read() { return decodeLedger(await this.raw()); }
  async transact<T>(fn: (ledger: Ledger) => T): Promise<T> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const old = await this.raw(); const ledger = decodeLedger(old); const result = fn(ledger); ledger.version++;
      const script = "local v=redis.call('GET',KEYS[1]); if (v or '')~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); return 1";
      if (await this.command(["EVAL", script, 1, this.key, old ?? "", encode(ledger)]) === 1) return result;
    }
    throw new Error("別の処理が実行中です。再読み込みしてください");
  }
}
export function configuredStore(): Store | null {
  const e = process.env;
  if (e.RIALA_REDIS_REST_URL && e.RIALA_REDIS_REST_TOKEN) return new RedisStore(e.RIALA_REDIS_REST_URL, e.RIALA_REDIS_REST_TOKEN);
  if (!e.VERCEL && e.NODE_ENV !== "production" && e.RIALA_PLANNER_DATA_DIR) return new FileStore(e.RIALA_PLANNER_DATA_DIR);
  return null;
}

