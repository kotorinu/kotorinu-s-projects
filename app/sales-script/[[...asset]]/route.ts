import { page } from "../../../lib/sales-script/page";
import { sugiyamaPage } from "../../../lib/sales-script/sugiyama-page";
import { questionBankPage } from "../../../lib/sales-script/question-bank-page";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const path = new URL(request.url).pathname;
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (/\/sales-script\/questions\/?$/.test(path)) return new Response(questionBankPage, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  if (/\/sales-script\/?$/.test(path)) {
    const mogi = new URL(request.url).searchParams.get('edition') === 'mogi';
    const legacy = page.replace('<div class="app">', '<div class="app"><nav style="padding:16px;background:white"><a href="/sales-script">← ラポール重視版 2026-09-24</a> ／ 茂木さん版</nav>').replace('</body>', '<script src="/script-speech.js" defer></script></body>');
    return new Response(mogi ? legacy : sugiyamaPage, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  }
  if (path.endsWith('/manifest.webmanifest')) return Response.json({ name: '緒方 Sales Script', short_name: 'Sales Script', start_url: '/sales-script', scope: '/sales-script', display: 'standalone', background_color: '#f7f8fc', theme_color: '#606cc0', icons: [{ src: '/sales-script/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] }, { headers });
  if (path.endsWith('/icon.svg')) return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#606cc0"/><path d="M18 16h28v32H18z" fill="white"/><path d="M24 25h16M24 32h16M24 39h10" stroke="#606cc0" stroke-width="3"/></svg>', { headers: { ...headers, 'Content-Type': 'image/svg+xml' } });
  if (path.endsWith('/sw.js')) return new Response(`const C='ogata-sugiyama-2026-09-24-v1';const A=['/sales-script','/sales-script?edition=mogi','/sales-script/manifest.webmanifest','/sales-script/icon.svg','/sugiyama-reading.js?v=2','/sugiyama.js?v=4','/sugiyama.css','/script-speech.js'];self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(A)))});self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method==='GET'&&u.origin===location.origin&&A.includes(u.pathname+u.search))e.respondWith(fetch(e.request).catch(()=>caches.open(C).then(c=>c.match(e.request))))})`, { headers: { ...headers, 'Content-Type': 'application/javascript', 'Service-Worker-Allowed': '/sales-script' } });
  return new Response('Not found', { status: 404 });
}
