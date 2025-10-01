// =============================================
// CONFIGURACIÓN DE GOOGLE SHEETS API v4
// =============================================

// REEMPLAZA ESTA API_KEY CON LA QUE OBTUVISTE DE GOOGLE CLOUD
const API_KEY = 'AIzaSyAsBdhcY48jMt-PE259q1QRYj_KhlWPjq4';
const SPREADSHEET_ID = '1ei2I56i9GKRV6IGO8TTJV9PqYUAZ_MzVQrJ0vB01vLM';

// Función para verificar la conexión con Sheets API
async function verificarConexionSheetsAPI() {
    console.log('🔌 Probando conexión con Google Sheets API...');
    
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?key=${API_KEY}`;
        
        const response = await fetch(url);
        
        if (response.ok) {
            console.log('✅ Conexión con Google Sheets API exitosa');
            return true;
        } else {
            console.log('❌ Error en la conexión:', response.status);
            return false;
        }
    } catch (error) {
        console.log('❌ Error de conexión:', error.message);
        return false;
    }
}

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
        throw error;
    }
}

// Función para guardar datos en una hoja
async function guardarDatosEnSheet(nombreHoja, datos) {
    console.log(`💾 Guardando ${datos.length} registros en: ${nombreHoja}`);
    
    try {
        // Si no hay datos, no hacer nada
        if (!datos || datos.length === 0) {
            console.log('ℹ️ No hay datos para guardar');
            return { success: true, registros: 0 };
        }
        
        // Obtener headers de los datos
        const headers = Object.keys(datos[0]);
        
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
            const errorData = await response.json();
            throw new Error(`Error HTTP ${response.status}: ${JSON.stringify(errorData)}`);
        }
        
        console.log(`✅ ${datos.length} registros guardados en ${nombreHoja}`);
        return { success: true, registros: datos.length };
        
    } catch (error) {
        console.error(`❌ Error guardando en ${nombreHoja}:`, error.message);
        throw error;
    }
}

// Función para agregar datos a una hoja (sin borrar existentes)
async function agregarDatosASheet(nombreHoja, nuevosDatos) {
    console.log(`📝 Agregando ${nuevosDatos.length} registros a: ${nombreHoja}`);
    
    try {
        // Obtener datos existentes
        const datosExistentes = await obtenerDatosDeSheet(nombreHoja);
        const todosLosDatos = [...datosExistentes, ...nuevosDatos];
        
        // Guardar todos los datos
        return await guardarDatosEnSheet(nombreHoja, todosLosDatos);
        
    } catch (error) {
        console.error(`❌ Error agregando datos a ${nombreHoja}:`, error.message);
        throw error;
    }
}

// =============================================
// FUNCIONES ESPECÍFICAS PARA USUARIOS
// =============================================

async function obtenerUsuariosDesdeSheets() {
    try {
        console.log('🔍 Obteniendo usuarios desde Google Sheets...');
        const usuarios = await obtenerDatosDeSheet('usuarios');
        
        if (usuarios.length === 0) {
            console.log('ℹ️ No hay usuarios en Sheets, creando usuarios por defecto...');
            const usuariosPorDefecto = await crearUsuariosPorDefectoEnSheets();
            return usuariosPorDefecto;
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
        
        // Validar que tenemos usuarios válidos
        if (Object.keys(usuariosObj).length === 0) {
            console.log('⚠️ Usuarios en Sheets tienen estructura inválida, creando por defecto...');
            return await crearUsuariosPorDefectoEnSheets();
        }
        
        console.log(`✅ ${Object.keys(usuariosObj).length} usuarios válidos obtenidos de Sheets`);
        
        // Guardar en localStorage como backup
        localStorage.setItem('finzana-users', JSON.stringify(usuariosObj));
        
        return usuariosObj;
        
    } catch (error) {
        console.log('❌ Error obteniendo usuarios de Sheets:', error.message);
        console.log('🔄 Usando usuarios de localStorage...');
        return obtenerUsuariosDesdeLocalStorage();
    }
}

async function crearUsuariosPorDefectoEnSheets() {
    const usuariosPorDefecto = [
        {
            username: 'admin',
            password: 'admin123',
            name: 'Administrador Principal',
            role: 'admin',
            email: 'admin@finzana.com',
            telefono: '',
            fechaCreacion: new Date().toISOString()
        },
        {
            username: 'supervisor',
            password: 'super123',
            name: 'Supervisor Regional',
            role: 'supervisor',
            email: 'supervisor@finzana.com',
            telefono: '',
            fechaCreacion: new Date().toISOString()
        },
        {
            username: 'cobrador1',
            password: 'cobra123',
            name: 'Carlos Martínez - Cobrador JC1',
            role: 'cobrador',
            email: 'carlos@finzana.com',
            telefono: '333-123-4567',
            fechaCreacion: new Date().toISOString()
        },
        {
            username: 'consulta',
            password: 'consulta123',
            name: 'Usuario de Consulta',
            role: 'consulta',
            email: 'consulta@finzana.com',
            telefono: '',
            fechaCreacion: new Date().toISOString()
        }
    ];
    
    try {
        await guardarDatosEnSheet('usuarios', usuariosPorDefecto);
        console.log('✅ Usuarios por defecto creados en Google Sheets');
        
        // Convertir a formato de objeto
        const usuariosObj = {};
        usuariosPorDefecto.forEach(usuario => {
            usuariosObj[usuario.username] = usuario;
        });
        
        // Guardar en localStorage
        localStorage.setItem('finzana-users', JSON.stringify(usuariosObj));
        
        return usuariosObj;
        
    } catch (error) {
        console.log('❌ No se pudieron crear usuarios en Sheets, usando localStorage');
        return crearUsuariosPorDefectoLocal();
    }
}

function obtenerUsuariosDesdeLocalStorage() {
    try {
        const usersLocal = localStorage.getItem('finzana-users');
        if (usersLocal) {
            const usuarios = JSON.parse(usersLocal);
            console.log(`💾 ${Object.keys(usuarios).length} usuarios obtenidos de localStorage`);
            return usuarios;
        }
    } catch (error) {
        console.error('Error leyendo usuarios locales:', error);
    }
    
    console.log('🆕 Creando usuarios por defecto en localStorage...');
    return crearUsuariosPorDefectoLocal();
}

function crearUsuariosPorDefectoLocal() {
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
    console.log('✅ 4 usuarios por defecto creados en localStorage');
    return defaultUsers;
}

// Función para guardar usuarios
async function guardarUsuariosEnSheets(users) {
    try {
        // Convertir objeto a array
        const usersArray = Object.entries(users).map(([username, userData]) => ({
            username: username,
            ...userData
        }));
        
        await guardarDatosEnSheet('usuarios', usersArray);
        console.log('✅ Usuarios guardados en Google Sheets');
        return true;
        
    } catch (error) {
        console.log('❌ No se pudieron guardar usuarios en Sheets:', error.message);
        return false;
    }
}

// =============================================
// FUNCIONES PARA OTRAS TABLAS
// =============================================

async function obtenerClientesDesdeSheets() {
    try {
        return await obtenerDatosDeSheet('clientes');
    } catch (error) {
        console.log('❌ Error obteniendo clientes de Sheets, usando localStorage');
        return obtenerDatosLocales('clientes');
    }
}

async function guardarClientesEnSheets(clientes) {
    try {
        return await guardarDatosEnSheet('clientes', clientes);
    } catch (error) {
        console.log('❌ Error guardando clientes en Sheets:', error.message);
        return { success: false, error: error.message };
    }
}

// Funciones auxiliares para localStorage
function obtenerDatosLocales(tabla) {
    try {
        const datosLocal = localStorage.getItem(`finzana-${tabla}`);
        return datosLocal ? JSON.parse(datosLocal) : [];
    } catch (error) {
        console.error(`Error leyendo ${tabla} locales:`, error);
        return [];
    }
}

function guardarDatosLocales(tabla, datos) {
    try {
        localStorage.setItem(`finzana-${tabla}`, JSON.stringify(datos));
        return true;
    } catch (error) {
        console.error(`Error guardando ${tabla} locales:`, error);
        return false;
    }
}
