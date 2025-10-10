// sw.js - Service Worker para Finzana
const CACHE_NAME = 'finzana-v1.0.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/database.js',
  '/favicon.ico',
  '/assets/logo.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js'
];

// Instalación del Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker instalándose...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Todos los recursos cacheados correctamente');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Error durante la instalación:', error);
      })
  );
});

// Activación del Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker activado');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker listo para controlar clientes');
      return self.clients.claim();
    })
  );
});

// Estrategia: Cache First, luego Network
self.addEventListener('fetch', event => {
  // Excluir las llamadas a Firebase de la cache
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('googleapis') ||
      event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Devuelve la respuesta cacheada o busca en la red
        if (response) {
          console.log('Servido desde cache:', event.request.url);
          return response;
        }

        return fetch(event.request).then(response => {
          // Verifica si recibimos una respuesta válida
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clona la respuesta para guardarla en cache
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
      .catch(error => {
        console.error('Error en fetch:', error);
        // En caso de error, puedes devolver una página offline personalizada
        if (event.request.destination === 'document') {
          return caches.match('/offline.html');
        }
      })
  );
});

// Sincronización en segundo plano cuando hay conexión
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    console.log('Sincronización en segundo plano iniciada');
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Aquí puedes agregar lógica para sincronizar datos pendientes
  // cuando se recupera la conexión
  console.log('Sincronizando datos pendientes...');
}
