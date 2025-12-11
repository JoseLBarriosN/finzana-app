// firebase-config.js - Configuración separada de Firebase
console.log('🔥 Cargando configuración de Firebase...');

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBNt_JKONVgOXS4fgJrj3qldb1JBdOgPoE",
    authDomain: "finzana-app.firebaseapp.com",
    projectId: "finzana-app",
    storageBucket: "finzana-app.firebasestorage.app",
    messagingSenderId: "779745085151",
    appId: "1:779745085151:web:2d470408b6267e3e16cb6a"
};

// Inicializar Firebase
try {
    // Verificamos si ya existe una instancia para evitar errores de doble inicialización
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log('✅ Firebase inicializado correctamente');
    }
} catch (error) {
    console.error('❌ Error inicializando Firebase:', error);
}

// Hacer disponibles las variables globalmente
const auth = firebase.auth();
const db = firebase.firestore();

// ===== PERSISTENCIA DE SESIÓN Y DATOS (OFFLINE) =====

// 1. Configurar persistencia de autenticación (Para no pedir login sin internet)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => {
        console.log("✅ Persistencia LOCAL de sesión establecida.");
        
        // 2. Habilitar persistencia de Firestore (Base de datos Offline)
        // IMPORTANTE: synchronizeTabs: true evita el error de múltiples pestañas
        return db.enablePersistence({ synchronizeTabs: true });
    })
    .then(() => {
        console.log('✅ Persistencia offline de Firestore activada correctamente');
    })
    .catch((err) => {
        let message = '';
        if (err.code === 'failed-precondition') {
            message = '⚠️ Error Persistencia: Múltiples pestañas abiertas. Cierra las otras para activar modo offline.';
            console.warn(message);
        } else if (err.code === 'unimplemented') {
            message = '⚠️ El navegador no soporta persistencia offline.';
            console.warn(message);
        } else {
            message = `❌ Error desconocido en persistencia: ${err.message}`;
            console.error(message);
        }
    });
