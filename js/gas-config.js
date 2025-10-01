// =============================================
// CONFIGURACIÓN DE GOOGLE SHEETS API v4
// =============================================

const API_KEY = 'AIzaSyAsBdhcY48jMt-PE259q1QRYj_KhlWPjq4'; // Reemplaza con tu API Key
const SPREADSHEET_ID = '1ei2I56i9GKRV6IGO8TTJV9PqYUAZ_MzVQrJ0vB01vLM';

// Función para obtener datos de una hoja
async function obtenerDatosDeSheet(nombreHoja) {
    console.log(`🔍 Obteniendo datos de: ${nombreHoja}`);
    
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${nombreHoja}?key=${API_KEY}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.values || data.values.length === 0) {
            return [];
        }
        
        // Convertir array de arrays a array de objetos
        const headers = data.values[0];
        const registros = [];
        
        for (let i = 1; i < data.values.length; i++) {
            const registro = {};
            for (let j = 0; j < headers.length; j++) {
                registro[headers[j]] = data.values[i][j];
            }
            registros.push(registro);
        }
        
        console.log(`✅ ${registros.length} registros obtenidos de ${nombreHoja}`);
        return registros;
        
    } catch (error) {
        console.error(`❌ Error obteniendo ${nombreHoja}:`, error);
        throw error;
    }
}

// Función para guardar datos en una hoja
async function guardarDatosEnSheet(nombreHoja, datos) {
    console.log(`💾 Guardando ${datos.length} registros en: ${nombreHoja}`);
    
    try {
        // Primero obtener los headers existentes o crear nuevos
        let headers;
        try {
            const datosExistentes = await obtenerDatosDeSheet(nombreHoja);
            if (datosExistentes.length > 0) {
                headers = Object.keys(datosExistentes[0]);
            } else {
                headers = Object.keys(datos[0]);
            }
        } catch (error) {
            // Si la hoja no existe, usar los headers del primer registro
            headers = Object.keys(datos[0]);
        }
        
        // Convertir datos a formato de Sheets
        const valores = [headers]; // Headers
        
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
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        console.log(`✅ ${datos.length} registros guardados en ${nombreHoja}`);
        return { success: true, registros: datos.length };
        
    } catch (error) {
        console.error(`❌ Error guardando en ${nombreHoja}:`, error);
        throw error;
    }
}

// Función específica para usuarios
async function obtenerUsuariosDesdeSheets() {
    try {
        const usuarios = await obtenerDatosDeSheet('usuarios');
        
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
        
        // Guardar en localStorage como backup
        localStorage.setItem('finzana-users', JSON.stringify(usuariosObj));
        
        return usuariosObj;
        
    } catch (error) {
        console.log('❌ Error obteniendo usuarios de Sheets, usando localStorage');
        return obtenerUsuariosDesdeLocalStorage();
    }
}

// Función de fallback a localStorage
function obtenerUsuariosDesdeLocalStorage() {
    try {
        const usersLocal = localStorage.getItem('finzana-users');
        if (usersLocal) {
            return JSON.parse(usersLocal);
        }
    } catch (error) {
        console.error('Error leyendo usuarios locales:', error);
    }
    
    return crearUsuariosPorDefecto();
}

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
    
    localStorage.setItem('finzana-users', JSON.stringify(defaultUsers));
    return defaultUsers;
}
