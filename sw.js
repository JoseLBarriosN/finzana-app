const CACHE_NAME = 'finzana-cache-v4'; // Versión incrementada para forzar la actualización
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
                return cache.addAll(urlsToCache).catch(error => {
                    console.log('Error cacheando algunos archivos:', error);
                });
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
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }

                return fetch(event.request).then(response => {
                    // Evitar cachear respuestas inválidas o de extensiones
                    if (!response || response.status !== 200 || response.type !== 'basic' && response.type !== 'cors') {
                        return response;
                    }

                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });

                    return response;
                }).catch(() => {
                    // Si falla la red y es una página, muestra offline.html
                    if (event.request.mode === 'navigate') {
                        return caches.match('./offline.html');
                    }
                });
            })
    );
});
