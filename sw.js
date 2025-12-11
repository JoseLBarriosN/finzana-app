const CACHE_NAME = 'finzana-cache-v12'; // Versión incrementada
const urlsToCache = [
    './',                
    'index.html',      // Sin / inicial
    'css/styles.css',  // Sin / inicial
    'js/app.js',       // Sin / inicial
    'js/database.js',  // Sin / inicial
    'firebase-config.js',
    'offline.html',    // Asegúrate de que este archivo exista, si no, bórralo de aquí
    'assets/logo.png',
    'assets/logo_192.png',
    'assets/logo_512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js'
];

const CRITICAL_FILES = [
    'css/styles.css',
    'js/app.js',
    'js/database.js',
    'firebase-config.js'
];

// --- INSTALACIÓN ---
self.addEventListener('install', event => {
    console.log('[SW] Instalando y cacheando recursos estáticos...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting()) // Forza la activación inmediata
    );
});

// --- ACTIVACIÓN (Limpieza de cachés viejas) ---
self.addEventListener('activate', event => {
    console.log('[SW] Activando...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Eliminando caché antigua:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ===================================
// --- EVENTO FETCH (CORREGIDO) ---
// ===================================
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // 1. IGNORAR APIS DE DATOS (FIREBASE / GOOGLE MAPS)
    // Esto es vital para que la persistencia offline de Firebase (IndexedDB) funcione
    if (requestUrl.hostname.includes('firestore.googleapis.com') || 
        requestUrl.hostname.includes('googleapis.com') || 
        requestUrl.hostname.includes('firebaseio.com')) {
        return; // El SW no toca esto, va directo a la red/SDK.
    }

    // 2. ESTRATEGIA: NETWORK FIRST (Para HTML y Archivos Críticos)
    // CORRECCIÓN: Usamos .endsWith() para que coincida sin importar la carpeta raíz
    if (event.request.mode === 'navigate' || CRITICAL_FILES.some(file => requestUrl.pathname.endsWith(file))) {
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    // Si la red responde bien, actualizamos la caché
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Si la red falla (Offline), buscamos en caché
                    return caches.match(event.request).then(cachedResponse => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        // Fallback para navegación: mostrar index o offline.html
                        if (event.request.mode === 'navigate') {
                            return caches.match('index.html')
                                .then(index => index || caches.match('offline.html'));
                        }
                    });
                })
        );
        return;
    }

    // 3. ESTRATEGIA: STALE-WHILE-REVALIDATE (Para imágenes, estilos secundarios)
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const fetchPromise = fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Falla silenciosa si no hay red y ya tenemos caché
            });

            return cachedResponse || fetchPromise;
        })
    );
});
