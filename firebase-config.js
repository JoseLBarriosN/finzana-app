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
    firebase.initializeApp(firebaseConfig);
    console.log('✅ Firebase inicializado correctamente');
} catch (error) {
    console.error('❌ Error inicializando Firebase:', error);
}

// Hacer disponibles las variables globalmente
const auth = firebase.auth();
const db = firebase.firestore();

// ===== INICIO DE LA MODIFICACIÓN (Persistencia de SESIÓN) =====
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
    .then(() => {
        console.log("✅ Persistencia de sesión establecida. La sesión se cerrará al cerrar la pestaña.");
        // Habilitar la persistencia de datos de Firestore DESPUÉS de configurar la de Auth.
        return db.enablePersistence();
    })
    .then(() => {
        console.log('✅ Persistencia offline de Firestore activada');
    })
    .catch((err) => {
        let message = '';
        if (err.code === 'failed-precondition') {
            message = 'Error Crítico de Persistencia: La aplicación solo puede estar abierta en una pestaña a la vez para que el modo offline funcione. Por favor, cierra las otras pestañas.';
            console.error(message);
            alert(message);
        } else if (err.code === 'unimplemented') {
            message = '⚠️ Persistencia offline no disponible en este navegador.';
            console.warn(message);
        } else {
            message = `❌ Error en persistencia: ${err.message}`;
            console.error(message);
        }
    });
// ===== FIN DE LA MODIFICACIÓN =====
