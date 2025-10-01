// =============================================
// CONFIGURACIÓN DE GOOGLE APPS SCRIPT - CON MANEJO DE CORS
// =============================================

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxyRj7vlZdUqHIR9SU-KvNF13kVWVgGHlnCPAHfjewrHu_XqoO0S5DfXyiKBkwzsgry/exec';

// Detectar si estamos en un entorno con CORS bloqueado
function isCORSBlocked() {
    return window.location.origin.includes('github.io') || 
           window.location.origin.includes('localhost');
}

// Función inteligente que maneja CORS automáticamente
async function callGoogleAppsScript(accion, tabla, datos = null, campo = null, valor = null) {
    // Si sabemos que CORS está bloqueado, no intentar
    if (isCORSBlocked()) {
        console.log(`🚫 CORS bloqueado - Usando localStorage para: ${accion}`);
        return await callGoogleAppsScriptLocal(accion, tabla, datos, campo, valor);
    }
    
    console.log(`📤 Intentando GAS: ${accion} en ${tabla}`);
    
    try {
        const payload = {
            accion: accion,
            tabla: tabla,
            datos: datos,
            campo: campo,
            valor: valor
        };

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
        console.log(`✅ GAS exitoso: ${accion}`);
        return result;
        
    } catch (error) {
        console.log(`❌ GAS falló (${error.message}) - Usando localStorage`);
        return await callGoogleAppsScriptLocal(accion, tabla, datos, campo, valor);
    }
}

// Función de fallback a localStorage
async function callGoogleAppsScriptLocal(accion, tabla, datos = null, campo = null, valor = null) {
    console.log(`💾 Usando localStorage para: ${accion} en ${tabla}`);
    
    try {
        switch(accion) {
            case 'obtener_todos':
                const data = localStorage.getItem(`finzana-${tabla}`);
                return { 
                    success: true, 
                    data: data ? JSON.parse(data) : [] 
                };
                
            case 'guardar_lote':
                if (datos && Array.isArray(datos)) {
                    localStorage.setItem(`finzana-${tabla}`, JSON.stringify(datos));
                    return { 
                        success: true, 
                        data: { 
                            mensaje: `Datos guardados localmente: ${datos.length} registros`,
                            registros: datos.length 
                        } 
                    };
                }
                return { success: false, error: 'Datos inválidos' };
                
            case 'buscar':
                const allData = localStorage.getItem(`finzana-${tabla}`);
                if (!allData) return { success: true, data: null };
                
                const records = JSON.parse(allData);
                const found = records.find(record => record[campo] == valor);
                return { success: true, data: found || null };
                
            case 'limpiar_tabla':
                localStorage.removeItem(`finzana-${tabla}`);
                return { 
                    success: true, 
                    data: { mensaje: 'Tabla limpiada localmente' } 
                };
                
            default:
                return { success: false, error: 'Acción no soportada en modo local' };
        }
    } catch (error) {
        console.error('Error en modo local:', error);
        return { success: false, error: error.message };
    }
}

// Función específica para usuarios que SIEMPRE funciona
async function obtenerUsuariosConFallback() {
    console.log('🔍 Obteniendo usuarios (con fallback automático)...');
    
    // Primero intentar con GAS
    try {
        const resultadoGAS = await callGoogleAppsScript('obtener_todos', 'usuarios');
        
        if (resultadoGAS.success && resultadoGAS.data && resultadoGAS.data.length > 0) {
            console.log(`✅ ${resultadoGAS.data.length} usuarios desde GAS`);
            
            // Convertir a formato de objeto
            const usuariosObj = {};
            resultadoGAS.data.forEach(usuario => {
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
        }
    } catch (error) {
        console.log('❌ GAS falló, usando localStorage...');
    }
    
    // Fallback a localStorage
    const usuariosLocal = localStorage.getItem('finzana-users');
    if (usuariosLocal) {
        const usuarios = JSON.parse(usuariosLocal);
        console.log(`💾 ${Object.keys(usuarios).length} usuarios desde localStorage`);
        return usuarios;
    }
    
    // Último recurso: usuarios por defecto
    console.log('🆕 Creando usuarios por defecto...');
    return crearUsuariosPorDefecto();
}

// Crear usuarios por defecto
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
    console.log('✅ Usuarios por defecto creados en localStorage');
    return defaultUsers;
}
