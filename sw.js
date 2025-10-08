const CACHE_NAME = 'finzana-cache-v1';
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

// Evento fetch: intercepta las peticiones de red
self.addEventListener('fetch', event => {
  event.respondWith(
    // Intenta encontrar la respuesta en la caché primero
    caches.match(event.request)
      .then(response => {
        // Si está en caché, la devuelve. Si no, busca en la red.
        return response || fetch(event.request);
      })
  );
});
