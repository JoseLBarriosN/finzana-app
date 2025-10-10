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

// ===== INICIO DE LA MODIFICACIÓN (Manejo de errores de persistencia mejorado) =====
// Configurar persistencia offline
db.enablePersistence()
    .then(() => {
        console.log('✅ Persistencia offline de Firestore activada');
    })
    .catch((err) => {
        let message = '';
        if (err.code === 'failed-precondition') {
            message = 'Error Crítico de Persistencia: La aplicación solo puede estar abierta en una pestaña a la vez para que el modo offline funcione. Por favor, cierra las otras pestañas.';
            console.error(message);
            alert(message); // Alerta visible para el usuario
        } else if (err.code === 'unimplemented') {
            message = '⚠️ Persistencia offline no disponible en este navegador.';
            console.warn(message);
        } else {
            message = `❌ Error en persistencia offline: ${err.message}`;
            console.error(message);
        }
    });
// ===== FIN DE LA MODIFICACIÓN =====
