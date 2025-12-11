// ===================================
// --- Service Worker FINZANA (OPTIMIZADO) ---
// ===================================

const CACHE_NAME = 'finzana-cache-v10'; // Incrementamos versión para forzar actualización
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
    // Scripts de Firebase (Es correcto cachear los scripts, pero NO las peticiones de datos)
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
        }).then(() => self.clients.claim()) // Toma control de los clientes inmediatamente
    );
});

// ===================================
// --- EVENTO FETCH (CRÍTICO) ---
// ===================================
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // 1. IGNORAR APIS DE DATOS (FIREBASE / GOOGLE MAPS)
    // Es vital ignorar 'firestore.googleapis.com' y 'identitytoolkit' para que
    // el SDK de Firebase maneje su propia persistencia (IndexedDB) sin interferencias.
    if (requestUrl.hostname.includes('firestore.googleapis.com') || 
        requestUrl.hostname.includes('googleapis.com') || 
        requestUrl.hostname.includes('firebaseio.com')) {
        return; // El SW no toca esto, va directo a la red/SDK.
    }

    // 2. ESTRATEGIA: NETWORK FIRST, FALLBACK TO CACHE (Para HTML y Archivos Críticos)
    // Usamos esto para asegurar que el usuario siempre tenga la última versión de la app si tiene internet.
    if (event.request.mode === 'navigate' || CRITICAL_FILES.some(file => requestUrl.pathname.endsWith(file))) {
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    // Si la red responde bien, actualizamos la caché y entregamos el recurso
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
                        // SI ES UNA NAVEGACIÓN (HTML) Y NO ESTÁ EN CACHÉ:
                        // Devolvemos index.html (para que cargue la app) o offline.html
                        if (event.request.mode === 'navigate') {
                            return caches.match('/index.html')
                                .then(index => index || caches.match('/offline.html'));
                        }
                    });
                })
        );
        return;
    }

    // 3. ESTRATEGIA: STALE-WHILE-REVALIDATE (Para imágenes, fuentes, estilos secundarios)
    // Muestra lo que hay en caché rápido, y actualiza en segundo plano.
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const fetchPromise = fetch(event.request).then(networkResponse => {
                // Solo actualizamos caché si la respuesta es válida
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(err => {
                // Errores de red silenciosos en background update
                // console.log('Error actualizando caché en background', err); 
            });

            // Devolver caché si existe, si no, esperar a la red
            return cachedResponse || fetchPromise;
        })
    );
});
