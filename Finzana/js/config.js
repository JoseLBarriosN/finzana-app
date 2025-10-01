// Configuración de Google Sheets API
const GOOGLE_SHEETS_CONFIG = {
    // REEMPLAZA ESTO CON TU API KEY REAL
    API_KEY: 'AIzaSyAsBdhcY48jMt-PE259q1QRYj_KhlWPjq4',

    // ID de tu Google Sheet
    SHEET_ID: '1sLQI0YWLGKSvDMjONkOwIBLY6_0zr7Lk8QUrLcdO-Hc',

    // Nombres de las hojas
    SHEETS: {
        CLIENTAS: 'CLIENTAS',
        COLOCACION: 'COLOCACIÓN',
        COBRANZA: 'COBRANZA',
        TABLAS: 'TABLAS'
    },

    // URLs base para la API
    BASE_URL: 'https://sheets.googleapis.com/v4/spreadsheets'
};

// Función para verificar la configuración
function verificarConfiguracion() {
    if (GOOGLE_SHEETS_CONFIG.API_KEY === 'AIzaSyAsBdhcY48jMt-PE259q1QRYj_KhlWPjq4') {
        console.warn('⚠️  API Key no configurada. Usando modo demo.');
        return false;
    }
    return true;
}