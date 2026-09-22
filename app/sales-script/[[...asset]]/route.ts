import { page } from "../../../lib/sales-script/page";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const path = new URL(request.url).pathname;
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (/\/sales-script\/?$/.test(path)) return new Response(page.replace('</body>', '<script src="/script-speech.js" defer></script></body>'), { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  if (path.endsWith('/manifest.webmanifest')) return Response.json({ name: '緒方 Sales Script', short_name: 'Sales Script', start_url: '/sales-script', scope: '/sales-script', display: 'standalone', background_color: '#f7f8fc', theme_color: '#606cc0', icons: [{ src: '/sales-script/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] }, { headers });
  if (path.endsWith('/icon.svg')) return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#606cc0"/><path d="M18 16h28v32H18z" fill="white"/><path d="M24 25h16M24 32h16M24 39h10" stroke="#606cc0" stroke-width="3"/></svg>', { headers: { ...headers, 'Content-Type': 'image/svg+xml' } });
  if (path.endsWith('/sw.js')) return new Response(`const C='ogata-vercel-v1';self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(['/sales-script','/sales-script/manifest.webmanifest','/sales-script/icon.svg'])))});self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method==='GET'&&u.origin===location.origin&&u.pathname.startsWith('/sales-script'))e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))})`, { headers: { ...headers, 'Content-Type': 'application/javascript', 'Service-Worker-Allowed': '/sales-script' } });
  return new Response('Not found', { status: 404 });
}
