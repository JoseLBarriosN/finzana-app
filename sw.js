const CACHE_NAME = 'finzana-cache-v7'; // Versión incrementada para forzar la actualización
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
            .then(() => self.skipWaiting()) // Forzar activación del nuevo SW
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
        }).then(() => self.clients.claim()) // Tomar control inmediato
    );
});

self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // Ignorar peticiones de Firebase para que su propio SDK offline funcione
    if (requestUrl.hostname.includes('googleapis.com')) {
        return;
    }

    // Para peticiones de navegación (abrir la app), ir a la red primero.
    // Si falla, usar el caché. Esto asegura que siempre tengas la última versión si hay internet.
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request.url))
        );
        return;
    }

    // Para otros recursos (CSS, JS, imágenes), usar "Stale-While-Revalidate"
    // Carga instantáneamente desde el caché, y actualiza en segundo plano.
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
