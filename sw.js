// Finzana - Service Worker para funcionalidad Offline
const CACHE_NAME = 'finzana-app-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/js/google-auth.js',
    '/js/offline-db.js',
    '/js/google-sheets-manager.js',
    '/manifest.json',
    '/images/icon-192.png',
    '/images/icon-512.png'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker de Finzana instalándose...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('✅ Cache abierto');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('✅ Todos los recursos cacheados');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('❌ Error durante la instalación:', error);
            })
    );
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
    console.log('🚀 Service Worker de Finzana activado');

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ Eliminando cache antiguo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('✅ Service Worker listo para controlar clientes');
            return self.clients.claim();
        })
    );
});

// Interceptar requests de red
self.addEventListener('fetch', (event) => {
    // Solo manejar requests GET
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Devolver recurso cacheado si existe
                if (response) {
                    console.log('📦 Sirviendo desde cache:', event.request.url);
                    return response;
                }

                // Si no está en cache, hacer request a red
                return fetch(event.request)
                    .then((response) => {
                        // Verificar que la respuesta sea válida
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clonar la respuesta para guardar en cache
                        const responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                console.log('💾 Guardando en cache:', event.request.url);
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    })
                    .catch((error) => {
                        console.error('❌ Error de red:', error);

                        // Para requests de API, devolver respuesta offline
                        if (event.request.url.includes('/api/')) {
                            return new Response(JSON.stringify({
                                error: 'Modo offline',
                                message: 'No hay conexión a internet'
                            }), {
                                status: 503,
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }

                        // Para páginas HTML, devolver página offline
                        if (event.request.destination === 'document') {
                            return caches.match('/offline.html');
                        }

                        throw error;
                    });
            })
    );
});

// Sincronización en background