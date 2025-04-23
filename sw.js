 // sw.js - Service Worker for ChainSync Lite v6 (Firebase Version)

 const CACHE_NAME = 'chainsync-lite-v6-firebase-cache-v1'; // New cache name
 const baseHref = '/';
 const urlsToCache = [
     // Core files
     baseHref,
     '/manifest.json',
     // JavaScript Modules
     '/app.js',
     '/firebaseConfig.js', // Added
     '/auth.js',           // Added
     '/ui.js',
     '/crud.js',
     // '/sync.js',        // Removed
     '/scanner.js',
     '/notifications.js',
     '/utils.js',
     // External libraries (CDNs)
     'https://cdn.jsdelivr.net/npm/chart.js',
     'https://cdn.tailwindcss.com',
     'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js',
     'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
     'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js',
     'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
     'https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.css',
     'https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.js',
     // Firebase SDKs (Add if using CDN, otherwise they are likely bundled)
     "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
     "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js",
     "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js",
     // Dexie removed
     // Add icon paths if you have them, e.g., '/icons/icon-192x192.png'
 ];

 // --- Installation ---
 self.addEventListener('install', event => {
     console.log('[SW] Install event');
     event.waitUntil(
         caches.open(CACHE_NAME).then(cache => {
             console.log('[SW] Caching core assets:', urlsToCache);
             // Use individual fetches for better error reporting during install
             const cachePromises = urlsToCache.map(url => {
                 // Use cors for CDN/gstatic requests
                 const requestOptions = url.includes('gstatic.com') || url.includes('cdn.') ? { mode: 'cors', cache: 'reload' } : { cache: 'reload' };
                 return fetch(url, requestOptions)
                     .then(response => {
                         if (!response.ok) {
                             // Log CDN/Firebase errors but don't fail install for them
                             if (url.startsWith('http')) {
                                 console.warn(`[SW] Optional cache fail: ${url} - ${response.statusText}`);
                                 return Promise.resolve(); // Resolve so Promise.all doesn't fail
                             } else {
                                 throw new Error(`[SW] Failed to fetch local asset: ${url} - ${response.statusText}`);
                             }
                         }
                         return cache.put(url, response);
                     })
                     .catch(err => {
                         console.error(`[SW] Failed to cache ${url}`, err);
                          // Only throw if it's a local asset, allow install to continue if CDN fails
                         if (!url.startsWith('http')) {
                            throw err;
                         }
                         return Promise.resolve();
                     });
             });
             return Promise.all(cachePromises);
         }).then(() => {
             console.log('[SW] Install OK, skipping waiting.');
             return self.skipWaiting();
         }).catch(err => { console.error('[SW] Install Failed:', err); })
     );
 });

 // --- Activation ---
 self.addEventListener('activate', event => {
     console.log('[SW] Activate event');
     event.waitUntil(
         caches.keys().then(keys => Promise.all(
             // Delete ALL caches except the current one
             keys.map(key => { if (key !== CACHE_NAME) { console.log('[SW] Clearing old cache:', key); return caches.delete(key); } })
         )).then(() => { console.log('[SW] Activate OK, claiming clients.'); return self.clients.claim(); })
           .catch(err => console.error('[SW] Activation failed:', err))
     );
 });

 // --- Fetch (Network First for Navigation, Cache First for Assets) ---
 self.addEventListener('fetch', event => {
     const reqUrl = new URL(event.request.url);

     // Network First for Navigation (HTML)
     if (event.request.mode === 'navigate' && reqUrl.origin === location.origin) {
         event.respondWith(
             fetch(event.request)
                 .then(networkResponse => {
                     if (networkResponse && networkResponse.ok) {
                         const responseToCache = networkResponse.clone();
                         caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
                         return networkResponse;
                     }
                     return caches.match(event.request).then(res => res || caches.match(baseHref));
                 })
                 .catch(() => caches.match(event.request).then(res => res || caches.match(baseHref)))
         );
         return;
     }

     // Cache First for Assets (JS, CSS, CDNs, Firebase SDKs)
     const isCachable = reqUrl.origin === location.origin || urlsToCache.some(cacheUrl => cacheUrl.startsWith('http') && reqUrl.href.startsWith(cacheUrl));

     if (isCachable) {
         event.respondWith(
             caches.match(event.request)
             .then(cachedResponse => {
                 if (cachedResponse) return cachedResponse;
                 return fetch(event.request).then(networkResponse => {
                     if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
                         return networkResponse;
                     }
                     const responseToCache = networkResponse.clone();
                     caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
                     return networkResponse;
                 }).catch(err => { console.error('[SW] Fetch error (non-nav):', event.request.url, err); });
             })
         );
         return;
     }
     // Let browser handle other requests (e.g., Firestore API calls)
 });
