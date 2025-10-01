// =============================================
// CONFIGURACIÓN DE GOOGLE SHEETS API v4 - CON MANEJO MEJORADO DE ERRORES
// =============================================

// REEMPLAZA CON TU API KEY
const API_KEY = 'AIzaSyAsBdhcY48jMt-PE259q1QRYj_KhlWPjq4';
const SPREADSHEET_ID = '1ei2I56i9GKRV6IGO8TTJV9PqYUAZ_MzVQrJ0vB01vLM';

// Variable global para controlar el modo
let MODO_SHEETS_DISPONIBLE = false;

// Función para verificar la conexión con Sheets API
async function verificarConexionSheetsAPI() {
    console.log('🔌 Probando conexión con Google Sheets API...');
    
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?key=${API_KEY}`;
        
        const response = await fetch(url);
        
        if (response.ok) {
            console.log('✅ Conexión con Google Sheets API exitosa');
            MODO_SHEETS_DISPONIBLE = true;
            return true;
        } else {
            console.log('❌ Error en la conexión:', response.status, response.statusText);
            MODO_SHEETS_DISPONIBLE = false;
            return false;
        }
    } catch (error) {
        console.log('❌ Error de conexión:', error.message);
        MODO_SHEETS_DISPONIBLE = false;
        return false;
    }
}

// Función para obtener datos de una hoja
async function obtenerDatosDeSheet(nombreHoja) {
    if (!MODO_SHEETS_DISPONIBLE) {
        throw new Error('Modo Sheets no disponible');
    }
    
    console.log(`🔍 Obteniendo datos de: ${nombreHoja}`);
    
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${nombreHoja}?key=${API_KEY}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            if (response.status === 403) {
                console.log('🔒 Error 403: Permisos insuficientes para Google Sheets API');
                MODO_SHEETS_DISPONIBLE = false;
            }
            throw new Error(`Error HTTP: ${response.status} - ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.values || data.values.length === 0) {
            console.log(`ℹ️ Hoja ${nombreHoja} está vacía`);
            return [];
        }
        
        // Convertir array de arrays a array de objetos
        const headers = data.values[0];
        const registros = [];
        
        for (let i = 1; i < data.values.length; i++) {
            const registro = {};
            for (let j = 0; j < headers.length; j++) {
                registro[headers[j]] = data.values[i][j] || '';
            }
            registros.push(registro);
        }
        
        console.log(`✅ ${registros.length} registros obtenidos de ${nombreHoja}`);
        return registros;
        
    } catch (error) {
        console.error(`❌ Error obteniendo ${nombreHoja}:`, error.message);
        MODO_SHEETS_DISPONIBLE = false;
        throw error;
    }
}

// =============================================
// SISTEMA HÍBRIDO - SHEETS + LOCALSTORAGE
// =============================================

// Función principal para obtener usuarios
async function obtenerUsuariosConSheets() {
    console.log('👥 Sistema híbrido: Intentando obtener usuarios...');
    
    // Primero verificar conexión
    const conexionOk = await verificarConexionSheetsAPI();
    
    if (!conexionOk) {
        console.log('🌐 Sheets API no disponible, usando localStorage');
        return obtenerUsuariosDesdeLocalStorage();
    }
    
    try {
        console.log('🔍 Intentando desde Google Sheets...');
        const usuarios = await obtenerDatosDeSheet('usuarios');
        
        if (usuarios.length === 0) {
            console.log('📝 No hay usuarios en Sheets, creando por defecto...');
            return await crearUsuariosPorDefecto();
        }
        
        // Convertir a formato de objeto
        const usuariosObj = {};
        usuarios.forEach(usuario => {
            if (usuario.username && usuario.password) {
                usuariosObj[usuario.username] = {
                    password: usuario.password,
                    name: usuario.name || usuario.username,
                    role: usuario.role || 'consulta',
                    email: usuario.email || '',
                    telefono: usuario.telefono || '',
                    fechaCreacion: usuario.fechaCreacion || new Date().toISOString()
                };
            }
        });
        
        if (Object.keys(usuariosObj).length === 0) {
            console.log('⚠️ Usuarios en Sheets tienen estructura inválida');
            return await crearUsuariosPorDefecto();
        }
        
        console.log(`✅ ${Object.keys(usuariosObj).length} usuarios desde Sheets`);
        
        // Sincronizar con localStorage
        localStorage.setItem('finzana-users', JSON.stringify(usuariosObj));
        
        return usuariosObj;
        
    } catch (error) {
        console.log('❌ Error con Sheets API, usando localStorage:', error.message);
        return obtenerUsuariosDesdeLocalStorage();
    }
}

// Función para obtener usuarios desde localStorage
function obtenerUsuariosDesdeLocalStorage() {
    try {
        const usersLocal = localStorage.getItem('finzana-users');
        if (usersLocal) {
            const usuarios = JSON.parse(usersLocal);
            const usuariosValidos = {};
            
            // Validar estructura
            Object.entries(usuarios).forEach(([username, userData]) => {
                if (username && userData && userData.password && userData.name && userData.role) {
                    usuariosValidos[username] = userData;
                }
            });
            
            if (Object.keys(usuariosValidos).length > 0) {
                console.log(`💾 ${Object.keys(usuariosValidos).length} usuarios desde localStorage`);
                return usuariosValidos;
            }
        }
    } catch (error) {
        console.error('Error leyendo usuarios locales:', error);
    }
    
    console.log('🆕 Creando usuarios por defecto...');
    return crearUsuariosPorDefecto();
}

// Función para crear usuarios por defecto
function crearUsuariosPorDefecto() {
    const defaultUsers = {
        'admin': {
            password: 'admin123',
            name: 'Administrador Principal',
            role: 'admin',
            email: 'admin@finzana.com',
            telefono: '',
            fechaCreacion: new Date().toISOString()
        },
        'supervisor': {
            password: 'super123',
            name: 'Supervisor Regional',
            role: 'supervisor',
            email: 'supervisor@finzana.com',
            telefono: '',
            fechaCreacion: new Date().toISOString()
        },
        'cobrador1': {
            password: 'cobra123',
            name: 'Carlos Martínez - Cobrador JC1',
            role: 'cobrador',
            email: 'carlos@finzana.com',
            telefono: '333-123-4567',
            fechaCreacion: new Date().toISOString()
        },
        'consulta': {
            password: 'consulta123',
            name: 'Usuario de Consulta',
            role: 'consulta',
            email: 'consulta@finzana.com',
            telefono: '',
            fechaCreacion: new Date().toISOString()
        }
    };
    
    // Guardar en localStorage
    localStorage.setItem('finzana-users', JSON.stringify(defaultUsers));
    console.log('✅ 4 usuarios por defecto creados en localStorage');
    
    return defaultUsers;
}

// Función para guardar usuarios
async function guardarUsuarios(users) {
    try {
        // Validar usuarios
        const validUsers = {};
        Object.entries(users).forEach(([username, userData]) => {
            if (username && userData && userData.password && userData.name && userData.role) {
                validUsers[username] = userData;
            }
        });
        
        // Guardar en localStorage siempre
        localStorage.setItem('finzana-users', JSON.stringify(validUsers));
        console.log(`💾 ${Object.keys(validUsers).length} usuarios guardados en localStorage`);
        
        // Intentar guardar en Sheets si está disponible
        if (MODO_SHEETS_DISPONIBLE) {
            try {
                const usersArray = Object.entries(validUsers).map(([username, userData]) => ({
                    username: username,
                    ...userData
                }));
                
                await guardarDatosEnSheet('usuarios', usersArray);
                console.log('✅ Usuarios sincronizados con Google Sheets');
            } catch (error) {
                console.log('⚠️ No se pudo sincronizar con Google Sheets');
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error guardando usuarios:', error);
        return false;
    }
}

// Función para guardar datos en Sheets (solo si está disponible)
async function guardarDatosEnSheet(nombreHoja, datos) {
    if (!MODO_SHEETS_DISPONIBLE) {
        console.log(`📝 Modo Sheets no disponible, solo guardando en localStorage`);
        return { success: true, registros: datos.length };
    }
    
    try {
        if (!datos || datos.length === 0) {
            return { success: true, registros: 0 };
        }
        
        const headers = Object.keys(datos[0]);
        const valores = [headers];
        
        datos.forEach(registro => {
            const fila = headers.map(header => registro[header] || '');
            valores.push(fila);
        });
        
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${nombreHoja}?valueInputOption=RAW&key=${API_KEY}`;
        
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                values: valores
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }
        
        console.log(`✅ ${datos.length} registros guardados en ${nombreHoja}`);
        return { success: true, registros: datos.length };
        
    } catch (error) {
        console.error(`❌ Error guardando en ${nombreHoja}:`, error.message);
        MODO_SHEETS_DISPONIBLE = false;
        throw error;
    }
}
