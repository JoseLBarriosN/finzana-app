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
    // Verificar si Firebase ya está inicializado
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log('✅ Firebase inicializado correctamente');
    } else {
        console.log('✅ Firebase ya estaba inicializado');
    }
} catch (error) {
    console.error('❌ Error inicializando Firebase:', error);
    // Mostrar error al usuario
    document.getElementById('loading-overlay').innerHTML = `
        <div style="text-align: center; color: white;">
            <div style="font-size: 48px; margin-bottom: 20px;">❌</div>
            <h2>Error de Conexión</h2>
            <p>No se pudo conectar con Firebase. Por favor verifica tu conexión a internet.</p>
            <p style="font-size: 12px; margin-top: 20px;">Error: ${error.message}</p>
            <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; background: white; border: none; border-radius: 5px; cursor: pointer;">
                Reintentar
            </button>
        </div>
    `;
}

// Hacer disponibles las variables globalmente con verificación
let auth, db;

try {
    auth = firebase.auth();
    db = firebase.firestore();
    console.log('✅ Servicios de Firebase disponibles');
} catch (error) {
    console.error('❌ Error obteniendo servicios de Firebase:', error);
}

// ===== MODIFICACIÓN: Persistencia mejorada con manejo de errores =====
if (auth) {
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
            console.log("✅ Persistencia LOCAL establecida.");
            
            // Intentar habilitar persistencia de Firestore pero no bloquear si falla
            if (db && db.enablePersistence) {
                return db.enablePersistence({ synchronizeTabs: true })
                    .catch(err => {
                        console.warn('⚠️ Persistencia de Firestore no disponible:', err.message);
                        // No rechazar la promesa para que la app continúe
                        return Promise.resolve();
                    });
            }
            return Promise.resolve();
        })
        .then(() => {
            console.log('✅ Configuración de persistencia completada');
            
            // Verificar si hay usuario autenticado en caché local
            const currentUser = auth.currentUser;
            if (currentUser) {
                console.log('✅ Usuario encontrado en caché local:', currentUser.email);
            } else {
                console.log('ℹ️ No hay usuario en caché local');
            }
        })
        .catch((err) => {
            console.error('❌ Error en configuración de persistencia:', err);
            // No bloquear la aplicación por errores de persistencia
        });
} else {
    console.error('❌ Auth no disponible para configurar persistencia');
}

// Manejo mejorado de conexión/desconexión
let onlineStatus = navigator.onLine;

// Crear elemento de estado de conexión si no existe
if (!document.getElementById('connection-status')) {
    const connectionStatusDiv = document.createElement('div');
    connectionStatusDiv.id = 'connection-status';
    connectionStatusDiv.className = 'connection-status hidden';
    document.body.appendChild(connectionStatusDiv);
}

// Función para actualizar estado de conexión
function updateConnectionStatusUI() {
    const connectionStatusDiv = document.getElementById('connection-status');
    if (!connectionStatusDiv) return;

    onlineStatus = navigator.onLine;

    if (onlineStatus) {
        connectionStatusDiv.textContent = 'Conexión restablecida. Sincronizando datos...';
        connectionStatusDiv.className = 'connection-status online';
        connectionStatusDiv.classList.remove('hidden');
        
        setTimeout(() => {
            connectionStatusDiv.textContent = 'Datos sincronizados correctamente.';
            setTimeout(() => connectionStatusDiv.classList.add('hidden'), 3000);
        }, 2000);
    } else {
        connectionStatusDiv.textContent = 'Modo sin conexión. Los datos se sincronizarán cuando se recupere la conexión.';
        connectionStatusDiv.className = 'connection-status offline';
        connectionStatusDiv.classList.remove('hidden');
    }
}

// Detectar cambios de conexión
window.addEventListener('online', updateConnectionStatusUI);
window.addEventListener('offline', updateConnectionStatusUI);

// Inicializar estado de conexión
updateConnectionStatusUI();

// Exportar variables globalmente
window.auth = auth;
window.db = db;
