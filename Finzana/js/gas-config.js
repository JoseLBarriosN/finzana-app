// =============================================
// CONFIGURACIÓN DE GOOGLE APPS SCRIPT
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

        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error conectando con Google Apps Script:', error);
        return { success: false, error: error.message };
    }
}

// =============================================
// SISTEMA DE MIGRACIÓN DE DATOS LOCALES
// =============================================

class MigradorDatos {
    static async migrarTodo() {
        try {
            showStatus('status_migracion', 'Iniciando migración de datos...', 'info');
            
            // Obtener datos locales
            const clientesLocales = JSON.parse(localStorage.getItem('finzana-clientes') || '[]');
            const creditosLocales = JSON.parse(localStorage.getItem('finzana-creditos') || '[]');
            const pagosLocales = JSON.parse(localStorage.getItem('finzana-pagos') || '[]');
            const usuariosLocales = JSON.parse(localStorage.getItem('finzana-users') || '{}');
            
            let totalMigrados = 0;
            let errores = [];

            // Migrar usuarios
            if (Object.keys(usuariosLocales).length > 0) {
                const usuariosArray = Object.entries(usuariosLocales).map(([username, userData]) => ({
                    username: username,
                    ...userData
                }));
                
                const resultadoUsuarios = await callGoogleAppsScript('guardar_lote', 'usuarios', usuariosArray);
                if (resultadoUsuarios.success) {
                    totalMigrados += usuariosArray.length;
                    showStatus('status_migracion', `Usuarios migrados: ${usuariosArray.length}`, 'success');
                } else {
                    errores.push('Error migrando usuarios');
                }
            }

            // Migrar clientes
            if (clientesLocales.length > 0) {
                const resultadoClientes = await callGoogleAppsScript('guardar_lote', 'clientes', clientesLocales);
                if (resultadoClientes.success) {
                    totalMigrados += clientesLocales.length;
                    showStatus('status_migracion', `Clientes migrados: ${clientesLocales.length}`, 'success');
                } else {
                    errores.push('Error migrando clientes');
                }
            }

            // Migrar créditos
            if (creditosLocales.length > 0) {
                const resultadoCreditos = await callGoogleAppsScript('guardar_lote', 'creditos', creditosLocales);
                if (resultadoCreditos.success) {
                    totalMigrados += creditosLocales.length;
                    showStatus('status_migracion', `Créditos migrados: ${creditosLocales.length}`, 'success');
                } else {
                    errores.push('Error migrando créditos');
                }
            }

            // Migrar pagos
            if (pagosLocales.length > 0) {
                const resultadoPagos = await callGoogleAppsScript('guardar_lote', 'pagos', pagosLocales);
                if (resultadoPagos.success) {
                    totalMigrados += pagosLocales.length;
                    showStatus('status_migracion', `Pagos migrados: ${pagosLocales.length}`, 'success');
                } else {
                    errores.push('Error migrando pagos');
                }
            }

            if (errores.length === 0) {
                showStatus('status_migracion', `Migración completada: ${totalMigrados} registros migrados exitosamente`, 'success');
                
                // Opcional: limpiar datos locales después de migración exitosa
                if (confirm('¿Deseas limpiar los datos locales después de la migración exitosa?')) {
                    localStorage.removeItem('finzana-clientes');
                    localStorage.removeItem('finzana-creditos');
                    localStorage.removeItem('finzana-pagos');
                    localStorage.removeItem('finzana-users');
                    showStatus('status_migracion', 'Datos locales limpiados', 'info');
                }
            } else {
                showStatus('status_migracion', `Migración completada con errores: ${errores.join(', ')}`, 'error');
            }

        } catch (error) {
            console.error('Error en migración:', error);
            showStatus('status_migracion', `Error durante la migración: ${error.message}`, 'error');
        }
    }

    static async limpiarTablasRemotas() {
        if (confirm('¿Estás seguro de que deseas limpiar todas las tablas en Google Sheets? Esta acción no se puede deshacer.')) {
            try {
                const tablas = ['usuarios', 'clientes', 'creditos', 'pagos'];
                for (const tabla of tablas) {
                    await callGoogleAppsScript('limpiar_tabla', tabla);
                }
                showStatus('status_migracion', 'Todas las tablas han sido limpiadas en Google Sheets', 'success');
            } catch (error) {
                showStatus('status_migracion', `Error limpiando tablas: ${error.message}`, 'error');
            }
        }
    }

    static mostrarPanelMigracion() {
        const migracionHTML = `
            <div class="import-section" style="background: #e3f2fd; border-color: #2196f3;">
                <h4><i class="fas fa-database"></i> Migración de Datos Locales</h4>
                <p>Tienes datos almacenados localmente que pueden ser migrados a Google Sheets.</p>
                <div class="form-group">
                    <button id="btn-migrar-datos" class="btn btn-success">
                        <i class="fas fa-cloud-upload-alt"></i>
                        Migrar Datos a Google Sheets
                    </button>
                    <button id="btn-limpiar-remoto" class="btn btn-warning">
                        <i class="fas fa-broom"></i>
                        Limpiar Tablas en Google Sheets
                    </button>
                    <button id="btn-cerrar-migracion" class="btn btn-secondary">
                        <i class="fas fa-times"></i>
                        Cerrar
                    </button>
                </div>
                <p id="status_migracion" class="status-message"></p>
            </div>
        `;
        
        const mainMenu = document.getElementById('view-main-menu');
        const existingMigracion = document.getElementById('panel-migracion');
        if (existingMigracion) {
            existingMigracion.remove();
        }
        
        const migracionDiv = document.createElement('div');
        migracionDiv.id = 'panel-migracion';
        migracionDiv.innerHTML = migracionHTML;
        mainMenu.insertBefore(migracionDiv, mainMenu.querySelector('.menu-grid'));
        
        // Event listeners para migración
        document.getElementById('btn-migrar-datos').addEventListener('click', () => MigradorDatos.migrarTodo());
        document.getElementById('btn-limpiar-remoto').addEventListener('click', () => MigradorDatos.limpiarTablasRemotas());
        document.getElementById('btn-cerrar-migracion').addEventListener('click', () => migracionDiv.remove());
    }
}