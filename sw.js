const CACHE_NAME = 'finzana-cache-v5'; // Versión incrementada para forzar la actualización
const urlsToCache = [
    './',
    './index.html',
    './css/styles.css',
    './js/app.js',
    './js/database.js',
    './firebase-config.js',
    './offline.html',
    './assets/logo.png',
    './assets/logo_192.png',
    './assets/logo_512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache abierta y guardando archivos de la app');
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting();
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
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // ===== INICIO DE LA MODIFICACIÓN (Ignorar peticiones de Firebase) =====
    // Si la petición es para los servicios de Google o Firebase,
    // se la pasamos directamente a la red, sin caché.
    if (requestUrl.hostname.includes('googleapis.com') || requestUrl.hostname.includes('firebaseapp.com')) {
        event.respondWith(fetch(event.request));
        return;
    }
    // ===== FIN DE LA MODIFICACIÓN =====

    if (event.request.method !== 'GET') {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request).then(networkResponse => {
                    // Cachear solo respuestas válidas
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                    }
                    return networkResponse;
                }).catch(() => {
                    // Fallback para navegación offline
                    if (event.request.mode === 'navigate') {
                        return caches.match('./offline.html');
                    }
                });
            })
    );
});
