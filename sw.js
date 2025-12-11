// ===================================
// --- Service Worker FINZANA (V13 - Debug Mode) ---
// ===================================

const CACHE_NAME = 'finzana-cache-v13'; 

// 1. ARCHIVOS LOCALES (CRÍTICOS)
// Asegúrate de que estos archivos existan exactamente en estas rutas relativas a sw.js
const localUrls = [
    './',                
    'index.html',      
    'css/styles.css',  
    'js/app.js',       
    'js/database.js',  
    'firebase-config.js',
    'offline.html',
    'assets/logo.png',
    'assets/logo_192.png',
    'assets/logo_512.png'
    // He quitado favicon.ico por seguridad, si lo tienes, agrégalo.
];

// 2. ARCHIVOS EXTERNOS (NO CRÍTICOS PARA INSTALAR)
// No los ponemos en 'install' para que no rompan la instalación si fallan.
// Se cachearán dinámicamente cuando la app los pida.
const externalUrls = [
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js'
];

// Archivos que requieren estrategia Network-First (siempre buscar versión nueva)
const CRITICAL_FILES = [
    'css/styles.css',
    'js/app.js',
    'js/database.js',
    'firebase-config.js'
];

// --- INSTALACIÓN CON DEPURACIÓN ---
self.addEventListener('install', event => {
    console.log('[SW] Intentando instalar...');
    
    // Esta función intenta cachear archivo por archivo y nos dice cuál falla
    const cacheResources = async () => {
        const cache = await caches.open(CACHE_NAME);
        
        // Intentamos añadir todos los locales
        try {
            await cache.addAll(localUrls);
            console.log('[SW] Archivos locales cacheados correctamente ✅');
        } catch (error) {
            console.error('[SW] ❌ FALLÓ cache.addAll. Buscando el archivo culpable...');
            
            // Si falla el bloque, probamos uno por uno para ver cuál es el error
            for (const url of localUrls) {
                try {
                    await cache.add(url);
                } catch (err) {
                    console.error(`[SW] 🚨 NO SE PUDO ENCONTRAR: ${url}`, err);
                }
            }
        }
    };

    event.waitUntil(
        cacheResources().then(() => self.skipWaiting())
    );
});

// --- ACTIVACIÓN ---
self.addEventListener('activate', event => {
    console.log('[SW] Activando nueva versión...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// --- FETCH (INTERCEPTOR DE RED) ---
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // 1. Ignorar Firebase/Google APIs (Dejar que Firebase maneje su persistencia)
    if (requestUrl.hostname.includes('firestore.googleapis.com') || 
        requestUrl.hostname.includes('googleapis.com') || 
        requestUrl.hostname.includes('firebaseio.com')) {
        return; 
    }

    // 2. Estrategia Network First (Para HTML y JS Crítico)
    if (event.request.mode === 'navigate' || CRITICAL_FILES.some(file => requestUrl.pathname.endsWith(file))) {
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(event.request).then(cachedResponse => {
                        if (cachedResponse) return cachedResponse;
                        // Fallback a offline.html si es navegación
                        if (event.request.mode === 'navigate') {
                            return caches.match('offline.html');
                        }
                    });
                })
        );
        return;
    }

    // 3. Estrategia Stale-While-Revalidate (Para todo lo demás: imágenes, fuentes, etc.)
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const fetchPromise = fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
                }
                return networkResponse;
            }).catch(err => {
                // Silencioso: no hay red
            });

            return cachedResponse || fetchPromise;
        })
    );
});
