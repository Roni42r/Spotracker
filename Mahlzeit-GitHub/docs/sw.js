const scope = new URL(self.registration.scope);
const prefix = 'mahlzeit-shell:' + scope.pathname + ':';
const version = prefix + '1';
const shell = ['./','index.html','style.css','app.mjs','core.mjs','app.webmanifest','icon.svg','icon-192.png','icon-512.png']
  .map(path => new URL(path,scope).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(version).then(cache=>cache.addAll(shell)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(prefix)&&key!==version).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if (event.request.method!=='GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  if (!shell.includes(url.href)) return;
  event.respondWith(fetch(event.request).then(response=>{
    if (response.ok) {
      const copy=response.clone();
      event.waitUntil(caches.open(version).then(cache=>cache.put(url.href,copy)));
    }
    return response;
  }).catch(()=>caches.open(version).then(cache=>cache.match(url.href))));
});
