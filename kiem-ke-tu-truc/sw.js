const CACHE='kiemke-fbf2e4f71c';
const ASSETS=["./", "index.html", "data.js", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "pdfparse.js", "xlsx.full.min.js", "pdfjs/pdf.min.js", "pdfjs/pdf.worker.min.js", "tess/tesseract.min.js", "tess/worker.min.js", "tess/tesseract-core-simd-lstm.wasm.js", "tess/tesseract-core-lstm.wasm.js", "tess/eng-data.js"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('kiemke-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('message',e=>{if(e.data=='ensure')e.waitUntil(caches.open(CACHE).then(async c=>{const have=(await c.keys()).length;if(have<ASSETS.length)await c.addAll(ASSETS)}).catch(()=>{}))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(res=>{if(res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}return res}).catch(()=>caches.match('index.html'))))});
