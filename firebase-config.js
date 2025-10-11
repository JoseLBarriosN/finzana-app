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
}

// Hacer disponibles las variables globalmente
const auth = firebase.auth();
const db = firebase.firestore();

// Configurar persistencia de forma más robusta
const initializePersistence = async () => {
    try {
        console.log('🔄 Configurando persistencia...');
        
        // Configurar persistencia de autenticación
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        console.log("✅ Persistencia LOCAL establecida");
        
        // Configurar persistencia de Firestore
        try {
            await db.enablePersistence({ synchronizeTabs: false });
            console.log('✅ Persistencia offline de Firestore activada');
        } catch (persistenceError) {
            if (persistenceError.code === 'failed-precondition') {
                console.warn('⚠️ Persistencia no disponible: Múltiples pestañas abiertas');
            } else if (persistenceError.code === 'unimplemented') {
                console.warn('⚠️ Persistencia no disponible en este navegador');
            } else {
                console.warn('⚠️ Persistencia no disponible:', persistenceError.message);
            }
        }
        
        console.log('✅ Configuración de persistencia completada');
        
    } catch (error) {
        console.error('❌ Error en configuración de persistencia:', error);
    }
};

// Inicializar persistencia cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePersistence);
} else {
    initializePersistence();
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

const updateConnectionUI = () => {
    const connectionStatusDiv = document.getElementById('connection-status');
    if (!connectionStatusDiv) return;

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
};

// Detectar cambios de conexión
window.addEventListener('online', () => {
    onlineStatus = true;
    console.log('🌐 Conexión online detectada');
    updateConnectionUI();
});

window.addEventListener('offline', () => {
    onlineStatus = false;
    console.log('📴 Conexión offline detectada');
    updateConnectionUI();
});

// Verificar estado inicial
updateConnectionUI();
