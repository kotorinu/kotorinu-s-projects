import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { emptyLedger, type Ledger, type Store } from "./model";
import { compareAndSwap, createRedisClient, redisCredentials } from "../server/redisClient";

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
  private redis: ReturnType<typeof createRedisClient>;
  constructor(url: string, token: string, private key = "riala:planner:v1") {
    this.redis = createRedisClient(url, token);
  }
  private async raw() {
    try {
      const result = await this.redis.get<string>(this.key);
      if (result !== null && typeof result !== "string") throw new Error();
      return result;
    } catch { throw new Error("Planner Storeに接続できません"); }
  }
  async read() { return decodeLedger(await this.raw()); }
  async transact<T>(fn: (ledger: Ledger) => T): Promise<T> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const old = await this.raw(); const ledger = decodeLedger(old); const result = fn(ledger); ledger.version++;
      const next = encode(ledger);
      let committed;
      try { committed = await compareAndSwap(this.redis, this.key, old, next); }
      catch { throw new Error("Planner Storeの更新結果を確認できません。再読み込みしてください"); }
      if (committed) return result;
    }
    throw new Error("別の処理が実行中です。再読み込みしてください");
  }
}
export function configuredStore(): Store | null {
  const e = process.env;
  const credentials = redisCredentials(e);
  if (credentials) return new RedisStore(credentials.url, credentials.token);
  if (!e.VERCEL && e.NODE_ENV !== "production" && e.RIALA_PLANNER_DATA_DIR) return new FileStore(e.RIALA_PLANNER_DATA_DIR);
  return null;
}

