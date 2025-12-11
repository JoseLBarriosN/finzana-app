// firebase-config.js - Configuración ROBUSTA para Offline
console.log('🔥 Cargando configuración de Firebase...');

const firebaseConfig = {
    apiKey: "AIzaSyBNt_JKONVgOXS4fgJrj3qldb1JBdOgPoE",
    authDomain: "finzana-app.firebaseapp.com",
    projectId: "finzana-app",
    storageBucket: "finzana-app.firebasestorage.app",
    messagingSenderId: "779745085151",
    appId: "1:779745085151:web:2d470408b6267e3e16cb6a"
};

// 1. Inicializar App (Singleton pattern)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else {
    firebase.app(); // Si ya existe, úsala
}

const auth = firebase.auth();
const db = firebase.firestore();

// 2. CONFIGURACIÓN CRÍTICA DE PERSISTENCIA
// Ejecutamos esto inmediatamente. No esperamos a que cargue la UI.

// A. Persistencia de Firestore (Datos)
// El uso de 'await' aquí no es posible en top-level en todos los navegadores,
// así que usamos .catch para no bloquear, pero lo lanzamos YA.
db.enablePersistence({ synchronizeTabs: true })
    .then(() => console.log("✅ [DB] Persistencia Offline ACTIVADA"))
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn("⚠️ [DB] Múltiples pestañas abiertas. Cierra las demás para modo offline.");
        } else if (err.code == 'unimplemented') {
            console.warn("⚠️ [DB] Navegador no compatible con offline.");
        }
    });

// B. Persistencia de Auth (Login)
// IMPORTANTE: Esto permite entrar sin internet si ya te logueaste antes.
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => console.log("✅ [Auth] Persistencia LOCAL activada"))
    .catch((error) => console.error("❌ [Auth] Fallo persistencia:", error));

// C. Ajustes de Red para Firestore
// Esto ayuda a que Firestore no se quede "colgado" intentando conectar si la red es inestable
db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED, // Guardar todo lo posible
    merge: true
});
