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

// Configurar persistencia offline
db.enablePersistence()
  .then(() => {
    console.log('✅ Persistencia offline de Firestore activada');
  })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('⚠️ Persistencia offline falló: Múltiples pestañas abiertas');
    } else if (err.code === 'unimplemented') {
      console.warn('⚠️ Persistencia offline no disponible en este navegador');
    } else {
      console.error('❌ Error en persistencia offline:', err);
    }
  });