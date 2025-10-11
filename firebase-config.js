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

// ===== MODIFICACIÓN: Persistencia mejorada para modo offline =====
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => {
        console.log("✅ Persistencia LOCAL establecida. La sesión se mantendrá entre sesiones del navegador.");
        return db.enablePersistence({ synchronizeTabs: true });
    })
    .then(() => {
        console.log('✅ Persistencia offline de Firestore activada');
        
        // Verificar si hay usuario autenticado en caché local
        return auth.currentUser;
    })
    .then((user) => {
        if (user) {
            console.log('✅ Usuario encontrado en caché local:', user.email);
            // El estado de autenticación se actualizará automáticamente en app.js
        }
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

// Manejo mejorado de conexión/desconexión
let onlineStatus = true;
const connectionStatusDiv = document.createElement('div');
connectionStatusDiv.id = 'connection-status';
connectionStatusDiv.className = 'connection-status hidden';
document.body.appendChild(connectionStatusDiv);

// Detectar cambios de conexión
window.addEventListener('online', () => {
    onlineStatus = true;
    connectionStatusDiv.textContent = 'Conexión restablecida. Sincronizando datos...';
    connectionStatusDiv.className = 'connection-status online';
    connectionStatusDiv.classList.remove('hidden');
    
    setTimeout(() => {
        connectionStatusDiv.textContent = 'Datos sincronizados correctamente.';
        setTimeout(() => connectionStatusDiv.classList.add('hidden'), 3000);
    }, 2000);
});

window.addEventListener('offline', () => {
    onlineStatus = false;
    connectionStatusDiv.textContent = 'Modo sin conexión. Los datos se sincronizarán cuando se recupere la conexión.';
    connectionStatusDiv.className = 'connection-status offline';
    connectionStatusDiv.classList.remove('hidden');
});
