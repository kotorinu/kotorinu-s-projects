import "server-only";
import { compareAndSwap, createRedisClient } from "./redisClient";

/**
 * Shared compare-and-swap JSON store, built on the same server-only
 * @upstash/redis client the Planner uses. Transaction callbacks must be pure:
 * a lost CAS re-runs them against freshly read state.
 */
export interface JsonStore<T> {
  read(): Promise<T>;
  transact<R>(fn: (state: T) => R): Promise<R>;
}

export class RedisJsonStore<T extends { version: number }> implements JsonStore<T> {
  private redis: ReturnType<typeof createRedisClient>;
  constructor(url: string, token: string, private key: string, private decode: (raw: string | null) => T) {
    this.redis = createRedisClient(url, token);
  }
  private async raw() {
    try {
      const result = await this.redis.get<string>(this.key);
      if (result !== null && typeof result !== "string") throw new Error();
      return result;
    } catch { throw new Error("Storeに接続できません"); }
  }
  async read() { return this.decode(await this.raw()); }
  async transact<R>(fn: (state: T) => R): Promise<R> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const old = await this.raw(); const state = this.decode(old); const result = fn(state); state.version++;
      const next = JSON.stringify(state);
      if (Buffer.byteLength(next) > 1500000) throw new Error("Store保存上限です");
      let committed;
      try { committed = await compareAndSwap(this.redis, this.key, old, next); }
      catch { throw new Error("Storeの更新結果を確認できません。再読み込みしてください"); }
      if (committed) return result;
    }
    throw new Error("別の処理が実行中です。再読み込みしてください");
  }
}
