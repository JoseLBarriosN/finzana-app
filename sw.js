// ===================================
// --- Service Worker CORREGIDO ---
// ===================================

const CACHE_NAME = 'finzana-cache-v8'; 
const urlsToCache = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/js/database.js',
    '/firebase-config.js',
    '/offline.html',
    '/assets/logo.png',
    '/assets/logo_192.png',
    '/assets/logo_512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js'
];

const CRITICAL_FILES = [
    '/css/styles.css',
    '/js/app.js',
    '/js/database.js',
    '/firebase-config.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache abierta y guardando archivos de la app');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Eliminando caché antigua:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ===================================
// ---  EVENTO FETCH (CORREGIDO) ---
// ===================================
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    if (requestUrl.hostname.includes('googleapis.com')) {
        return;
    }

    if (event.request.mode === 'navigate' || CRITICAL_FILES.some(file => requestUrl.pathname === file)) {
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    if (networkResponse.status === 200) {
                        return caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, networkResponse.clone());
                            return networkResponse;
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    console.log(`[SW] Red falló para ${requestUrl.pathname}, sirviendo desde caché.`);
                    return caches.match(event.request);
                })
        );
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            return cache.match(event.request).then(cachedResponse => {
                const fetchPromise = fetch(event.request).then(networkResponse => {
                    if (networkResponse.status === 200) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                });

                return cachedResponse || fetchPromise;
            });
        })
    );
});
