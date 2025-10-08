const CACHE_NAME = 'finzana-cache-v3'; // Versión actualizada para forzar la actualización
// Lista de archivos que componen la aplicación para que funcione offline
const urlsToCache = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/database.js',
  '/assets/logo.png',
  '/assets/logo_192.png',
  '/assets/logo_512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js'
];

// Evento de instalación: se abre la caché y se guardan los archivos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierta y guardando archivos de la app');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento de activación: limpia las cachés antiguas
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Eliminando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Evento fetch: intercepta las peticiones de red
self.addEventListener('fetch', event => {
    // CORRECCIÓN CRÍTICA: Ignorar las peticiones que no son GET (como POST para el login)
    // y las peticiones a los servicios de Google/Firebase.
    // Esto permite que el inicio de sesión y otras operaciones de Firebase funcionen correctamente.
    if (event.request.method !== 'GET' || event.request.url.includes('googleapis.com')) {
        // Dejar que el navegador maneje estas peticiones normalmente.
        return;
    }

    // Estrategia: Network falling back to Cache.
    // Intenta ir a la red primero para obtener la versión más fresca.
    // Si la red falla (estás offline), sirve la versión de la caché.
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
