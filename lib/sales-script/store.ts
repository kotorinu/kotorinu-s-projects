import { completeMarkdown } from './seed';
import { RedisJsonStore } from '../server/redisJsonStore';
import { redisCredentials } from '../server/redisClient';
export type ScriptVersion = { id: number; content: string; note: string; created_at: string };
export type ScriptState = { version: number; content: string; versions: ScriptVersion[] };
export function initialScript(): ScriptState { return { version: 0, content: completeMarkdown, versions: [] }; }
export function scriptStore() {
  const c = redisCredentials();
  return c ? new RedisJsonStore<ScriptState>(c.url, c.token, 'sales-script:document:v1', raw => raw ? JSON.parse(raw) as ScriptState : initialScript()) : null;
}
export function updateScript(state: ScriptState, content: string, revision: number, note: string) {
  if (state.version !== revision) throw new Error('conflict');
  if (typeof content !== 'string' || content.trim().length < 10 || Buffer.byteLength(content) > 120000) throw new Error('invalid');
  if (!state.versions.length) state.versions.push({ id: 0, content: state.content, note: '移行時のv8正本', created_at: new Date().toISOString() });
  state.content = content;
  state.versions.push({ id: state.version + 1, content, note, created_at: new Date().toISOString() });
  state.versions = state.versions.slice(-10);
  return state.version + 1;
}
