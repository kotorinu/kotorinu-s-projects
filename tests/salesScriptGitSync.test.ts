import test from 'node:test';
import assert from 'node:assert/strict';
import { githubScriptConfig, publishSalesScript, salesScriptPath } from '../lib/sales-script/githubSync';

test('sales scripts have stable Git paths', () => {
  assert.equal(salesScriptPath('mogi'), 'scripts/mogi.md');
  assert.equal(salesScriptPath('sugiyama'), 'scripts/sugiyama.md');
  assert.equal(salesScriptPath('nagashima'), 'scripts/nagashima-reference.md');
});

test('Git publishing stops visibly when credentials are absent', async () => {
  assert.equal(githubScriptConfig({}), null);
  const result = await publishSalesScript('sugiyama', '# draft', fetch, {});
  assert.equal(result.status, 'NOT_CONFIGURED');
});

test('Git publishing updates the existing file and reports the commit', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (!init?.method) return new Response(JSON.stringify({ sha: 'blob-old' }), { status: 200 });
    return new Response(JSON.stringify({ commit: { sha: 'commit-new' } }), { status: 200 });
  };
  const result = await publishSalesScript('nagashima', '# corrected', fakeFetch as typeof fetch, {
    GITHUB_SCRIPT_TOKEN: 'secret',
    GITHUB_SCRIPT_REPOSITORY: 'owner/repo',
    GITHUB_SCRIPT_BRANCH: 'main',
  });
  assert.equal(result.status, 'SYNCED');
  if (result.status !== 'SYNCED') return;
  assert.equal(result.commitSha, 'commit-new');
  assert.equal(calls.length, 2);
  const body = JSON.parse(String(calls[1].init?.body));
  assert.equal(Buffer.from(body.content, 'base64').toString('utf8'), '# corrected');
  assert.equal(body.sha, 'blob-old');
  assert.equal(body.branch, 'main');
  assert.equal(calls[1].init?.headers && (calls[1].init?.headers as Record<string,string>).Authorization, 'Bearer secret');
});

test('Git publishing reports update conflicts without claiming success', async () => {
  let count = 0;
  const fakeFetch = async () => ++count === 1
    ? new Response(JSON.stringify({ sha: 'blob-old' }), { status: 200 })
    : new Response('{}', { status: 409 });
  const result = await publishSalesScript('mogi', '# draft', fakeFetch as typeof fetch, { GITHUB_SCRIPT_TOKEN: 'secret', GITHUB_SCRIPT_REPOSITORY: 'owner/repo' });
  assert.equal(result.status, 'FAILED');
  if (result.status !== 'FAILED') return;
  assert.match(result.error, /409/);
});