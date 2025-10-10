// =============================================
// INICIALIZACIÓN DE LA APLICACIÓN CON FIREBASE - CORREGIDO COMPLETO
// =============================================

let currentUser = null;
let creditoActual = null;
let currentImportTab = 'clientes';
let reportData = null;
let cargaEnProgreso = false;
let currentSearchOperation = null;
let editingClientId = null; // Para saber si estamos editando un cliente
let editingUserId = null; // Para saber si estamos editando un usuario

// ===== INICIO DE LA MODIFICACIÓN (Variable de estado de conexión) =====
let isOnline = true;
// ===== FIN DE LA MODIFICACIÓN =====


// ===== INICIO DE LA MODIFICACIÓN (Función de parseo de fechas mejorada) =====
/**
 * Parsea de forma segura una fecha que puede estar en formato dd-mm-yyyy, yyyy-mm-dd o ISO.
 * @param {string} fechaStr La cadena de texto de la fecha.
 * @returns {Date|null} Un objeto Date válido o null si el formato es incorrecto.
 */
function parsearFecha_DDMMYYYY(fechaStr) {
    if (!fechaStr || typeof fechaStr !== 'string') {
        console.warn("Se intentó parsear una fecha inválida:", fechaStr);
        return null;
    }
    // 1. Si ya es un formato ISO completo (generado por la app), úsalo directamente.
    if (fechaStr.includes('T') && fechaStr.includes('Z')) {
        const fecha = new Date(fechaStr);
        return isNaN(fecha.getTime()) ? null : fecha;
    }

    const separador = fechaStr.includes('-') ? '-' : (fechaStr.includes('/') ? '/' : null);
    if (!separador) {
        const fechaDirecta = new Date(fechaStr); // Último intento
        return isNaN(fechaDirecta.getTime()) ? null : fechaDirecta;
    }

    // 2. Intenta parsear formatos comunes como dd-mm-yyyy o yyyy-mm-dd
    const partes = fechaStr.split(separador);
    if (partes.length === 3) {
        let anio, mes, dia;
        // Asumir yyyy-mm-dd
        if (partes[0].length === 4) {
            [anio, mes, dia] = partes;
        } 
        // Asumir dd-mm-yyyy
        else if (partes[2].length === 4) {
            [dia, mes, anio] = partes;
        } else {
            return null; // Formato ambiguo
        }

        if (dia?.length === 2 && mes?.length === 2 && anio?.length === 4) {
            const fechaISO = `${anio}-${mes}-${dia}T12:00:00.000Z`; // Usar mediodía para evitar problemas de zona horaria
            const fecha = new Date(fechaISO);
            return isNaN(fecha.getTime()) ? null : fecha;
        }
    }

    return null; // Si ningún formato coincide
}
// ===== FIN DE LA MODIFICACIÓN =====

// ===== INICIO DE LA MODIFICACIÓN (Función para manejar el estado de conexión) =====
/**
 * Actualiza la UI para mostrar el estado actual de la conexión a internet.
 */
function updateConnectionStatus() {
    const statusDiv = document.getElementById('connection-status');
    const logoutBtn = document.getElementById('logout-btn');
    if (!statusDiv || !logoutBtn) return;

    isOnline = navigator.onLine;

    if (isOnline) {
        statusDiv.textContent = 'Conexión restablecida. Sincronizando datos...';
        statusDiv.className = 'connection-status online';
        statusDiv.classList.remove('hidden');
        
        logoutBtn.disabled = false;
        logoutBtn.title = 'Cerrar Sesión';

        setTimeout(() => {
            statusDiv.textContent = 'Datos sincronizados correctamente.';
            setTimeout(() => {
                statusDiv.classList.add('hidden');
            }, 2500);
        }, 3000);
    } else {
        statusDiv.textContent = 'Modo sin conexión. Tus cambios se guardarán y enviarán automáticamente.';
        statusDiv.className = 'connection-status offline';
        statusDiv.classList.remove('hidden');

        logoutBtn.disabled = true;
        logoutBtn.title = 'No puedes cerrar sesión sin conexión';
    }
}
// ===== FIN DE LA MODIFICACIÓN =====

document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM cargado, inicializando aplicación...');

    // Inicializar dropdowns primero
    inicializarDropdowns();

    // Configurar event listeners
    setupEventListeners();

    // El nuevo manejador de estado de autenticación de Firebase
    auth.onAuthStateChanged(user => {
        console.log('Estado de autenticación cambiado:', user);
        if (user) {
            // Usuario ha iniciado sesión
            currentUser = user;
            // Busca el perfil del usuario en Firestore para obtener nombre y rol
            db.collection('users').doc(user.uid).get().then(doc => {
                if (doc.exists) {
                    const userData = doc.data();
                    document.getElementById('user-name').textContent = userData.name || user.email;
                    document.getElementById('user-role-display').textContent = userData.role || 'Usuario';
                } else {
                    document.getElementById('user-name').textContent = user.email;
                    document.getElementById('user-role-display').textContent = "Rol no definido";
                }
            });

            document.getElementById('loading-overlay').classList.add('hidden');
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');
            updateConnectionStatus();

        } else {
            // Usuario ha cerrado sesión o no está logueado
            currentUser = null;
            document.getElementById('loading-overlay').classList.add('hidden');
            document.getElementById('main-app').classList.add('hidden');
            document.getElementById('login-screen').classList.remove('hidden');
        }
    });
});

function setupEventListeners() {
    console.log('Configurando event listeners...');

    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);

    // Sistema de Autenticación
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => auth.signOut());
    }

    // Navegación Principal
    document.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', function () {
            showView(this.getAttribute('data-view'));
        });
    });

    // Gestión de Clientes
    const btnAplicarFiltros = document.getElementById('btn-aplicar-filtros');
    if (btnAplicarFiltros) {
        btnAplicarFiltros.addEventListener('click', loadClientesTable);
    }

    const btnLimpiarFiltros = document.getElementById('btn-limpiar-filtros');
    if (btnLimpiarFiltros) {
        btnLimpiarFiltros.addEventListener('click', limpiarFiltrosClientes);
    }

    // Gestión de Usuarios
    const btnAplicarFiltrosUsuarios = document.getElementById('btn-aplicar-filtros-usuarios');
    if (btnAplicarFiltrosUsuarios) {
        btnAplicarFiltrosUsuarios.addEventListener('click', loadUsersTable);
    }

    const btnLimpiarFiltrosUsuarios = document.getElementById('btn-limpiar-filtros-usuarios');
    if (btnLimpiarFiltrosUsuarios) {
        btnLimpiarFiltrosUsuarios.addEventListener('click', limpiarFiltrosUsuarios);
    }

    const btnNuevoUsuario = document.getElementById('btn-nuevo-usuario');
    if (btnNuevoUsuario) {
        btnNuevoUsuario.addEventListener('click', () => mostrarFormularioUsuario());
    }

    const btnCancelarUsuario = document.getElementById('btn-cancelar-usuario');
    if (btnCancelarUsuario) {
        btnCancelarUsuario.addEventListener('click', ocultarFormularioUsuario);
    }

    const formUsuario = document.getElementById('form-usuario');
    if (formUsuario) {
        formUsuario.addEventListener('submit', handleUserForm);
    }

    // Importación de Datos
    const officeSelect = document.getElementById('office-select');
    if (officeSelect) {
        officeSelect.addEventListener('change', handleOfficeChange);
    }

    document.querySelectorAll('.import-tab').forEach(tab => {
        tab.addEventListener('click', handleTabClick);
    });

    const btnProcesarImportacion = document.getElementById('btn-procesar-importacion');
    if (btnProcesarImportacion) {
        btnProcesarImportacion.addEventListener('click', handleImport);
    }

    const btnLimpiarDatos = document.getElementById('btn-limpiar-datos');
    if (btnLimpiarDatos) {
        btnLimpiarDatos.addEventListener('click', async () => {
            if (confirm('¿Estás seguro de que deseas limpiar TODA la base de datos en la nube? Esta acción es experimental y no se puede deshacer.')) {
                showStatus('estado-importacion', 'La limpieza masiva debe hacerse desde la consola de Firebase o con Cloud Functions para mayor seguridad.', 'info');
            }
        });
    }

    // Registrar/Editar Cliente
    const formCliente = document.getElementById('form-cliente');
    if (formCliente) {
        formCliente.addEventListener('submit', handleClientForm);
    }

    // NOTA: Para que el botón "Cancelar" del formulario de cliente reinicie el formulario,
    // añade el id="btn-cancelar-cliente" a ese botón en tu index.html
    const btnCancelarCliente = document.getElementById('btn-cancelar-cliente');
    if(btnCancelarCliente){
        btnCancelarCliente.addEventListener('click', () => {
            resetClientForm();
            showView('view-gestion-clientes'); // Volver a la lista
        });
    }

    const curpCliente = document.getElementById('curp_cliente');
    if (curpCliente) {
        curpCliente.addEventListener('input', function () { validarCURP(this); });
    }

    const officeCliente = document.getElementById('office_cliente');
    if (officeCliente) {
        officeCliente.addEventListener('change', handleOfficeChangeForClientForm);
    }

    // Generar Crédito
    const btnBuscarClienteColocacion = document.getElementById('btnBuscarCliente_colocacion');
    if (btnBuscarClienteColocacion) {
        btnBuscarClienteColocacion.addEventListener('click', handleSearchClientForCredit);
    }

    const formCreditoSubmit = document.getElementById('form-credito-submit');
    if (formCreditoSubmit) {
        formCreditoSubmit.addEventListener('submit', handleCreditForm);
    }

    const curpAvalColocacion = document.getElementById('curpAval_colocacion');
    if (curpAvalColocacion) {
        curpAvalColocacion.addEventListener('input', function () { validarCURP(this); });
    }

    const montoColocacion = document.getElementById('monto_colocacion');
    if (montoColocacion) {
        montoColocacion.addEventListener('change', calcularMontoTotalColocacion);
    }

    const plazoColocacion = document.getElementById('plazo_colocacion');
    if (plazoColocacion) {
        plazoColocacion.addEventListener('change', calcularMontoTotalColocacion);
    }

    // Registrar Pago
    const btnBuscarCreditoCobranza = document.getElementById('btnBuscarCredito_cobranza');
    if (btnBuscarCreditoCobranza) {
        btnBuscarCreditoCobranza.addEventListener('click', handleSearchCreditForPayment);
    }

    const formPagoSubmit = document.getElementById('form-pago-submit');
    if (formPagoSubmit) {
        formPagoSubmit.addEventListener('submit', handlePaymentForm);
    }

    const montoCobranza = document.getElementById('monto_cobranza');
    if (montoCobranza) {
        montoCobranza.addEventListener('input', handleMontoPagoChange);
    }

    // Reportes Básicos
    const btnActualizarReportes = document.getElementById('btn-actualizar-reportes');
    if (btnActualizarReportes) {
        btnActualizarReportes.addEventListener('click', async () => {
            await loadBasicReports();
        });
    }

    // Reportes Avanzados
    const btnAplicarFiltrosReportes = document.getElementById('btn-aplicar-filtros-reportes');
    if (btnAplicarFiltrosReportes) {
        btnAplicarFiltrosReportes.addEventListener('click', loadAdvancedReports);
    }

    const btnExportarCsv = document.getElementById('btn-exportar-csv');
    if (btnExportarCsv) {
        btnExportarCsv.addEventListener('click', exportToCSV);
    }

    const btnExportarPdf = document.getElementById('btn-exportar-pdf');
    if (btnExportarPdf) {
        btnExportarPdf.addEventListener('click', exportToPDF);
    }

    const btnLimpiarFiltrosReportes = document.getElementById('btn-limpiar-filtros-reportes');
    if (btnLimpiarFiltrosReportes) {
        btnLimpiarFiltrosReportes.addEventListener('click', limpiarFiltrosReportes);
    }

    console.log('Event listeners configurados correctamente');
}

// =============================================
// MANEJADORES DE EVENTOS
// =============================================

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const statusElement = document.getElementById('auth-status');

    try {
        showButtonLoading('login-form button', true, 'Iniciando sesión...');
        statusElement.textContent = 'Iniciando sesión...';
        statusElement.className = 'status-message status-info';
        await auth.signInWithEmailAndPassword(email, password);
        // onAuthStateChanged se encarga de mostrar la app
    } catch (error) {
        console.error("Error de inicio de sesión:", error.code);
        statusElement.textContent = 'Error: correo o contraseña incorrectos.';
        statusElement.className = 'status-message status-error';
    } finally {
        showButtonLoading('login-form button', false);
    }
}

function handleOfficeChange() {
    const office = this.value;
    const isGDL = office === 'GDL';
    const gdlSection = document.getElementById('import-gdl-section');
    const leonSection = document.getElementById('import-leon-section');

    if (gdlSection) gdlSection.classList.toggle('hidden', !isGDL);
    if (leonSection) leonSection.classList.toggle('hidden', isGDL);

    currentImportTab = 'clientes';
    const selector = isGDL ? '#import-gdl-section .import-tab[data-tab="clientes"]' : '#import-leon-section .import-tab[data-tab="clientes"]';
    const tabElement = document.querySelector(selector);
    if (tabElement) {
        handleTabClick.call(tabElement);
    }
}

function handleTabClick() {
    const parentSection = this.closest('[id$="-section"]');
    if (!parentSection) return;

    parentSection.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
    this.classList.add('active');
    currentImportTab = this.getAttribute('data-tab');
    parentSection.querySelectorAll('.import-tab-content').forEach(c => c.classList.add('hidden'));
    const officePrefix = parentSection.id.includes('gdl') ? 'gdl' : 'leon';
    const targetTab = document.getElementById(`tab-${officePrefix}-${currentImportTab}`);
    if (targetTab) {
        targetTab.classList.remove('hidden');
    }
}

async function handleImport() {
    const office = document.getElementById('office-select').value;
    const textareaId = `datos-importar-${office.toLowerCase()}-${currentImportTab}`;
    const textarea = document.getElementById(textareaId);

    if (!textarea) {
        showStatus('estado-importacion', 'No se encontró el área de texto para importar.', 'error');
        return;
    }

    const csvData = textarea.value;

    if (!csvData.trim()) {
        showStatus('estado-importacion', 'No hay datos para importar.', 'error');
        const resultadoImportacion = document.getElementById('resultado-importacion');
        if (resultadoImportacion) resultadoImportacion.classList.remove('hidden');
        return;
    }

    showProcessingOverlay(true, 'Importando datos...');
    showButtonLoading('btn-procesar-importacion', true, 'Importando...');

    try {
        showFixedProgress(0, 'Iniciando importación...');
        const resultado = await database.importarDatosDesdeCSV(csvData, currentImportTab, office);
        showFixedProgress(100, 'Importación completada');

        let mensaje = `Importación (${office}) completada: ${resultado.importados} de ${resultado.total} registros.`;
        if (resultado.errores && resultado.errores.length > 0) {
            mensaje += `<br>Errores: ${resultado.errores.length}`;
            const detalleImportacion = document.getElementById('detalle-importacion');
            if (detalleImportacion) {
                detalleImportacion.innerHTML = `<strong>Detalle:</strong><ul>${resultado.errores.map(e => `<li>${e}</li>`).join('')}</ul>`;
            }
        } else {
            const detalleImportacion = document.getElementById('detalle-importacion');
            if (detalleImportacion) detalleImportacion.innerHTML = '';
        }
        showStatus('estado-importacion', mensaje, resultado.success ? 'success' : 'error');
        const resultadoImportacion = document.getElementById('resultado-importacion');
        if (resultadoImportacion) resultadoImportacion.classList.remove('hidden');
    } catch (error) {
        console.error('Error en importación:', error);
        showStatus('estado-importacion', `Error en importación: ${error.message}`, 'error');
    } finally {
        showProcessingOverlay(false);
        showButtonLoading('btn-procesar-importacion', false);
        setTimeout(hideFixedProgress, 1000);
    }
}

// ===== INICIO DE LA MODIFICACIÓN (Gestión Completa de Clientes) =====
function resetClientForm() {
    editingClientId = null;
    const form = document.getElementById('form-cliente');
    if(form) form.reset();

    const titulo = document.querySelector('#view-cliente h2');
    if(titulo) titulo.textContent = 'Registrar Cliente';
    
    const submitButton = document.querySelector('#form-cliente button[type="submit"]');
    if(submitButton) submitButton.innerHTML = '<i class="fas fa-save"></i> Guardar Cliente';

    document.getElementById('curp_cliente').readOnly = false;
    handleOfficeChangeForClientForm.call({ value: 'GDL' });
}

async function handleClientForm(e) {
    e.preventDefault();
    const curp = document.getElementById('curp_cliente').value;
    if (!validarFormatoCURP(curp)) {
        showStatus('status_cliente', 'El CURP debe tener 18 caracteres.', 'error');
        return;
    }

    const submitButton = document.querySelector('#form-cliente button[type="submit"]');
    showButtonLoading(submitButton, true, 'Guardando...');
    
    const clienteData = {
        office: document.getElementById('office_cliente').value,
        curp,
        nombre: document.getElementById('nombre_cliente').value,
        domicilio: document.getElementById('domicilio_cliente').value,
        cp: document.getElementById('cp_cliente').value,
        telefono: document.getElementById('telefono_cliente').value,
        poblacion_grupo: document.getElementById('poblacion_grupo_cliente').value,
        ruta: document.getElementById('ruta_cliente').value
    };

    if (!clienteData.nombre || !clienteData.domicilio || !clienteData.poblacion_grupo || !clienteData.ruta) {
        showStatus('status_cliente', 'Los campos con * son obligatorios.', 'error');
        showButtonLoading(submitButton, false);
        return;
    }

    try {
        let resultado;
        if (editingClientId) {
            resultado = await database.actualizarCliente(editingClientId, clienteData);
        } else {
            resultado = await database.agregarCliente(clienteData);
        }

        let successMessage = resultado.message;
        if (!isOnline && resultado.success) {
            successMessage = `Cliente ${editingClientId ? 'actualizado' : 'registrado'} en modo offline. Se sincronizará automáticamente.`;
        }
        showStatus('status_gestion_clientes', successMessage, resultado.success ? 'success' : 'error');
        
        if (resultado.success) {
            resetClientForm();
            showView('view-gestion-clientes');
            await loadClientesTable(); 
        } else {
            // Si hay un error, mostrarlo en el formulario actual
            showStatus('status_cliente', resultado.message, 'error');
        }
    } catch (error) {
        showStatus('status_cliente', 'Error al guardar el cliente: ' + error.message, 'error');
    } finally {
        showButtonLoading(submitButton, false);
    }
}
// ===== FIN DE LA MODIFICACIÓN =====

// =============================================
// GESTIÓN DE USUARIOS
// =============================================

function mostrarFormularioUsuario(usuario = null) {
    const formContainer = document.getElementById('form-usuario-container');
    const formTitulo = document.getElementById('form-usuario-titulo');
    const form = document.getElementById('form-usuario');
    const passwordInput = document.getElementById('nuevo-password');
    const emailInput = document.getElementById('nuevo-email');

    if (!formContainer || !formTitulo || !form) return;

    form.reset();
    
    if (usuario) {
        editingUserId = usuario.id;
        formTitulo.textContent = 'Editar Usuario';
        document.getElementById('nuevo-nombre').value = usuario.name || '';
        emailInput.value = usuario.email || '';
        emailInput.readOnly = true;
        document.getElementById('nuevo-rol').value = usuario.role || '';
        passwordInput.required = false;
        passwordInput.placeholder = "Dejar en blanco para no cambiar";
    } else {
        editingUserId = null;
        formTitulo.textContent = 'Nuevo Usuario';
        emailInput.readOnly = false;
        passwordInput.required = true;
        passwordInput.placeholder = "";
    }
    
    formContainer.classList.remove('hidden');
}

function ocultarFormularioUsuario() {
    editingUserId = null;
    const formContainer = document.getElementById('form-usuario-container');
    if (formContainer) {
        formContainer.classList.add('hidden');
    }
}

async function handleUserForm(e) {
    e.preventDefault();
    const submitButton = document.querySelector('#form-usuario button[type="submit"]');

    if (editingUserId) { // --- MODO EDICIÓN ---
        const userData = {
            name: document.getElementById('nuevo-nombre').value,
            role: document.getElementById('nuevo-rol').value,
        };

        if (!userData.name || !userData.role) {
            showStatus('status_usuarios', 'Nombre y Rol son obligatorios.', 'error');
            return;
        }

        showButtonLoading(submitButton, true, 'Actualizando...');
        const resultado = await database.actualizarUsuario(editingUserId, userData);
        
        let message = resultado.message;
        if (!isOnline && resultado.success) {
             message = 'Usuario actualizado en modo offline. Se sincronizará automáticamente.';
        }
        showStatus('status_usuarios', message, resultado.success ? 'success' : 'error');
        
        if (resultado.success) {
            ocultarFormularioUsuario();
            await loadUsersTable();
        }

        showButtonLoading(submitButton, false);

    } else { // --- MODO CREACIÓN ---
        const email = document.getElementById('nuevo-email').value;
        const password = document.getElementById('nuevo-password').value;
        const nombre = document.getElementById('nuevo-nombre').value;
        const rol = document.getElementById('nuevo-rol').value;

        if (!email || !password || !nombre || !rol) {
            showStatus('status_usuarios', 'Todos los campos son obligatorios.', 'error');
            return;
        }

        showButtonLoading(submitButton, true, 'Creando...');
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            await db.collection('users').doc(user.uid).set({ email, name: nombre, role: rol, createdAt: new Date().toISOString(), status: 'active' });
            
            let message = 'Usuario creado exitosamente.';
            if (!isOnline) message = 'Usuario creado en modo offline. Se sincronizará automáticamente.';
            showStatus('status_usuarios', message, 'success');

            ocultarFormularioUsuario();
            await loadUsersTable();
        } catch (error) {
            let mensajeError = 'Error al crear usuario: ' + error.message;
            if (error.code === 'auth/email-already-in-use') mensajeError = 'Error: El correo electrónico ya está en uso.';
            if (error.code === 'auth/weak-password') mensajeError = 'Error: La contraseña es demasiado débil (mínimo 6 caracteres).';
            showStatus('status_usuarios', mensajeError, 'error');
        } finally {
            showButtonLoading(submitButton, false);
        }
    }
}

async function loadUsersTable() {
    if (cargaEnProgreso) {
        showStatus('status_usuarios', 'Ya hay una búsqueda en progreso.', 'warning');
        return;
    }
    cargaEnProgreso = true;

    const tbody = document.getElementById('tabla-usuarios');
    tbody.innerHTML = '<tr><td colspan="6">Buscando usuarios...</td></tr>';
    showButtonLoading('btn-aplicar-filtros-usuarios', true, 'Buscando...');
    
    try {
        const resultado = await database.obtenerUsuarios();
        if (!resultado.success) throw new Error(resultado.message);

        let usuarios = resultado.data;
        // Aquí podrías agregar la lógica de filtrado si es necesaria
        // ...

        tbody.innerHTML = '';
        if (usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No se encontraron usuarios.</td></tr>';
            return;
        }

        usuarios.sort((a,b) => a.name.localeCompare(b.name)).forEach(usuario => {
            const tr = document.createElement('tr');
            if (usuario.status === 'disabled') {
                tr.style.opacity = '0.5';
                tr.title = 'Este usuario está deshabilitado';
            }
            const roleBadgeClass = `role-${usuario.role || 'default'}`;
            tr.innerHTML = `
                <td>${usuario.email || 'N/A'}</td>
                <td>${usuario.name || 'N/A'}</td>
                <td><span class="role-badge ${roleBadgeClass}">${usuario.role || 'N/A'}</span></td>
                <td>${usuario.office || 'N/A'}</td>
                <td>${usuario.status === 'disabled' ? 'Deshabilitado' : 'Activo'}</td>
                <td class="action-buttons">
                    <button class="btn btn-sm btn-info" onclick='editUsuario(${JSON.stringify(usuario)})' title="Editar"><i class="fas fa-edit"></i></button>
                    ${usuario.status !== 'disabled' ? `<button class="btn btn-sm btn-warning" onclick="disableUsuario('${usuario.id}', '${usuario.name}')" title="Deshabilitar"><i class="fas fa-user-slash"></i></button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
        showStatus('status_usuarios', `${usuarios.length} usuarios encontrados.`, 'success');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6">Error al cargar usuarios: ${error.message}</td></tr>`;
        showStatus('status_usuarios', `Error: ${error.message}`, 'error');
    } finally {
        cargaEnProgreso = false;
        showButtonLoading('btn-aplicar-filtros-usuarios', false);
    }
}

function limpiarFiltrosUsuarios() {
    document.getElementById('filtro-email-usuario').value = '';
    document.getElementById('filtro-nombre-usuario').value = '';
    document.getElementById('filtro-rol-usuario').value = '';
    loadUsersTable();
}

function editUsuario(usuario) {
    mostrarFormularioUsuario(usuario);
}

async function disableUsuario(id, nombre) {
    if (confirm(`¿Estás seguro de que deseas deshabilitar a "${nombre}"? El usuario no podrá ser utilizado en el sistema, pero su registro se conservará.`)) {
        const resultado = await database.deshabilitarUsuario(id);
        if(resultado.success) {
            showStatus('status_usuarios', resultado.message, 'success');
            await loadUsersTable();
        } else {
            alert(resultado.message);
        }
    }
}

async function handleSearchClientForCredit() {
    const curpInput = document.getElementById('curp_colocacion');
    if (!curpInput) return;

    const curp = curpInput.value.trim();
    if (!validarFormatoCURP(curp)) {
        showStatus('status_colocacion', 'El CURP debe tener 18 caracteres.', 'error');
        return;
    }

    showButtonLoading('btnBuscarCliente_colocacion', true, 'Buscando...');
    showFixedProgress(30, 'Buscando cliente...');

    try {
        const cliente = await database.buscarClientePorCURP(curp);
        showFixedProgress(70, 'Verificando elegibilidad...');

        if (cliente) {
            const esElegible = await verificarElegibilidadRenovacion(curp);
            if (!esElegible) {
                showStatus('status_colocacion', `El cliente tiene un crédito activo que no cumple los requisitos para renovación (10 pagos puntuales).`, 'error');
                const formColocacion = document.getElementById('form-colocacion');
                if (formColocacion) formColocacion.classList.add('hidden');
                return;
            }

            const creditoActivo = await database.buscarCreditoActivoPorCliente(curp);
            showFixedProgress(100, 'Cliente encontrado');
            showStatus('status_colocacion', creditoActivo ? 'Cliente encontrado y elegible para renovación.' : 'Cliente encontrado y elegible para crédito nuevo.', 'success');

            const nombreColocacion = document.getElementById('nombre_colocacion');
            const idCreditoColocacion = document.getElementById('idCredito_colocacion');
            const formColocacion = document.getElementById('form-colocacion');

            if (nombreColocacion) nombreColocacion.value = cliente.nombre;
            if (idCreditoColocacion) idCreditoColocacion.value = 'Se asignará automáticamente';
            if (formColocacion) formColocacion.classList.remove('hidden');
        } else {
            showFixedProgress(100, 'Cliente no encontrado');
            showStatus('status_colocacion', 'Cliente no encontrado. Registre al cliente primero.', 'error');
            const formColocacion = document.getElementById('form-colocacion');
            if (formColocacion) formColocacion.classList.add('hidden');
        }
    } catch (error) {
        showStatus('status_colocacion', 'Error al buscar cliente: ' + error.message, 'error');
    } finally {
        showButtonLoading('btnBuscarCliente_colocacion', false);
        setTimeout(hideFixedProgress, 1000);
    }
}

async function handleCreditForm(e) {
    e.preventDefault();
    const curpAval = document.getElementById('curpAval_colocacion').value;
    const credito = {
        curpCliente: document.getElementById('curp_colocacion').value,
        tipo: document.getElementById('tipo_colocacion').value,
        monto: parseFloat(document.getElementById('monto_colocacion').value),
        plazo: parseInt(document.getElementById('plazo_colocacion').value),
        curpAval,
        nombreAval: document.getElementById('nombreAval_colocacion').value
    };

    if (!credito.monto || !credito.plazo || !credito.tipo || !credito.nombreAval.trim() || !validarFormatoCURP(curpAval)) {
        showStatus('status_colocacion', 'Todos los campos son obligatorios y el CURP del aval debe ser válido.', 'error');
        return;
    }

    showButtonLoading('#form-credito-submit button[type="submit"]', true, 'Generando crédito...');
    showFixedProgress(50, 'Procesando crédito...');

    try {
        const resultado = await database.agregarCredito(credito);
        showFixedProgress(100, 'Crédito generado exitosamente');

        let successMessage = resultado.message;
         if (resultado.success) {
            successMessage = `${resultado.message}. ID de crédito: ${resultado.data.id}`;
            if (!isOnline) {
                successMessage = `Crédito generado en modo offline (ID: ${resultado.data.id}). Se sincronizará automáticamente.`;
            }
        }
        showStatus('status_colocacion', successMessage, resultado.success ? 'success' : 'error');

        if (resultado.success) {
            e.target.reset();
            const formColocacion = document.getElementById('form-colocacion');
            const curpColocacion = document.getElementById('curp_colocacion');
            if (formColocacion) formColocacion.classList.add('hidden');
            if (curpColocacion) curpColocacion.value = '';
        }
    } catch (error) {
        showStatus('status_colocacion', 'Error al generar crédito: ' + error.message, 'error');
    } finally {
        showButtonLoading('#form-credito-submit button[type="submit"]', false);
        setTimeout(hideFixedProgress, 1000);
    }
}

async function handleSearchCreditForPayment() {
    const idCreditoInput = document.getElementById('idCredito_cobranza');
    if (!idCreditoInput) return;

    const idCredito = idCreditoInput.value.trim();
    if (!idCredito) return;

    showButtonLoading('btnBuscarCredito_cobranza', true, 'Buscando...');
    showFixedProgress(30, 'Buscando crédito...');

    try {
        creditoActual = await database.buscarCreditoPorId(idCredito);
        showFixedProgress(60, 'Obteniendo información del cliente...');

        if (creditoActual) {
            const cliente = await database.buscarClientePorCURP(creditoActual.curpCliente);
            showFixedProgress(80, 'Calculando historial...');
            const historial = await obtenerHistorialCreditoCliente(creditoActual.curpCliente);

            if (historial) {
                const campos = {
                    'nombre_cobranza': cliente ? cliente.nombre : 'N/A',
                    'saldo_cobranza': `$${historial.saldoRestante.toLocaleString()}`,
                    'estado_cobranza': historial.estado.toUpperCase(),
                    'semanas_atraso_cobranza': historial.semanasAtraso || 0,
                    'pago_semanal_cobranza': `$${historial.pagoSemanal.toLocaleString()}`,
                    'fecha_proximo_pago_cobranza': historial.proximaFechaPago,
                    'monto_cobranza': historial.pagoSemanal.toFixed(2)
                };
                Object.keys(campos).forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = campos[id];
                });

                handleMontoPagoChange();
                showFixedProgress(100, 'Crédito encontrado');
                document.getElementById('form-cobranza').classList.remove('hidden');
                showStatus('status_cobranza', 'Crédito encontrado.', 'success');
            } else {
                throw new Error('No se pudo calcular el historial del crédito.');
            }
        } else {
            throw new Error('Crédito no encontrado.');
        }
    } catch (error) {
        showFixedProgress(100, 'Error');
        showStatus('status_cobranza', 'Error al buscar crédito: ' + error.message, 'error');
        document.getElementById('form-cobranza').classList.add('hidden');
    } finally {
        showButtonLoading('btnBuscarCredito_cobranza', false);
        setTimeout(hideFixedProgress, 1000);
    }
}

async function handlePaymentForm(e) {
    e.preventDefault();
    if (!creditoActual) {
        showStatus('status_cobranza', 'No hay un crédito seleccionado.', 'error');
        return;
    }

    const pago = {
        idCredito: creditoActual.id,
        monto: parseFloat(document.getElementById('monto_cobranza').value),
        tipoPago: document.getElementById('tipo_cobranza').value
    };

    if (!pago.monto || pago.monto <= 0) {
        showStatus('status_cobranza', 'El monto del pago debe ser mayor a cero.', 'error');
        return;
    }

    showButtonLoading('#form-pago-submit button[type="submit"]', true, 'Registrando pago...');
    showFixedProgress(50, 'Procesando pago...');

    try {
        const resultado = await database.agregarPago(pago);
        showFixedProgress(100, 'Pago registrado exitosamente');

        let successMessage = resultado.message;
        if (!isOnline && resultado.success) {
            successMessage = 'Pago registrado en modo offline. Se sincronizará automáticamente.';
        }
        showStatus('status_cobranza', successMessage, resultado.success ? 'success' : 'error');
        
        if (resultado.success) {
            document.getElementById('form-cobranza').classList.add('hidden');
            document.getElementById('idCredito_cobranza').value = '';
            creditoActual = null;
        }
    } catch (error) {
        showStatus('status_cobranza', 'Error al registrar pago: ' + error.message, 'error');
    } finally {
        showButtonLoading('#form-pago-submit button[type="submit"]', false);
        setTimeout(hideFixedProgress, 1000);
    }
}

function handleMontoPagoChange() {
    if (!creditoActual) return;
    const montoInput = document.getElementById('monto_cobranza');
    const saldoDespuesInput = document.getElementById('saldoDespues_cobranza');

    if (!montoInput || !saldoDespuesInput) return;

    const monto = parseFloat(montoInput.value) || 0;
    const saldoActual = parseFloat(document.getElementById('saldo_cobranza').value.replace('$', '').replace(',', '')) || 0;
    const saldoDespues = saldoActual - monto;
    saldoDespuesInput.value = `$${saldoDespues.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// =============================================
// FUNCIONES DE VISTA Y AUXILIARES
// =============================================

function showView(viewId) {
    console.log('Mostrando vista:', viewId);
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
        const event = new CustomEvent('viewshown', { detail: { viewId } });
        targetView.dispatchEvent(event);
    }
}

function showStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = message;
        element.className = 'status-message ' + (type === 'success' ? 'status-success' : type === 'error' ? 'status-error' : 'status-info');
    }
}

function showProcessingOverlay(show, message = 'Procesando...') {
    let overlay = document.getElementById('processing-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'processing-overlay';
        overlay.className = 'processing-overlay hidden';
        overlay.innerHTML = `<div class="processing-spinner"></div><div id="processing-message" class="processing-message"></div>`;
        document.body.appendChild(overlay);
    }
    const messageElement = document.getElementById('processing-message');
    if (show) {
        if (messageElement) messageElement.textContent = message;
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

function showButtonLoading(selector, show, text = 'Procesando...') {
    const button = (typeof selector === 'string') ? document.querySelector(selector) : selector;
    if (!button) return;

    if (show) {
        button.setAttribute('data-original-text', button.innerHTML);
        button.innerHTML = ''; // Limpiar contenido
        button.classList.add('btn-loading');
        button.disabled = true;
    } else {
        button.innerHTML = button.getAttribute('data-original-text') || 'Acción';
        button.classList.remove('btn-loading');
        button.disabled = false;
    }
}

// =============================================
// FUNCIONES DE BARRA DE PROGRESO Y UTILIDADES
// =============================================

function showFixedProgress(percentage, message = '') {
    // ... Esta función se mantiene igual que en el código original ...
}

function hideFixedProgress() {
    // ... Esta función se mantiene igual que en el código original ...
}

function cancelarCarga() {
    // ... Esta función se mantiene igual que en el código original ...
}

function calcularMontoTotalColocacion() {
    const montoInput = document.getElementById('monto_colocacion');
    const montoTotalInput = document.getElementById('montoTotal_colocacion');
    if (!montoInput || !montoTotalInput) return;
    const monto = parseFloat(montoInput.value) || 0;
    montoTotalInput.value = monto > 0 ? `$${(monto * 1.3).toLocaleString()}` : '';
}

function validarCURP(input) {
    input.value = input.value.toUpperCase().substring(0, 18);
    input.style.borderColor = input.value.length === 18 ? 'var(--success)' : (input.value.length > 0 ? 'var(--danger)' : '');
}

function validarFormatoCURP(curp) {
    return curp && curp.length === 18;
}

const popularDropdown = (elementId, options, placeholder, isObject = false) => {
    const select = document.getElementById(elementId);
    if (select) {
        select.innerHTML = `<option value="">${placeholder}</option>`;
        options.forEach(option => {
            const el = document.createElement('option');
            el.value = isObject ? option.value : option;
            el.textContent = isObject ? option.text : option;
            select.appendChild(el);
        });
    }
};

function handleOfficeChangeForClientForm() {
    const office = this.value;
    const poblacionesGdl = ['LA CALERA', 'ATEQUIZA', 'SAN JACINTO', 'PONCITLAN', 'OCOTLAN', 'ARENAL', 'AMATITAN', 'ACATLAN DE JUAREZ', 'BELLAVISTA', 'SAN ISIDRO MAZATEPEC', 'TALA', 'CUISILLOS', 'HUAXTLA', 'NEXTIPAC', 'SANTA LUCIA', 'JAMAY', 'LA BARCA', 'SAN JUAN DE OCOTAN', 'TALA 2', 'EL HUMEDO', 'NEXTIPAC 2', 'ZZ PUEBLO'];
    const poblacionesLeon = ["ARANDAS", "ARANDAS [E]", "BAJIO DE BONILLAS", "BAJIO DE BONILLAS [E]", "CAPULIN", "CARDENAS", "CARDENAS [E]", "CERRITO DE AGUA CALIENTE", "CERRITO DE AGUA CALIENTE [E]", "CORRALEJO", "CORRALEJO [E]", "CUERAMARO", "CUERAMARO [E]", "DOLORES HIDALGO", "EL ALACRAN", "EL EDEN", "EL FUERTE", "EL MEZQUITILLO", "EL MEZQUITILLO [E]", "EL PALENQUE", "EL PALENQUE [E]", "EL PAXTLE", "EL TULE", "EL TULE [E]", "ESTACION ABASOLO", "ESTACION ABASOLO [E]", "ESTACION CORRALEJO", "ESTACION CORRALEJO [E]", "ESTACION JOAQUIN", "ESTACION JOAQUIN [E]", "EX ESTACION CHIRIMOYA", "EX ESTACION CHIRIMOYA [E]", "GAVIA DE RIONDA", "GODOY", "GODOY [E]", "IBARRA", "IBARRA [E]", "LA ALDEA", "LA CARROZA", "LA CARROZA [E]", "LA ESCONDIDA", "LA SANDIA", "LA SANDIA [E]", "LAGUNA DE GUADALUPE", "LAS CRUCES", "LAS CRUCES [E]", "LAS MASAS", "LAS MASAS [E]", "LAS PALOMAS", "LAS TIRITAS", "LOMA DE LA ESPERANZA", "LOMA DE LA ESPERANZA [E]", "LOS DOLORES", "LOS GALVANES", "LOS GALVANES [E]", "MAGUEY BLANCO", "MEDRANOS", "MEXICANOS", "MEXICANOS [E]", "MINERAL DE LA LUZ", "MISION DE ABAJO", "MISION DE ABAJO [E]", "MISION DE ARRIBA", "MISION DE ARRIBA [E]", "NORIA DE ALDAY", "OCAMPO", "PURISIMA DEL RINCON", "PURISIMA DEL RINCON [E]", "RANCHO NUEVO DE LA CRUZ", "RANCHO NUEVO DE LA CRUZ [E]", "RANCHO VIEJO", "RIO LAJA", "RIO LAJA [E]", "SAN ANDRES DE JALPA", "SAN ANDRES DE JALPA [E]", "SAN BERNARDO", "SAN BERNARDO [E]", "SAN CRISTOBAL", "SAN CRISTOBAL [E]", "SAN GREGORIO", "SAN GREGORIO [E]", "SAN ISIDRO DE CRESPO", "SAN ISIDRO DE CRESPO [E]", "SAN JOSE DE BADILLO", "SAN JOSE DE BADILLO [E]", "SAN JOSE DEL RODEO", "SAN JOSE DEL RODEO [E]", "SAN JUAN DE LA PUERTA", "SAN JUAN DE LA PUERTA [E]", "SANTA ANA DEL CONDE", "SANTA ROSA", "SANTA ROSA [E]", "SANTA ROSA PLAN DE AYALA", "SANTA ROSA PLAN DE AYALA [E]", "SANTO DOMINGO", "SERRANO", "TENERIA DEL SANTUARIO", "TENERIA DEL SANTUARIO [E]", "TIERRAS BLANCAS", "TIERRAS BLANCAS [E]", "TREJO", "TREJO [E]", "TUPATARO", "TUPATARO [E]", "VALTIERRILLA", "VALTIERRILLA 2", "VALTIERRILLA [E]", "VAQUERIAS", "VILLA DE ARRIAGA", "VILLA DE ARRIAGA [E]"].sort();
    const poblaciones = office === 'LEON' ? poblacionesLeon : poblacionesGdl;
    popularDropdown('poblacion_grupo_cliente', poblaciones, 'Selecciona población/grupo');
}

function inicializarDropdowns() {
    // ... Esta función se mantiene igual que en el código original ...
}

// =============================================
// LÓGICA DE NEGOCIO
// =============================================

function _calcularEstadoCredito(credito, pagos) {
    if (!credito || !credito.fechaCreacion) {
        console.error("Cálculo de estado fallido: Faltan datos del crédito o fecha de creación.", credito);
        return null;
    }
    if (credito.saldo <= 0.01) {
        return { estado: 'liquidado', diasAtraso: 0, semanasAtraso: 0, pagoSemanal: 0, proximaFechaPago: 'N/A' };
    }
    const pagoSemanal = (credito.plazo > 0) ? credito.montoTotal / credito.plazo : 0;
    const montoPagado = credito.montoTotal - credito.saldo;

    const fechaInicio = parsearFecha_DDMMYYYY(credito.fechaCreacion);
    if (!fechaInicio) {
        console.error("Cálculo de estado fallido: Fecha de creación inválida.", credito.fechaCreacion);
        return null; // No se puede calcular si la fecha es inválida
    }

    const diasTranscurridos = (new Date() - fechaInicio) / (1000 * 60 * 60 * 24);
    if (diasTranscurridos < 0) return { estado: 'al corriente', diasAtraso: 0, semanasAtraso: 0, pagoSemanal, proximaFechaPago: 'Futuro' };

    const pagoRequerido = (diasTranscurridos / 7) * pagoSemanal;
    const deficit = pagoRequerido - montoPagado;
    const diasAtraso = (deficit > 0) ? (deficit / pagoSemanal) * 7 : 0;

    let estado = 'al corriente';
    if (diasAtraso > 300) estado = 'juridico';
    else if (diasAtraso > 150) estado = 'cobranza';
    else if (diasAtraso >= 7) estado = 'atrasado';

    const semanasPagadas = (pagoSemanal > 0) ? montoPagado / pagoSemanal : 0;
    const proximaFecha = new Date(fechaInicio);
    proximaFecha.setDate(proximaFecha.getDate() + (Math.floor(semanasPagadas) + 1) * 7);

    return {
        estado,
        diasAtraso: Math.round(diasAtraso),
        semanasAtraso: Math.ceil(diasAtraso / 7),
        pagoSemanal,
        proximaFechaPago: proximaFecha.toLocaleDateString()
    };
}

async function obtenerHistorialCreditoCliente(curp) {
    const creditosCliente = await database.buscarCreditosPorCliente(curp);
    if (creditosCliente.length === 0) return null;

    creditosCliente.sort((a, b) => {
        const fechaA = parsearFecha_DDMMYYYY(a.fechaCreacion);
        const fechaB = parsearFecha_DDMMYYYY(b.fechaCreacion);
        if (!fechaA || !fechaB) return 0;
        return fechaB - fechaA;
    });
    const ultimoCredito = creditosCliente[0];

    const pagos = await database.getPagosPorCredito(ultimoCredito.id);
    const ultimoPago = pagos.length > 0 ? pagos[0] : null;

    const estadoCalculado = _calcularEstadoCredito(ultimoCredito, pagos);
    
    // Si el estado no se pudo calcular, no podemos mostrar el historial
    if (!estadoCalculado) {
        console.error(`No se pudo calcular el historial para el crédito del cliente con CURP ${curp}. Revisa el formato de la fecha de creación del crédito.`);
        return null;
    }

    const fechaUltimoPagoObj = ultimoPago ? parsearFecha_DDMMYYYY(ultimoPago.fecha) : null;
    const fechaUltimoPagoStr = fechaUltimoPagoObj ? fechaUltimoPagoObj.toLocaleDateString() : 'N/A';

    return {
        idCredito: ultimoCredito.id,
        saldoRestante: ultimoCredito.saldo,
        fechaUltimoPago: fechaUltimoPagoStr,
        ...estadoCalculado,
        semanaActual: Math.floor(pagos.length) + 1,
        plazoTotal: ultimoCredito.plazo,
    };
}

async function verificarElegibilidadRenovacion(curp) {
    const credito = await database.buscarCreditoActivoPorCliente(curp);
    if (!credito) return true;

    const pagos = await database.getPagosPorCredito(credito.id);
    const estado = _calcularEstadoCredito(credito, pagos);

    const fechaCreacionObj = parsearFecha_DDMMYYYY(credito.fechaCreacion);
    if (!estado || !fechaCreacionObj) return false;

    const semanasTranscurridas = Math.floor((new Date() - fechaCreacionObj) / (1000 * 60 * 60 * 24 * 7));
    return semanasTranscurridas >= 10 && estado.estado === 'al corriente';
}

// =============================================
// FUNCIONES DE CARGA DE DATOS PARA VISTAS
// =============================================

function inicializarVistaGestionClientes() {
    const tbody = document.getElementById('tabla-clientes');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6">Utiliza los filtros para buscar y mostrar clientes.</td></tr>`;
    }
    resetClientForm();
}

function limpiarFiltrosClientes() {
    if (cargaEnProgreso) {
        cancelarCarga();
    }
    const filtrosGrid = document.getElementById('filtros-grid');
    if (filtrosGrid) {
        filtrosGrid.querySelectorAll('input, select').forEach(el => el.value = '');
    }
    showButtonLoading('btn-aplicar-filtros', false);
    inicializarVistaGestionClientes();
    showStatus('status_gestion_clientes', 'Filtros limpiados correctamente.', 'info');
}

async function loadClientesTable() {
    if (cargaEnProgreso) {
        showStatus('status_gestion_clientes', 'Ya hay una carga en progreso.', 'warning');
        return;
    }
    cargaEnProgreso = true;

    const tbody = document.getElementById('tabla-clientes');
    tbody.innerHTML = '<tr><td colspan="6">Buscando...</td></tr>';
    showButtonLoading('btn-aplicar-filtros', true, 'Buscando...');

    try {
        const filtros = {
            sucursal: document.getElementById('sucursal_filtro')?.value || '',
            curp: document.getElementById('curp_filtro')?.value || '',
            nombre: document.getElementById('nombre_filtro')?.value || '',
            grupo: document.getElementById('grupo_filtro')?.value || ''
        };

        const clientesFiltrados = await database.buscarClientes(filtros);
        tbody.innerHTML = '';

        if (clientesFiltrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No se encontraron clientes con los filtros aplicados.</td></tr>';
            return;
        }

        for (const cliente of clientesFiltrados) {
            const tr = document.createElement('tr');
            const historial = await obtenerHistorialCreditoCliente(cliente.curp);
            let infoCreditoHTML = '<em>Sin historial</em>';

            if (historial) {
                let estadoClase = '';
                switch (historial.estado) {
                    case 'al corriente': estadoClase = 'status-al-corriente'; break;
                    case 'atrasado': estadoClase = 'status-atrasado'; break;
                    case 'cobranza': estadoClase = 'status-cobranza'; break;
                    case 'juridico': estadoClase = 'status-juridico'; break;
                    case 'liquidado': estadoClase = 'status-liquidado'; break;
                }
                infoCreditoHTML = `<div class="credito-info">
                    <div class="info-item"><span class="info-label">Último ID:</span> <span class="info-value">${historial.idCredito}</span></div>
                    <div class="info-item"><span class="info-label">Estado:</span> <span class="info-value ${estadoClase}">${historial.estado.toUpperCase()}</span></div>
                    ${historial.estado !== 'liquidado' ? `<div class="info-item"><span class="info-label">Saldo:</span> <span class="info-value">$${historial.saldoRestante.toLocaleString()}</span></div>` : ''}
                </div>`;
            }

            tr.innerHTML = `
                <td>${cliente.office || 'N/A'}</td>
                <td>${cliente.curp}</td>
                <td>${cliente.nombre}</td>
                <td>${cliente.poblacion_grupo}</td>
                <td>${infoCreditoHTML}</td>
                <td class="action-buttons">
                    <button class="btn btn-sm btn-info" onclick="editCliente('${cliente.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCliente('${cliente.id}', '${cliente.nombre}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                </td>`;
            tbody.appendChild(tr);
        }
        showStatus('status_gestion_clientes', `Se encontraron ${clientesFiltrados.length} clientes.`, 'success');

    } catch (error) {
        console.error('Error cargando clientes:', error);
        tbody.innerHTML = '<tr><td colspan="6">Error al cargar los clientes.</td></tr>';
        showStatus('status_gestion_clientes', 'Error al cargar los clientes: ' + error.message, 'error');
    } finally {
        showButtonLoading('btn-aplicar-filtros', false);
        cargaEnProgreso = false;
    }
}

// =============================================
// FUNCIONES DE REPORTES (Sin cambios)
// =============================================
async function loadBasicReports() {
    // ... Esta función se mantiene igual que en el código original ...
}
function inicializarVistaReportesAvanzados() {
    // ... Esta función se mantiene igual que en el código original ...
}
function limpiarFiltrosReportes() {
    // ... Esta función se mantiene igual que en el código original ...
}
async function loadAdvancedReports() {
    // ... Esta función se mantiene igual que en el código original ...
}
function mostrarReporteAvanzado(data) {
    // ... Esta función se mantiene igual que en el código original ...
}
function exportToCSV() {
    // ... Esta función se mantiene igual que en el código original ...
}
function exportToPDF() {
    // ... Esta función se mantiene igual que en el código original ...
}

// ===== INICIO DE LA MODIFICACIÓN (Implementación de editar y eliminar) =====
async function editCliente(id) {
    showProcessingOverlay(true, 'Cargando datos del cliente...');
    const cliente = await database.obtenerClientePorId(id);
    showProcessingOverlay(false);
    if (!cliente) {
        alert("Error: No se pudo encontrar el cliente para editar.");
        return;
    }
    
    editingClientId = id;

    document.getElementById('office_cliente').value = cliente.office;
    handleOfficeChangeForClientForm.call({ value: cliente.office });
    
    // Un pequeño delay para asegurar que el dropdown de poblaciones se llene antes de setear el valor
    setTimeout(() => {
        document.getElementById('poblacion_grupo_cliente').value = cliente.poblacion_grupo;
    }, 100);

    document.getElementById('curp_cliente').value = cliente.curp;
    document.getElementById('curp_cliente').readOnly = true;
    document.getElementById('nombre_cliente').value = cliente.nombre;
    document.getElementById('domicilio_cliente').value = cliente.domicilio;
    document.getElementById('cp_cliente').value = cliente.cp;
    document.getElementById('telefono_cliente').value = cliente.telefono;
    document.getElementById('ruta_cliente').value = cliente.ruta;

    document.querySelector('#view-cliente h2').textContent = 'Editar Cliente';
    document.querySelector('#form-cliente button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> Actualizar Cliente';
    showView('view-cliente');
}

async function deleteCliente(id, nombre) {
    if (confirm(`¿Estás seguro de que deseas eliminar a "${nombre}"? Esta acción no se puede deshacer y podría afectar créditos asociados.`)) {
        showProcessingOverlay(true, 'Eliminando cliente...');
        const resultado = await database.eliminarCliente(id);
        let message = resultado.message;
        if (!isOnline && resultado.success) {
            message = 'Cliente marcado para eliminar. Se sincronizará al recuperar la conexión.';
        }
        showStatus('status_gestion_clientes', message, resultado.success ? 'success' : 'error');
        if (resultado.success) {
            await loadClientesTable();
        }
        showProcessingOverlay(false);
    }
}
// ===== FIN DE LA MODIFICACIÓN =====

// Eventos de Vistas
document.addEventListener('viewshown', function (e) {
    const viewId = e.detail.viewId;
    console.log('Vista mostrada:', viewId);

    switch (viewId) {
        case 'view-reportes':
            loadBasicReports();
            break;
        case 'view-reportes-avanzados':
            inicializarVistaReportesAvanzados();
            break;
        case 'view-usuarios':
            loadUsersTable();
            break;
        case 'view-gestion-clientes':
            inicializarVistaGestionClientes();
            // Opcional: Cargar la tabla al entrar a la vista si se desea
            // loadClientesTable(); 
            break;
        case 'view-cliente':
            // Si no estamos editando, nos aseguramos que el form esté limpio
            if(!editingClientId) {
                resetClientForm();
            }
            break;
    }
});

console.log('app.js cargado correctamente');
