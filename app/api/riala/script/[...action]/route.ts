import { deviceAuthenticated } from '../../../../../lib/server/deviceSession';
import { authenticated, sameOrigin } from '../../../../../lib/riala-planner/security';
import { initialScript, scriptStore, updateScript } from '../../../../../lib/sales-script/store';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export async function GET(request: Request) {
  const action = new URL(request.url).pathname.split('/').pop();
  try {
    const edition = new URL(request.url).searchParams.get('edition') === 'sugiyama' ? 'sugiyama' : 'mogi';
    const store = scriptStore(edition);
    const state = store ? await store.read() : initialScript(edition);
    if (action === 'document') return json({ content: state.content, revision: state.version, canEdit: !!store && (authenticated(request) || deviceAuthenticated(request)), persistent: !!store });
    if (action === 'versions') {
      if (!authenticated(request) && !deviceAuthenticated(request)) return json({ error: '履歴を見るには編集ログインが必要です' }, 401);
      return json({ versions: state.versions.map(({ id, note, created_at }) => ({ id, note, created_at })).reverse() });
    }
    return json({ error: 'not found' }, 404);
  } catch { return json({ error: 'クラウドに接続できません' }, 503); }
}
async function mutate(request: Request) {
  if (!authenticated(request) && !deviceAuthenticated(request)) return json({ error: '編集ログインが必要です' }, 401);
  if (!sameOrigin(request)) return json({ error: 'Origin mismatch' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415);
  const store = scriptStore(new URL(request.url).searchParams.get('edition') === 'sugiyama' ? 'sugiyama' : 'mogi');
  if (!store) return json({ error: '保存先が未接続です' }, 503);
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 150000) return json({ error: 'too large' }, 413);
    const body = JSON.parse(raw);
    if (!Number.isInteger(body.revision)) return json({ error: 'revision required' }, 400);
    const path = new URL(request.url).pathname;
    if (request.method === 'PUT' && path.endsWith('/document')) {
      const revision = await store.transact(state => updateScript(state, body.content, body.revision, body.note === '手動保存' ? '手動保存' : '自動保存'));
      return json({ ok: true, revision });
    }
    if (request.method === 'POST' && /\/restore\/\d+$/.test(path)) {
      const id = Number(path.split('/').pop());
      const result = await store.transact(state => {
        const version = state.versions.find(v => v.id === id);
        if (!version) throw new Error('missing');
        const revision = updateScript(state, version.content, body.revision, '履歴から復元');
        return { content: version.content, revision };
      });
      return json({ ok: true, ...result });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    return json({ error: message === 'conflict' ? '別の端末で更新されています' : '保存できませんでした' }, message === 'conflict' ? 409 : message === 'invalid' ? 400 : 503);
  }
}
export const PUT = mutate;
export const POST = mutate;
