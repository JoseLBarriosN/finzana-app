// sw.js - Service Worker Mejorado para Finzana
const CACHE_NAME = 'finzana-v2.0.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/database.js',
  '/js/firebase-config.js',
  '/favicon.ico',
  '/assets/logo.png',
  '/offline.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  console.log('🔄 Service Worker instalándose...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('✅ Cache abierto');
        return cache.addAll(urlsToCache).catch(error => {
          console.log('❌ Error cacheando recursos:', error);
        });
      })
      .then(() => {
        console.log('✅ Todos los recursos cacheados');
        return self.skipWaiting();
      })
  );
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker activado');
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

// Interceptar peticiones
self.addEventListener('fetch', (event) => {
  // No cachear peticiones a Firebase (manejo dinámico)
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('googleapis') ||
      event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Si está en cache, devolverlo
        if (response) {
          console.log('📦 Servido desde cache:', event.request.url);
          return response;
        }

        // Si no está en cache, buscar en la red
        return fetch(event.request)
          .then((response) => {
            // Verificar si la respuesta es válida
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clonar la respuesta para cachear
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // Si falla la red y es una página, mostrar offline.html
            if (event.request.destination === 'document') {
              return caches.match('/offline.html');
            }
            // Para otros recursos, devolver null
            return null;
          });
      })
  );
});

// Manejar mensajes desde la app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
