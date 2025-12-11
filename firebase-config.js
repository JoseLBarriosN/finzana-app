// firebase-config.js - Configuración ROBUSTA y ORDENADA
console.log('🔥 Cargando configuración de Firebase...');

const firebaseConfig = {
    apiKey: "AIzaSyBNt_JKONVgOXS4fgJrj3qldb1JBdOgPoE",
    authDomain: "finzana-app.firebaseapp.com",
    projectId: "finzana-app",
    storageBucket: "finzana-app.firebasestorage.app",
    messagingSenderId: "779745085151",
    appId: "1:779745085151:web:2d470408b6267e3e16cb6a"
};

// 1. Inicializar App
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else {
    firebase.app();
}

// 2. Definir instancias
const auth = firebase.auth();
const db = firebase.firestore();

// 3. CONFIGURACIÓN DE FIRESTORE (CRÍTICO: HACERLO AQUÍ, ANTES DE CUALQUIER OTRA COSA)
// Esto debe ejecutarse síncronamente antes de cualquier llamada a la BD
try {
    db.settings({
        cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
        merge: true,
        ignoreUndefinedProperties: true
    });
} catch (e) {
    console.warn("⚠️ Firestore settings ya aplicados o error:", e.message);
}

// 4. Habilitar Persistencia Offline (Datos)
/*db.enablePersistence({ synchronizeTabs: true })
    .then(() => console.log("✅ [DB] Persistencia Offline ACTIVADA"))
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn("⚠️ [DB] Múltiples pestañas abiertas. Cierra las demás.");
        } else if (err.code == 'unimplemented') {
            console.warn("⚠️ [DB] Navegador no compatible.");
        }
    });*/

// 5. Configurar Persistencia de Auth (Sesión)
// Esto puede correr en paralelo sin afectar a Firestore
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => console.log("✅ [Auth] Persistencia LOCAL activada"))
    .catch((error) => console.error("❌ [Auth] Fallo persistencia:", error));

