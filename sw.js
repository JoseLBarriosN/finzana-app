const CACHE_NAME = 'finzana-cache-v4'; // Versión actualizada para forzar la actualización
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

// Evento de instalación: guarda los archivos del "cascarón" de la app en la caché
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierta y guardando archivos de la app');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento de activación: limpia las cachés antiguas para asegurar que la app se actualice
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

// Evento fetch: decide cómo manejar cada petición (red o caché)
self.addEventListener('fetch', event => {
  // Ignora las peticiones que no son GET (como POST para el login) y las que van a los servicios de Google/Firebase.
  // Esto es CRÍTICO para que el inicio de sesión y la sincronización de datos funcionen siempre.
  if (event.request.method !== 'GET' || event.request.url.includes('googleapis.com')) {
    // Deja que el navegador maneje estas peticiones normalmente.
    return;
  }

  // Estrategia: "Network falling back to Cache" (Red primero, luego caché).
  // Intenta obtener la versión más nueva de la red. Si falla (estás sin conexión),
  // entrega la versión que está guardada en la caché.
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Si la petición a la red fue exitosa, la guardamos en caché para futuras visitas offline
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // Si la red falla, busca la respuesta en la caché
        return caches.match(event.request);
      })
  );
});
