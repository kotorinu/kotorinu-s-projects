// Network-only for all authenticated/personal data. Never cache API responses
// or queue mutations: offline is not a successful central write.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate" || event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Work OS オフライン</title><body style="font-family:sans-serif;background:#f4f6fa;color:#111827;padding:32px"><h1>ネットワークへ接続してください</h1><p>中央データを取得できません。オフラインでタスクの追加や完了は保存されません。</p><button onclick="location.reload()">再接続</button></body></html>',
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  )));
});
