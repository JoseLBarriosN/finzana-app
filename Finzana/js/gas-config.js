// =============================================
// CONFIGURACIÓN DE GOOGLE APPS SCRIPT - PRODUCCIÓN
// =============================================

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxyRj7vlZdUqHIR9SU-KvNF13kVWVgGHlnCPAHfjewrHu_XqoO0S5DfXyiKBkwzsgry/exec';

// Función para hacer peticiones a Google Apps Script
async function callGoogleAppsScript(accion, tabla, datos = null, campo = null, valor = null) {
    try {
        const payload = {
            accion: accion,
            tabla: tabla,
            datos: datos,
            campo: campo,
            valor: valor
        };

        console.log(`Enviando petición a GAS: ${accion} en ${tabla}`);

        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const result = await response.json();
        return result;

    } catch (error) {
        console.error('Error conectando con Google Apps Script:', error);

        // En producción, podemos intentar una estrategia de reintento
        if (accion === 'obtener_todos') {
            return { success: false, error: error.message, data: [] };
        }

        return { success: false, error: error.message };
    }
}

// Verificar si estamos en desarrollo o producción
function getEnvironment() {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'development';
    }
    return 'production';
}

// Función para probar la conexión con GAS
async function testGASConnection() {
    try {
        const testPayload = {
            accion: 'obtener_todos',
            tabla: 'usuarios'
        };

        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testPayload)
        });

        return response.ok;
    } catch (error) {
        return false;
    }
}