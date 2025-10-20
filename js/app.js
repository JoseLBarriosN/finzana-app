// =============================================
// INICIALIZACIÓN DE LA APLICACIÓN CON FIREBASE - CORREGIDO COMPLETO
// =============================================

let currentUser = null;
let currentUserData = null; // Para almacenar los datos del usuario logueado
let creditoActual = null;
let currentImportTab = 'clientes';
let reportData = null;
let cargaEnProgreso = false;
let currentSearchOperation = null;
let editingClientId = null;
let editingUserId = null;
let isOnline = true;
let inactivityTimer; // Temporizador para el cierre de sesión por inactividad
let grupoDePagoActual = null; // Para la nueva función de pago grupal
let currentChart = null; // Para la nueva función de gráficos

/**
 * Parsea de forma robusta una fecha que puede ser un string (ISO 8601, yyyy-mm-dd, etc.)
 * o un objeto Timestamp de Firestore. Esta función es la clave para corregir las fechas existentes en la DB.
 * @param {string|object} fechaInput La cadena de texto o el objeto de fecha.
 * @returns {Date|null} Un objeto Date válido o null si el formato es incorrecto.
 */
function parsearFecha(fechaInput) {
    if (!fechaInput) return null;
    if (fechaInput instanceof Date) return fechaInput;
    if (typeof fechaInput === 'object' && typeof fechaInput.toDate === 'function') return fechaInput.toDate();

    if (typeof fechaInput === 'string') {
        const fechaStr = fechaInput.trim();
        // Prioridad 1: Formato ISO 8601 (el más confiable)
        if (fechaStr.includes('T') && fechaStr.includes('Z')) {
            const fecha = new Date(fechaStr);
            if (!isNaN(fecha.getTime())) return fecha;
        }

        // Prioridad 2: Formatos con guiones o slashes (YYYY-MM-DD, DD-MM-YYYY, etc.)
        const separador = fechaStr.includes('/') ? '/' : '-';
        const partes = fechaStr.split('T')[0].split(separador);

        if (partes.length === 3) {
            const [p1, p2, p3] = partes.map(p => parseInt(p, 10));
            if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
                let anio, mes, dia;
                // Asumir YYYY-MM-DD
                if (p1 > 1000) {
                    anio = p1; mes = p2; dia = p3;
                }
                // Asumir DD-MM-YYYY
                else if (p3 > 1000) {
                    anio = p3; dia = p1; mes = p2;
                }

                if (anio && mes && dia && mes > 0 && mes <= 12 && dia > 0 && dia <= 31) {
                    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
                    if (!isNaN(fecha.getTime()) && fecha.getUTCDate() === dia) return fecha;
                }
            }
        }
    }

    console.warn("No se pudo parsear el formato de fecha:", fechaInput);
    return null;
}


/**
 * Formatea un objeto Date a un string DD/MM/YYYY para una visualización consistente.
 * @param {Date} dateObj El objeto Date a formatear.
 * @returns {string} La fecha formateada o 'N/A' si la entrada es inválida.
 */
function formatDateForDisplay(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
        return 'N/A';
    }
    const dia = String(dateObj.getUTCDate()).padStart(2, '0');
    const mes = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const anio = dateObj.getUTCFullYear();
    return `${dia}/${mes}/${anio}`;
}


/**
 * Actualiza la UI para mostrar el estado actual de la conexión y gestiona filtros.
 */
function updateConnectionStatus() {
    const statusDiv = document.getElementById('connection-status');
    const logoutBtn = document.getElementById('logout-btn');
    if (!statusDiv || !logoutBtn) return;

    isOnline = navigator.onLine;
    const filtrosComplejos = document.querySelectorAll('#sucursal_filtro, #fecha_registro_filtro, #fecha_credito_filtro, #tipo_colocacion_filtro, #plazo_filtro, #curp_aval_filtro, #grupo_filtro');

    if (isOnline) {
        statusDiv.textContent = 'Conexión restablecida. Sincronizando datos...';
        statusDiv.className = 'connection-status online';
        statusDiv.classList.remove('hidden');
        logoutBtn.disabled = false;
        logoutBtn.title = 'Cerrar Sesión';
        filtrosComplejos.forEach(el => { if (el) el.disabled = false; });

        setTimeout(() => {
            statusDiv.textContent = 'Datos sincronizados correctamente.';
            setTimeout(() => statusDiv.classList.add('hidden'), 2500);
        }, 3000);
    } else {
        statusDiv.textContent = 'Modo sin conexión. Búsquedas por nombre y CURP habilitadas.';
        statusDiv.className = 'connection-status offline';
        statusDiv.classList.remove('hidden');
        logoutBtn.disabled = true;
        logoutBtn.title = 'No puedes cerrar sesión sin conexión';
        filtrosComplejos.forEach(el => { if (el) el.disabled = true; });
    }
}

// =============================================
// LÓGICA DE SEGURIDAD Y SESIÓN
// =============================================

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        if (currentUser) {
            alert("Sesión cerrada por inactividad.");
            auth.signOut();
        }
    }, 600000); // 10 minutos
}

function setupSecurityListeners() {
    window.onload = resetInactivityTimer;
    document.onmousemove = resetInactivityTimer;
    document.onkeypress = resetInactivityTimer;
    document.onclick = resetInactivityTimer;
    document.ontouchstart = resetInactivityTimer;

    window.addEventListener('beforeunload', () => {
        if (cargaEnProgreso) {
            cancelarCarga();
        }
    });
}


document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM cargado, inicializando aplicación...');
    inicializarDropdowns();
    setupEventListeners();
    setupSecurityListeners();

    auth.onAuthStateChanged(async user => {
        console.log('Estado de autenticación cambiado:', user);
        if (user) {
            currentUser = user;
            currentUserData = await database.obtenerUsuarioPorId(user.uid);

            if (currentUserData) {
                document.getElementById('user-name').textContent = currentUserData.name || user.email;
                document.getElementById('user-role-display').textContent = currentUserData.role || 'Usuario';
            } else {
                document.getElementById('user-name').textContent = user.email;
                document.getElementById('user-role-display').textContent = "Rol no definido";
            }

            document.getElementById('loading-overlay').classList.add('hidden');
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');
            updateConnectionStatus();
            resetInactivityTimer();
        } else {
            currentUser = null;
            currentUserData = null;
            clearTimeout(inactivityTimer);
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

    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => auth.signOut());

    document.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', function () {
            if (this.type === 'button' && this.closest('#form-cliente')) {
                resetClientForm();
            }
            showView(this.getAttribute('data-view'));
        });
    });

    const btnAplicarFiltros = document.getElementById('btn-aplicar-filtros');
    if (btnAplicarFiltros) btnAplicarFiltros.addEventListener('click', loadClientesTable);
    const btnLimpiarFiltros = document.getElementById('btn-limpiar-filtros');
    if (btnLimpiarFiltros) btnLimpiarFiltros.addEventListener('click', limpiarFiltrosClientes);

    const btnAplicarFiltrosUsuarios = document.getElementById('btn-aplicar-filtros-usuarios');
    if (btnAplicarFiltrosUsuarios) btnAplicarFiltrosUsuarios.addEventListener('click', loadUsersTable);
    const btnLimpiarFiltrosUsuarios = document.getElementById('btn-limpiar-filtros-usuarios');
    if (btnLimpiarFiltrosUsuarios) btnLimpiarFiltrosUsuarios.addEventListener('click', limpiarFiltrosUsuarios);
    const btnNuevoUsuario = document.getElementById('btn-nuevo-usuario');
    if (btnNuevoUsuario) btnNuevoUsuario.addEventListener('click', () => mostrarFormularioUsuario());
    
    // **NUEVO EVENT LISTENER**
    const btnVerificarDuplicados = document.getElementById('btn-verificar-duplicados');
    if(btnVerificarDuplicados) btnVerificarDuplicados.addEventListener('click', handleVerificarDuplicados);

    const btnCancelarUsuario = document.getElementById('btn-cancelar-usuario');
    if (btnCancelarUsuario) btnCancelarUsuario.addEventListener('click', ocultarFormularioUsuario);
    const formUsuario = document.getElementById('form-usuario');
    if (formUsuario) formUsuario.addEventListener('submit', handleUserForm);

    const officeSelect = document.getElementById('office-select');
    if (officeSelect) officeSelect.addEventListener('change', handleOfficeChange);
    document.querySelectorAll('.import-tab').forEach(tab => tab.addEventListener('click', handleTabClick));
    const btnProcesarImportacion = document.getElementById('btn-procesar-importacion');
    if (btnProcesarImportacion) btnProcesarImportacion.addEventListener('click', handleImport);
    const btnLimpiarDatos = document.getElementById('btn-limpiar-datos');
    if (btnLimpiarDatos) {
        btnLimpiarDatos.addEventListener('click', async () => {
            if (confirm('¿Estás seguro de que deseas limpiar TODA la base de datos en la nube? Esta acción es experimental y no se puede deshacer.')) {
                showStatus('estado-importacion', 'La limpieza masiva debe hacerse desde la consola de Firebase o con Cloud Functions para mayor seguridad.', 'info');
            }
        });
    }

    const formCliente = document.getElementById('form-cliente');
    if (formCliente) formCliente.addEventListener('submit', handleClientForm);
    const curpCliente = document.getElementById('curp_cliente');
    if (curpCliente) curpCliente.addEventListener('input', () => validarCURP(curpCliente));
    const officeCliente = document.getElementById('office_cliente');
    if (officeCliente) officeCliente.addEventListener('change', handleOfficeChangeForClientForm);

    const btnBuscarClienteColocacion = document.getElementById('btnBuscarCliente_colocacion');
    if (btnBuscarClienteColocacion) btnBuscarClienteColocacion.addEventListener('click', handleSearchClientForCredit);
    const formCreditoSubmit = document.getElementById('form-credito-submit');
    if (formCreditoSubmit) formCreditoSubmit.addEventListener('submit', handleCreditForm);
    const curpAvalColocacion = document.getElementById('curpAval_colocacion');
    if (curpAvalColocacion) curpAvalColocacion.addEventListener('input', () => validarCURP(curpAvalColocacion));
    const montoColocacion = document.getElementById('monto_colocacion');
    if (montoColocacion) montoColocacion.addEventListener('change', calcularMontoTotalColocacion);
    const plazoColocacion = document.getElementById('plazo_colocacion');
    if (plazoColocacion) plazoColocacion.addEventListener('change', calcularMontoTotalColocacion);

    const btnBuscarCreditoCobranza = document.getElementById('btnBuscarCredito_cobranza');
    if (btnBuscarCreditoCobranza) btnBuscarCreditoCobranza.addEventListener('click', handleSearchCreditForPayment);
    const formPagoSubmit = document.getElementById('form-pago-submit');
    if (formPagoSubmit) formPagoSubmit.addEventListener('submit', handlePaymentForm);
    const montoCobranza = document.getElementById('monto_cobranza');
    if (montoCobranza) montoCobranza.addEventListener('input', handleMontoPagoChange);

    const btnActualizarReportes = document.getElementById('btn-actualizar-reportes');
    if (btnActualizarReportes) btnActualizarReportes.addEventListener('click', () => loadBasicReports());
    const btnAplicarFiltrosReportes = document.getElementById('btn-aplicar-filtros-reportes');
    if (btnAplicarFiltrosReportes) btnAplicarFiltrosReportes.addEventListener('click', loadAdvancedReports);
    const btnExportarCsv = document.getElementById('btn-exportar-csv');
    if (btnExportarCsv) btnExportarCsv.addEventListener('click', exportToCSV);
    const btnExportarPdf = document.getElementById('btn-exportar-pdf');
    if (btnExportarPdf) btnExportarPdf.addEventListener('click', exportToPDF);
    const btnLimpiarFiltrosReportes = document.getElementById('btn-limpiar-filtros-reportes');
    if (btnLimpiarFiltrosReportes) btnLimpiarFiltrosReportes.addEventListener('click', limpiarFiltrosReportes);

    // Event Listeners para PAGO GRUPAL
    const btnBuscarGrupoPago = document.getElementById('btn-buscar-grupo-pago');
    if (btnBuscarGrupoPago) btnBuscarGrupoPago.addEventListener('click', handleBuscarGrupoParaPago);
    const btnRegistrarPagoGrupal = document.getElementById('btn-registrar-pago-grupal');
    if (btnRegistrarPagoGrupal) btnRegistrarPagoGrupal.addEventListener('click', handleRegistroPagoGrupal);

    // Event Listener para REPORTES GRÁFICOS
    const btnGenerarGrafico = document.getElementById('btn-generar-grafico');
    if (btnGenerarGrafico) btnGenerarGrafico.addEventListener('click', handleGenerarGrafico);
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
    } catch (error) {
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
    if (tabElement) handleTabClick.call(tabElement);
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
    if (targetTab) targetTab.classList.remove('hidden');
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

        let mensaje = `<b>Importación (${office} - ${currentImportTab}) completada:</b> ${resultado.importados} de ${resultado.total} registros procesados.`;
        const resultadoImportacion = document.getElementById('resultado-importacion');
        const detalleImportacion = document.getElementById('detalle-importacion');

        if (resultado.errores && resultado.errores.length > 0) {
            mensaje += `<br><b>Se encontraron ${resultado.errores.length} errores.</b>`;
            if (detalleImportacion) {
                detalleImportacion.innerHTML = `<strong>Detalle de errores:</strong><ul>${resultado.errores.map(e => `<li>${e}</li>`).join('')}</ul>`;
            }
        } else {
            if (detalleImportacion) detalleImportacion.innerHTML = 'No se encontraron errores.';
        }

        showStatus('estado-importacion', mensaje, resultado.success ? 'success' : 'warning');
        if (resultadoImportacion) resultadoImportacion.classList.remove('hidden');

    } catch (error) {
        console.error('Error en importación:', error);
        showStatus('estado-importacion', `Error crítico durante la importación: ${error.message}`, 'error');
    } finally {
        showProcessingOverlay(false);
        showButtonLoading('btn-procesar-importacion', false);
        setTimeout(hideFixedProgress, 2000);
    }
}

function resetClientForm() {
    editingClientId = null;
    const form = document.getElementById('form-cliente');
    if (form) form.reset();
    const titulo = document.querySelector('#view-cliente h2');
    if (titulo) titulo.textContent = 'Registrar Cliente';
    const submitButton = document.querySelector('#form-cliente button[type="submit"]');
    if (submitButton) submitButton.innerHTML = '<i class="fas fa-save"></i> Guardar Cliente';

    const curpInput = document.getElementById('curp_cliente');
    curpInput.readOnly = true; // Por defecto bloqueado
    if (currentUserData && (currentUserData.role === 'admin' || currentUserData.role === 'supervisor')) {
        curpInput.readOnly = false;
    }
    handleOfficeChangeForClientForm.call({ value: 'GDL' });
}

async function handleClientForm(e) {
    e.preventDefault();
    const curpInput = document.getElementById('curp_cliente');
    const curp = curpInput.value.toUpperCase();

    if (!validarFormatoCURP(curp)) {
        showStatus('status_cliente', 'El CURP debe tener 18 caracteres.', 'error');
        return;
    }
    const submitButton = document.querySelector('#form-cliente button[type="submit"]');
    showButtonLoading(submitButton, true, 'Guardando...');

    // Si se está editando, verificar que la nueva CURP no exista ya en otro cliente
    if (editingClientId && !curpInput.readOnly) {
        const clienteOriginal = await database.obtenerClientePorId(editingClientId);
        if (clienteOriginal.curp !== curp) {
            const existe = await database.buscarClientePorCURP(curp);
            if (existe) {
                showStatus('status_cliente', 'La nueva CURP ya pertenece a otro cliente.', 'error');
                showButtonLoading(submitButton, false);
                return;
            }
        }
    }

    const clienteData = {
        office: document.getElementById('office_cliente').value,
        curp,
        nombre: document.getElementById('nombre_cliente').value,
        domicilio: document.getElementById('domicilio_cliente').value,
        cp: document.getElementById('cp_cliente').value,
        telefono: document.getElementById('telefono_cliente').value,
        poblacion_grupo: document.getElementById('poblacion_grupo_cliente').value,
        ruta: document.getElementById('ruta_cliente').value,
        isComisionista: document.getElementById('comisionista_cliente').checked
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
            const existe = await database.buscarClientePorCURP(clienteData.curp);
            if (existe) {
                showStatus('status_cliente', 'Ya existe un cliente con esta CURP.', 'error');
                showButtonLoading(submitButton, false);
                return;
            }
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
            loadClientesTable(); // Forzar recarga de la tabla
        } else {
            showStatus('status_cliente', resultado.message, 'error');
        }
    } catch (error) {
        showStatus('status_cliente', 'Error al guardar el cliente: ' + error.message, 'error');
    } finally {
        showButtonLoading(submitButton, false);
    }
}

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
    if (editingUserId) {
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
    } else {
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
            if (!isOnline) {
                throw new Error("La creación de nuevos usuarios requiere conexión a internet.");
            }
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            await db.collection('users').doc(user.uid).set({ id: user.uid, email, name: nombre, role: rol, createdAt: new Date().toISOString(), status: 'active' });
            let message = 'Usuario creado exitosamente.';
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
        const filtroEmail = (document.getElementById('filtro-email-usuario')?.value || '').toLowerCase();
        const filtroNombre = (document.getElementById('filtro-nombre-usuario')?.value || '').toLowerCase();
        const filtroRol = document.getElementById('filtro-rol-usuario')?.value || '';
        const hayFiltros = filtroEmail || filtroNombre || filtroRol;
        if (hayFiltros) {
            usuarios = usuarios.filter(usuario => {
                const emailMatch = !filtroEmail || (usuario.email && usuario.email.toLowerCase().includes(filtroEmail));
                const nombreMatch = !filtroNombre || (usuario.name && usuario.name.toLowerCase().includes(filtroNombre));
                const rolMatch = !filtroRol || usuario.role === filtroRol;
                return emailMatch && nombreMatch && rolMatch;
            });
        }
        tbody.innerHTML = '';
        if (usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No se encontraron usuarios con los filtros aplicados.</td></tr>';
            return;
        }
        usuarios.sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach(usuario => {
            const tr = document.createElement('tr');
            if (usuario.status === 'disabled') {
                tr.style.opacity = '0.5';
                tr.title = 'Este usuario está deshabilitado';
            }
            const roleBadgeClass = `role-${usuario.role || 'default'}`;
            // **NUEVA LÓGICA PARA BADGE DE COMISIONISTA**
            const comisionistaBadge = usuario.role === 'comisionista' ? '<span class="comisionista-badge">COMISIONISTA</span>' : '';
            const usuarioJsonString = JSON.stringify(usuario).replace(/'/g, "&apos;");
            tr.innerHTML = `
                <td>${usuario.email || 'N/A'}</td>
                <td>${usuario.name || 'N/A'}</td>
                <td><span class="role-badge ${roleBadgeClass}">${usuario.role || 'N/A'}</span> ${comisionistaBadge}</td>
                <td>${usuario.office || 'N/A'}</td>
                <td>${usuario.status === 'disabled' ? 'Deshabilitado' : 'Activo'}</td>
                <td class="action-buttons">
                    <button class="btn btn-sm btn-info" onclick='editUsuario(${usuarioJsonString})' title="Editar"><i class="fas fa-edit"></i></button>
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
    if (cargaEnProgreso) cancelarCarga();
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
        if (resultado.success) {
            let message = resultado.message;
            if (!isOnline) message = 'Usuario marcado para deshabilitar. Se sincronizará al recuperar la conexión.';
            showStatus('status_usuarios', message, 'success');
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
            const elegibilidad = await database.verificarElegibilidadCliente(curp);
            if (!elegibilidad.elegible) {
                showStatus('status_colocacion', elegibilidad.message, 'error');
                document.getElementById('form-colocacion').classList.add('hidden');
                return;
            }

            // Actualizar plazos según si el cliente es comisionista
            actualizarPlazosSegunCliente(cliente.isComisionista || false);

            showFixedProgress(100, 'Cliente encontrado');
            const creditoActivo = await database.buscarCreditoActivoPorCliente(curp);
            const mensaje = creditoActivo ? 'Cliente encontrado y elegible para renovación.' : 'Cliente encontrado y elegible para crédito nuevo.';
            showStatus('status_colocacion', mensaje, 'success');

            document.getElementById('nombre_colocacion').value = cliente.nombre;
            document.getElementById('idCredito_colocacion').value = 'Se asignará automáticamente';
            document.getElementById('form-colocacion').classList.remove('hidden');

        } else {
            showFixedProgress(100, 'Cliente no encontrado');
            showStatus('status_colocacion', 'Cliente no encontrado. Registre al cliente primero.', 'error');
            document.getElementById('form-colocacion').classList.add('hidden');
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

    const submitButton = document.querySelector('#form-credito-submit button[type="submit"]');
    showButtonLoading(submitButton, true, 'Verificando y generando...');

    // 1. Verificar elegibilidad del cliente (ya se hizo en la búsqueda, pero doble-check)
    const elegibilidadCliente = await database.verificarElegibilidadCliente(credito.curpCliente);
    if (!elegibilidadCliente.elegible) {
        showStatus('status_colocacion', elegibilidadCliente.message, 'error');
        showButtonLoading(submitButton, false);
        return;
    }

    // 2. Verificar elegibilidad del aval
    const elegibilidadAval = await database.verificarElegibilidadAval(credito.curpAval);
    if (!elegibilidadAval.elegible) {
        showStatus('status_colocacion', elegibilidadAval.message, 'error');
        showButtonLoading(submitButton, false);
        return;
    }

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
        showButtonLoading(submitButton, false);
        setTimeout(hideFixedProgress, 1000);
    }
}


async function handleSearchCreditForPayment() {
    const idCreditoInput = document.getElementById('idCredito_cobranza');
    if (!idCreditoInput) return;
    const idCredito = idCreditoInput.value.trim();
    showButtonLoading('btnBuscarCredito_cobranza', true, 'Buscando...');
    showFixedProgress(30, 'Buscando crédito...');
    try {
        creditoActual = await database.buscarCreditoPorId(idCredito);
        showFixedProgress(60, 'Obteniendo información del cliente...');
        if (creditoActual) {
            const cliente = await database.buscarClientePorCURP(creditoActual.curpCliente);
            
            showFixedProgress(80, 'Calculando historial...');
            const historial = await obtenerHistorialCreditoCliente(creditoActual.curpCliente, idCredito);
            
            if (historial) {
                const campos = ['nombre_cobranza', 'saldo_cobranza', 'estado_cobranza', 'semanas_atraso_cobranza', 'pago_semanal_cobranza', 'fecha_proximo_pago_cobranza', 'monto_cobranza'];
                const valores = [cliente ? cliente.nombre : 'N/A', `$${historial.saldoRestante.toLocaleString()}`, historial.estado.toUpperCase(), historial.semanasAtraso || 0, `$${historial.pagoSemanal.toLocaleString()}`, historial.proximaFechaPago, historial.pagoSemanal.toFixed(2)];
                campos.forEach((campo, index) => {
                    const element = document.getElementById(campo);
                    if (element) element.value = valores[index];
                });
                handleMontoPagoChange();
                showFixedProgress(100, 'Crédito encontrado');
                const formCobranza = document.getElementById('form-cobranza');
                if (formCobranza) formCobranza.classList.remove('hidden');
                showStatus('status_cobranza', 'Crédito encontrado.', 'success');
            } else {
                showStatus('status_cobranza', 'No se pudo calcular el historial del crédito.', 'error');
            }
        } else {
            showFixedProgress(100, 'Crédito no encontrado');
            showStatus('status_cobranza', 'Crédito no encontrado.', 'error');
            const formCobranza = document.getElementById('form-cobranza');
            if (formCobranza) formCobranza.classList.add('hidden');
        }
    } catch (error) {
        showStatus('status_cobranza', 'Error al buscar crédito: ' + error.message, 'error');
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
            const formCobranza = document.getElementById('form-cobranza');
            const idCreditoCobranza = document.getElementById('idCredito_cobranza');
            if (formCobranza) formCobranza.classList.add('hidden');
            if (idCreditoCobranza) idCreditoCobranza.value = '';
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
    const saldoActual = parseFloat(document.getElementById('saldo_cobranza').value.replace('$', '').replace(/,/g, '')) || 0;
    const saldoDespues = saldoActual - monto;
    saldoDespuesInput.value = `$${saldoDespues.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// =============================================
// SECCIÓN DE PAGO GRUPAL
// =============================================
async function handleBuscarGrupoParaPago() {
    const grupo = document.getElementById('grupo_pago_grupal').value;
    if (!grupo) {
        showStatus('status_pago_grupo', 'Por favor, selecciona un grupo.', 'error');
        return;
    }

    showButtonLoading('btn-buscar-grupo-pago', true, 'Calculando...');
    showProcessingOverlay(true, 'Buscando créditos del grupo...');

    try {
        const clientesDelGrupo = await database.buscarClientes({ grupo });
        if (clientesDelGrupo.length === 0) {
            showStatus('status_pago_grupo', 'No se encontraron clientes en el grupo seleccionado.', 'info');
            return;
        }
        
        let totalClientesActivos = 0;
        let totalACobrarSemanal = 0;
        let creditosParaPagar = [];

        for (const cliente of clientesDelGrupo) {
            const historial = await obtenerHistorialCreditoCliente(cliente.curp);
            if (historial && (historial.estado === 'al corriente' || historial.estado === 'atrasado' || historial.estado === 'cobranza')) {
                totalClientesActivos++;
                totalACobrarSemanal += historial.pagoSemanal;
                creditosParaPagar.push({
                    idCredito: historial.idCredito,
                    pagoSemanal: historial.pagoSemanal
                });
            }
        }

        grupoDePagoActual = {
            creditos: creditosParaPagar,
            totalCalculado: totalACobrarSemanal
        };

        document.getElementById('total-clientes-grupo').textContent = totalClientesActivos;
        document.getElementById('total-a-cobrar-grupo').textContent = `$${totalACobrarSemanal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('monto-recibido-grupo').value = totalACobrarSemanal.toFixed(2);

        document.getElementById('grupo-pago-details').classList.remove('hidden');
        showStatus('status_pago_grupo', `Se encontraron ${totalClientesActivos} créditos activos para cobrar.`, 'success');

    } catch (error) {
        console.error("Error al buscar grupo para pago:", error);
        showStatus('status_pago_grupo', 'Error al calcular la cobranza del grupo.', 'error');
    } finally {
        showButtonLoading('btn-buscar-grupo-pago', false);
        showProcessingOverlay(false);
    }
}

async function handleRegistroPagoGrupal() {
    if (!grupoDePagoActual || grupoDePagoActual.creditos.length === 0) {
        showStatus('status_pago_grupo', 'No hay un grupo calculado para registrar el pago.', 'error');
        return;
    }

    const montoRecibido = parseFloat(document.getElementById('monto-recibido-grupo').value);
    const { creditos, totalCalculado } = grupoDePagoActual;

    if (isNaN(montoRecibido) || montoRecibido <= 0) {
        showStatus('status_pago_grupo', 'El monto recibido debe ser un número mayor a cero.', 'error');
        return;
    }

    if (montoRecibido < totalCalculado) {
        showStatus('status_pago_grupo', 'El monto recibido es menor al total calculado. Por favor, ingresa el faltante de manera individual.', 'warning');
        return;
    }

    showButtonLoading('btn-registrar-pago-grupal', true, 'Registrando...');
    showProcessingOverlay(true, `Registrando ${creditos.length} pagos...`);

    try {
        const batch = db.batch();
        const creditosSnapshot = await db.collection('creditos').where(firebase.firestore.FieldPath.documentId(), 'in', creditos.map(c => c.idCredito)).get();
        const creditosData = {};
        creditosSnapshot.forEach(doc => {
            creditosData[doc.id] = doc.data();
        });

        for (const credito of creditos) {
            const pagoData = {
                idCredito: credito.idCredito,
                monto: credito.pagoSemanal,
                tipoPago: 'grupal'
            };
            const creditoRef = db.collection('creditos').doc(pagoData.idCredito);
            const pagoRef = db.collection('pagos').doc();

            const creditoActualData = creditosData[pagoData.idCredito];
            if (creditoActualData) {
                const nuevoSaldo = creditoActualData.saldo - pagoData.monto;
                batch.update(creditoRef, {
                    saldo: nuevoSaldo,
                    estado: (nuevoSaldo <= 0.01) ? 'liquidado' : 'activo'
                });
                batch.set(pagoRef, {
                    ...pagoData,
                    fecha: new Date().toISOString(),
                    saldoDespues: nuevoSaldo
                });
            }
        }

        await batch.commit();

        showStatus('status_pago_grupo', `¡Éxito! Se registraron ${creditos.length} pagos grupales.`, 'success');
        document.getElementById('grupo-pago-details').classList.add('hidden');
        document.getElementById('grupo_pago_grupal').value = '';
        grupoDePagoActual = null;

    } catch (error) {
        console.error("Error al registrar pago grupal:", error);
        showStatus('status_pago_grupo', `Error crítico al registrar los pagos: ${error.message}`, 'error');
    } finally {
        showButtonLoading('btn-registrar-pago-grupal', false);
        showProcessingOverlay(false);
    }
}

// =============================================
// SECCIÓN DE REPORTES GRÁFICOS (NUEVA SECCIÓN)
// =============================================

async function handleGenerarGrafico() {
    if (cargaEnProgreso) {
        showStatus('status_graficos', 'Ya hay una operación en progreso. Por favor, espera.', 'warning');
        return;
    }
    cargaEnProgreso = true;
    showProcessingOverlay(true, 'Generando datos para el gráfico...');
    showButtonLoading('btn-generar-grafico', true, 'Generando...');

    try {
        const tipoReporte = document.getElementById('grafico_tipo_reporte').value;
        const fechaInicio = document.getElementById('grafico_fecha_inicio').value;
        const fechaFin = document.getElementById('grafico_fecha_fin').value;
        const sucursal = document.getElementById('grafico_sucursal').value;
        const agruparPor = document.getElementById('grafico_agrupar_por').value;
        const tipoGrafico = document.getElementById('grafico_tipo_grafico').value;

        if (!tipoReporte || !fechaInicio || !fechaFin) {
            throw new Error("Por favor, selecciona el tipo de reporte y las fechas.");
        }

        const chartContainer = document.getElementById('grafico-container');
        if (chartContainer) chartContainer.innerHTML = '<canvas id="myChart"></canvas>';
        if (currentChart) {
            currentChart.destroy();
        }

        // Llamada a la nueva función de la base de datos
        const { creditos, pagos } = await database.obtenerDatosParaGraficos({ sucursal, fechaInicio, fechaFin });
        
        let datosAgrupados = {};

        // Lógica para agrupar los datos
        const agruparDatos = (data, campoFecha, campoValor) => {
            const agrupados = {};
            data.forEach(item => {
                const fecha = parsearFecha(item[campoFecha]);
                if (!fecha) return;

                let clave;
                const anio = fecha.getUTCFullYear();
                const mes = fecha.getUTCMonth() + 1;
                const semana = Math.ceil(fecha.getUTCDate() / 7);

                if (agruparPor === 'anio') {
                    clave = `${anio}`;
                } else if (agruparPor === 'mes') {
                    clave = `${anio}-${String(mes).padStart(2, '0')}`;
                } else { // semana
                    clave = `${anio}-S${String(semana).padStart(2, '0')}`;
                }

                if (!agrupados[clave]) {
                    agrupados[clave] = 0;
                }
                agrupados[clave] += item[campoValor] || 0;
            });
            return agrupados;
        };

        if (tipoReporte === 'colocacion') {
            datosAgrupados = agruparDatos(creditos, 'fechaCreacion', 'monto');
        } else if (tipoReporte === 'recuperacion') {
            datosAgrupados = agruparDatos(pagos, 'fecha', 'monto');
        } else { // comportamiento
            // Esta es una métrica más compleja, por ahora usamos un ejemplo
            const pagosPorEstado = pagos.reduce((acc, pago) => {
                const tipo = pago.tipoPago || 'normal';
                if (!acc[tipo]) acc[tipo] = 0;
                acc[tipo] += pago.monto;
                return acc;
            }, {});
            datosAgrupados = pagosPorEstado;
        }

        const labels = Object.keys(datosAgrupados).sort();
        const data = labels.map(label => datosAgrupados[label]);
        
        const datosParaGrafico = {
            labels,
            datasets: [{
                label: `${tipoReporte.charAt(0).toUpperCase() + tipoReporte.slice(1)} por ${agruparPor}`,
                data,
                backgroundColor: tipoGrafico === 'line' ? 'transparent' : 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: tipoGrafico === 'line' ? 2 : 1,
            }]
        };

        const ctx = document.getElementById('myChart').getContext('2d');
        currentChart = new Chart(ctx, {
            type: tipoGrafico,
            data: datosParaGrafico,
            options: {
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                responsive: true,
                maintainAspectRatio: false
            }
        });

        showStatus('status_graficos', 'Gráfico generado exitosamente.', 'success');

    } catch (error) {
        console.error("Error al generar el gráfico:", error);
        showStatus('status_graficos', `Error: ${error.message}`, 'error');
    } finally {
        cargaEnProgreso = false;
        showProcessingOverlay(false);
        showButtonLoading('btn-generar-grafico', false);
    }
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
        button.innerHTML = '';
        button.classList.add('btn-loading');
        button.disabled = true;
    } else {
        button.innerHTML = button.getAttribute('data-original-text') || button.textContent;
        button.classList.remove('btn-loading');
        button.disabled = false;
    }
}

// =============================================
// FUNCIONES DE BARRA DE PROGRESO Y UTILIDADES
// =============================================

function showFixedProgress(percentage, message = '') {
    // Ya no se usa la bandera global `cargaEnProgreso` para mostrar/ocultar
    let progressContainer = document.getElementById('progress-container-fixed');
    if (!progressContainer) {
        progressContainer = document.createElement('div');
        progressContainer.id = 'progress-container-fixed';
        progressContainer.className = 'progress-container-fixed';
        progressContainer.innerHTML = `
            <div id="progress-bar-fixed" class="progress-bar-fixed"></div>
            <div id="progress-text-fixed" class="progress-text-fixed"></div>
            <button id="btn-cancelar-carga-fixed" class="btn-cancelar-carga-fixed" title="Cancelar carga">
                <i class="fas fa-times"></i>
            </button>
        `;
        document.body.insertBefore(progressContainer, document.body.firstChild);
        document.getElementById('btn-cancelar-carga-fixed').addEventListener('click', cancelarCarga);
    }
    document.getElementById('progress-bar-fixed').style.width = percentage + '%';
    document.getElementById('progress-text-fixed').textContent = message;
    progressContainer.style.display = 'flex';
    document.body.classList.add('has-progress');
}

function hideFixedProgress() {
    const progressContainer = document.getElementById('progress-container-fixed');
    if (progressContainer) {
        progressContainer.style.display = 'none';
        document.body.classList.remove('has-progress');
    }
    // No modificar `cargaEnProgreso` aquí, se maneja en cada función
}

function cancelarCarga() {
    currentSearchOperation = null; // Anula la operación actual
    cargaEnProgreso = false; // Forzar la detención de cualquier bucle
    hideFixedProgress();
    showStatus('status_gestion_clientes', 'Búsqueda cancelada por el usuario.', 'info');
    const tabla = document.getElementById('tabla-clientes');
    if (tabla) tabla.innerHTML = '<tr><td colspan="6">Búsqueda cancelada. Utiliza los filtros para buscar de nuevo.</td></tr>';
    showButtonLoading('btn-aplicar-filtros', false); // Asegurarse de reactivar el botón
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
    const poblacionesLeon = ["ARANDAS", "ARANDAS [E]", "BAJIO DE BONILLAS", "BAJIO DE BONILLAS [E]", "CAPULIN", "CARDENAS", "CARDENAS [E]", "CERRITO DE AGUA CALIENTE", "CERRITO DE AGUA CALIENTE [E]", "CORRALEJO", "CORRALEJO [E]", "CUERAMARO", "CUERAMARO [E]", "DOLORES HIDALGO", "EL ALACRAN", "EL EDEN", "EL FUERTE", "EL MEZQUITILLO", "EL MEZQUITILLO [E]", "EL PALENQUE", "EL PALENQUE [E]", "EL PAXTLE", "EL TULE", "EL TULE [E]", "ESTACION ABASOLO", "ESTACION ABASOLO [E]", "ESTACION CORRALEJO", "ESTACION CORRALEJO [E]", "ESTACION JOAQUIN", "ESTACION JOAQUIN [E]", "EX ESTACION CHIRIMOYA", "EX ESTacion CHIRIMOYA [E]", "GAVIA DE RIONDA", "GODOY", "GODOY [E]", "IBARRA", "IBARRA [E]", "LA ALDEA", "LA CARROZA", "LA CARROZA [E]", "LA ESCONDIDA", "LA SANDIA", "LA SANDIA [E]", "LAGUNA DE GUADALUPE", "LAS CRUCES", "LAS CRUCES [E]", "LAS MASAS", "LAS MASAS [E]", "LAS PALOMAS", "LAS TIRITAS", "LOMA DE LA ESPERANZA", "LOMA DE LA ESPERANZA [E]", "LOS DOLORES", "LOS GALVANES", "LOS GALVANES [E]", "MAGUEY BLANCO", "MEDRANOS", "MEXICANOS", "MEXICANOS [E]", "MINERAL DE LA LUZ", "MISION DE ABAJO", "MISION DE ABAJO [E]", "MISION DE ARRIBA", "MISION DE ARRIBA [E]", "NORIA DE ALDAY", "OCAMPO", "PURISIMA DEL RINCON", "PURISima DEL RINCON [E]", "RANCHO NUEVO DE LA CRUZ", "RANCHO NUEVO DE LA CRUZ [E]", "RANCHO VIEJO", "RIO LAJA", "RIO LAJA [E]", "SAN ANDRES DE JALPA", "SAN ANDRES DE JALPA [E]", "SAN BERNARDO", "SAN BERNARDO [E]", "SAN CRISTOBAL", "SAN CRISTOBAL [E]", "SAN GREGORIO", "SAN GREGORIO [E]", "SAN ISIDRO DE CRESPO", "SAN ISIDRO DE CRESPO [E]", "SAN JOSE DE BADILLO", "SAN JOSE DE BADILLO [E]", "SAN JOSE DEL RODEO", "SAN JOSE DEL RODEO [E]", "SAN JUAN DE LA PUERTA", "SAN JUAN DE LA PUERTA [E]", "SANTA ANA DEL CONDE", "SANTA ROSA", "SANTA ROSA [E]", "SANTA ROSA PLAN DE AYALA", "SANTA ROSA PLAN DE AYALA [E]", "SANTO DOMINGO", "SERRANO", "TENERIA DEL SANTUARIO", "TENERIA DEL SANTUARIO [E]", "TIERRAS BLANCAS", "TIERRAS BLANCAS [E]", "TREJO", "TREJO [E]", "TUPATARO", "TUPATARO [E]", "VALTIERRILLA", "VALTIERRILLA 2", "VALTIERRILLA [E]", "VAQUERIAS", "VILLA DE ARRIAGA", "VILLA DE ARRIAGA [E]"].sort();

    // Si se está editando, mostrar todas las poblaciones para permitir cambios de sucursal
    const poblaciones = editingClientId ? [...new Set([...poblacionesGdl, ...poblacionesLeon])].sort() : (office === 'LEON' ? poblacionesLeon : poblacionesGdl);

    popularDropdown('poblacion_grupo_cliente', poblaciones, 'Selecciona población/grupo');
}

// =============================================
// LÓGICA DE NEGOCIO Y CÁLCULOS
// =============================================
function inicializarDropdowns() {
    console.log('Inicializando dropdowns...');
    const poblacionesGdl = ['LA CALERA', 'ATEQUIZA', 'SAN JACINTO', 'PONCITLAN', 'OCOTLAN', 'ARENAL', 'AMATITAN', 'ACATLAN DE JUAREZ', 'BELLAVISTA', 'SAN ISIDRO MAZATEPEC', 'TALA', 'CUISILLOS', 'HUAXTLA', 'NEXTIPAC', 'SANTA LUCIA', 'JAMAY', 'LA BARCA', 'SAN JUAN DE OCOTAN', 'TALA 2', 'EL HUMEDO', 'NEXTIPAC 2', 'ZZ PUEBLO'];
    const poblacionesLeon = ["ARANDAS", "ARANDAS [E]", "BAJIO DE BONILLAS", "BAJIO DE BONILLAS [E]", "CAPULIN", "CARDENAS", "CARDENAS [E]", "CERRITO DE AGUA CALIENTE", "CERRITO DE AGUA CALIENTE [E]", "CORRALEJO", "CORRALEJO [E]", "CUERAMARO", "CUERAMARO [E]", "DOLORES HIDALGO", "EL ALACRAN", "EL EDEN", "EL FUERTE", "EL MEZQUITILLO", "EL MEZQUITILLO [E]", "EL PALENQUE", "EL PALENQUE [E]", "EL PAXTLE", "EL TULE", "EL TULE [E]", "ESTACION ABASOLO", "ESTACION ABASOLO [E]", "ESTACION CORRALEJO", "ESTACION CORRALEJO [E]", "ESTACION JOAQUIN", "ESTACION JOAQUIN [E]", "EX ESTACION CHIRIMOYA", "EX ESTacion CHIRIMOYA [E]", "GAVIA DE RIONDA", "GODOY", "GODOY [E]", "IBARRA", "IBARRA [E]", "LA ALDEA", "LA CARROZA", "LA CARROZA [E]", "LA ESCONDIDA", "LA SANDIA", "LA SANDIA [E]", "LAGUNA DE GUADALUPE", "LAS CRUCES", "LAS CRUCES [E]", "LAS MASAS", "LAS MASAS [E]", "LAS PALOMAS", "LAS TIRITAS", "LOMA DE LA ESPERANZA", "LOMA DE LA ESPERANZA [E]", "LOS DOLORES", "LOS GALVANES", "LOS GALVANES [E]", "MAGUEY BLANCO", "MEDRANOS", "MEXICANOS", "MEXICANOS [E]", "MINERAL DE LA LUZ", "MISION DE ABAJO", "MISION DE ABAJO [E]", "MISION DE ARRIBA", "MISION DE ARRIBA [E]", "NORIA DE ALDAY", "OCAMPO", "PURISIMA DEL RINCON", "PURISima DEL RINCON [E]", "RANCHO NUEVO DE LA CRUZ", "RANCHO NUEVO DE LA CRUZ [E]", "RANCHO VIEJO", "RIO LAJA", "RIO LAJA [E]", "SAN ANDRES DE JALPA", "SAN ANDRES DE JALPA [E]", "SAN BERNARDO", "SAN BERNARDO [E]", "SAN CRISTOBAL", "SAN CRISTOBAL [E]", "SAN GREGORIO", "SAN GREGORIO [E]", "SAN ISIDRO DE CRESPO", "SAN ISIDRO DE CRESPO [E]", "SAN JOSE DE BADILLO", "SAN JOSE DE BADILLO [E]", "SAN JOSE DEL RODEO", "SAN JOSE DEL RODEO [E]", "SAN JUAN DE LA PUERTA", "SAN JUAN DE LA PUERTA [E]", "SANTA ANA DEL CONDE", "SANTA ROSA", "SANTA ROSA [E]", "SANTA ROSA PLAN DE AYALA", "SANTA ROSA PLAN DE AYALA [E]", "SANTO DOMINGO", "SERRANO", "TENERIA DEL SANTUARIO", "TENERIA DEL SANTUARIO [E]", "TIERRAS BLANCAS", "TIERRAS BLANCAS [E]", "TREJO", "TREJO [E]", "TUPATARO", "TUPATARO [E]", "VALTIERRILLA", "VALTIERRILLA 2", "VALTIERRILLA [E]", "VAQUERIAS", "VILLA DE ARRIAGA", "VILLA DE ARRIAGA [E]"].sort();
    const rutas = ['AUDITORIA', 'SUPERVISION', 'ADMINISTRACION', 'DIRECCION', 'COMERCIAL', 'COBRANZA', 'R1', 'R2', 'R3', 'JC1', 'RX'];
    const tiposCredito = ['NUEVO', 'RENOVACION', 'REINGRESO'];
    const montos = [3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000, 9000, 10000];
    const plazos = [13, 14];
    const estadosCredito = ['al corriente', 'atrasado', 'cobranza', 'juridico', 'liquidado'];
    const tiposPago = ['normal', 'extraordinario', 'actualizado'];
    const sucursales = ['GDL', 'LEON'];
    const roles = [
        { value: 'admin', text: 'Administrador' },
        { value: 'supervisor', text: 'Supervisor' },
        { value: 'cobrador', text: 'Cobrador' },
        { value: 'consulta', text: 'Consulta' },
        { value: 'comisionista', text: 'Comisionista' }
    ];

    popularDropdown('poblacion_grupo_cliente', poblacionesGdl, 'Selecciona población/grupo');
    popularDropdown('ruta_cliente', rutas, 'Selecciona una ruta');
    popularDropdown('tipo_colocacion', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Selecciona tipo', true);
    popularDropdown('monto_colocacion', montos.map(m => ({ value: m, text: `$${m.toLocaleString()}` })), 'Selecciona monto', true);

    const todasLasPoblaciones = [...new Set([...poblacionesGdl, ...poblacionesLeon])].sort();
    popularDropdown('grupo_filtro', todasLasPoblaciones, 'Todos');
    popularDropdown('grupo_pago_grupal', todasLasPoblaciones, 'Selecciona un Grupo'); // Para pago grupal

    popularDropdown('tipo_colocacion_filtro', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Todos', true);
    popularDropdown('plazo_filtro', [...plazos, 10].sort((a, b) => a - b).map(p => ({ value: p, text: `${p} semanas` })), 'Todos', true);
    popularDropdown('estado_credito_filtro', estadosCredito.map(e => ({ value: e, text: e.charAt(0).toUpperCase() + e.slice(1) })), 'Todos', true);
    popularDropdown('filtro-rol-usuario', roles, 'Todos los roles', true);
    document.getElementById('nuevo-rol').innerHTML = `<option value="">Seleccione un rol</option>` + roles.map(r => `<option value="${r.value}">${r.text}</option>`).join('');

    popularDropdown('sucursal_filtro_reporte', sucursales, 'Todas');
    popularDropdown('grupo_filtro_reporte', todasLasPoblaciones, 'Todos');
    popularDropdown('ruta_filtro_reporte', rutas, 'Todas');
    popularDropdown('tipo_credito_filtro_reporte', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Todos', true);
    popularDropdown('estado_credito_filtro_reporte', estadosCredito.map(e => ({ value: e, text: e.toUpperCase() })), 'Todos', true);
    popularDropdown('tipo_pago_filtro_reporte', tiposPago.map(t => ({ value: t, text: t.toUpperCase() })), 'Todos', true);

    // Dropdown para reportes gráficos
    const tiposDeReporteGrafico = [
        { value: 'colocacion', text: 'Colocación (Monto)' },
        { value: 'recuperacion', text: 'Recuperación (Pagos)' },
        { value: 'comportamiento', text: 'Comportamiento de Pago' },
    ];
    popularDropdown('grafico_tipo_reporte', tiposDeReporteGrafico, 'Selecciona un reporte', true);

    console.log('Dropdowns inicializados correctamente');
}

// =============================================
// LÓGICA DE NEGOCIO
// =============================================
function _calcularEstadoCredito(credito, pagos) {
    if (!credito) {
        console.error("Cálculo de estado fallido: El objeto de crédito es nulo.");
        return null;
    }

    const montoPagado = pagos.reduce((sum, pago) => sum + (pago.monto || 0), 0);
    const saldoReal = (credito.montoTotal || 0) - montoPagado;

    if (!credito.montoTotal || !credito.plazo || credito.plazo <= 0) {
        const estadoSimple = saldoReal <= 0.01 ? 'liquidado' : 'activo';
        return { estado: estadoSimple, diasAtraso: 0, semanasAtraso: 0, pagoSemanal: 0, proximaFechaPago: null };
    }

    if (saldoReal <= 0.01) {
        return { estado: 'liquidado', diasAtraso: 0, semanasAtraso: 0, pagoSemanal: 0, proximaFechaPago: null };
    }

    const fechaInicio = parsearFecha(credito.fechaCreacion);
    if (!fechaInicio) {
        console.error(`Cálculo de estado fallido para crédito ID ${credito.id}: Fecha de creación inválida.`, credito.fechaCreacion);
        return { estado: 'indeterminado', diasAtraso: 0, semanasAtraso: 0, pagoSemanal: 0, proximaFechaPago: null };
    }

    const pagoSemanal = credito.montoTotal / credito.plazo;
    const hoy = new Date();

    if (fechaInicio > hoy) {
        return { estado: 'al corriente', diasAtraso: 0, semanasAtraso: 0, pagoSemanal, proximaFechaPago: fechaInicio };
    }

    const milisegundosPorDia = 1000 * 60 * 60 * 24;
    const diasTranscurridos = Math.floor((hoy - fechaInicio) / milisegundosPorDia);
    const semanasTranscurridas = Math.max(0, diasTranscurridos / 7);

    const pagoRequerido = Math.min(semanasTranscurridas * pagoSemanal, credito.montoTotal);
    const deficit = pagoRequerido - montoPagado;
    const diasAtraso = (deficit > 0) ? (deficit / pagoSemanal) * 7 : 0;

    let estado = 'al corriente';
    if (diasAtraso > 300) estado = 'juridico';
    else if (diasAtraso > 150) estado = 'cobranza';
    else if (diasAtraso >= 7) estado = 'atrasado';

    const semanasPagadas = montoPagado / pagoSemanal;
    const proximaFecha = new Date(fechaInicio);
    proximaFecha.setDate(proximaFecha.getDate() + (Math.floor(semanasPagadas) + 1) * 7);

    return {
        estado,
        diasAtraso: Math.round(diasAtraso),
        semanasAtraso: Math.ceil(diasAtraso / 7),
        pagoSemanal,
        proximaFechaPago: proximaFecha
    };
}


async function obtenerHistorialCreditoCliente(curp, idCreditoEspecifico = null) {
    const creditosCliente = await database.buscarCreditosPorCliente(curp);
    if (creditosCliente.length === 0) return null;

    creditosCliente.sort((a, b) => (parsearFecha(a.fechaCreacion)?.getTime() || 0) - (parsearFecha(b.fechaCreacion)?.getTime() || 0));

    const primerCredito = creditosCliente[0];
    const fechaRegistro = parsearFecha(primerCredito.fechaCreacion);

    creditosCliente.sort((a, b) => (parsearFecha(b.fechaCreacion)?.getTime() || 0) - (parsearFecha(a.fechaCreacion)?.getTime() || 0));

    const creditosLiquidados = creditosCliente.filter(c => c.estado === 'liquidado');

    let creditoActual;
    if (idCreditoEspecifico) {
        creditoActual = creditosCliente.find(c => c.id === idCreditoEspecifico);
    } else {
        creditoActual = creditosCliente.find(c => c.estado !== 'liquidado') || creditosCliente[0];
    }

    if (!creditoActual) return null;

    const cicloCredito = creditosLiquidados.filter(c => parsearFecha(c.fechaCreacion) < parsearFecha(creditoActual.fechaCreacion)).length + 1;
    const pagos = await database.getPagosPorCredito(creditoActual.id);

    pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0));

    const ultimoPago = pagos.length > 0 ? pagos[0] : null;
    const estadoCalculado = _calcularEstadoCredito(creditoActual, pagos);

    if (!estadoCalculado) return null;

    const fechaUltimoPagoObj = ultimoPago ? parsearFecha(ultimoPago.fecha) : null;

    const montoPagadoTotal = pagos.reduce((sum, pago) => sum + (pago.monto || 0), 0);
    const saldoRestante = Math.max(0, (creditoActual.montoTotal || 0) - montoPagadoTotal);

    let semanasPagadas = 0;
    if (estadoCalculado.pagoSemanal > 0) {
        semanasPagadas = Math.floor(montoPagadoTotal / estadoCalculado.pagoSemanal);
    }

    if (estadoCalculado.estado === 'liquidado' && creditoActual.plazo) {
        semanasPagadas = creditoActual.plazo;
    }

    return {
        idCredito: creditoActual.id,
        saldoRestante: saldoRestante,
        fechaUltimoPago: formatDateForDisplay(fechaUltimoPagoObj),
        fechaRegistro: formatDateForDisplay(fechaRegistro),
        totalPagos: pagos.length,
        plazoTotal: creditoActual.plazo,
        nombreAval: creditoActual.nombreAval || 'N/A',
        curpAval: creditoActual.curpAval || 'N/A',
        cicloCredito: cicloCredito,
        semanasPagadas: semanasPagadas,
        ...estadoCalculado,
        proximaFechaPago: formatDateForDisplay(estadoCalculado.proximaFechaPago)
    };
}


// =============================================
// SECCIÓN DE BÚSQUEDA DE CLIENTES (REESCRITA PARA ALTO RENDIMIENTO)
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
        showStatus('status_gestion_clientes', 'Ya hay una búsqueda en progreso. Por favor, espera.', 'warning');
        return;
    }
    cargaEnProgreso = true;
    currentSearchOperation = Date.now();
    const operationId = currentSearchOperation;

    const tbody = document.getElementById('tabla-clientes');
    tbody.innerHTML = '<tr><td colspan="6">Buscando...</td></tr>';
    showButtonLoading('btn-aplicar-filtros', true, 'Buscando...');
    showFixedProgress(10, 'Iniciando búsqueda...');

    try {
        const filtros = {
            sucursal: document.getElementById('sucursal_filtro')?.value || '',
            curp: document.getElementById('curp_filtro')?.value?.trim() || '',
            nombre: document.getElementById('nombre_filtro')?.value?.trim() || '',
            idCredito: document.getElementById('id_credito_filtro')?.value?.trim() || '',
            estado: document.getElementById('estado_credito_filtro')?.value || '',
            curpAval: document.getElementById('curp_aval_filtro')?.value?.trim() || '',
            plazo: document.getElementById('plazo_filtro')?.value || '',
            grupo: document.getElementById('grupo_filtro')?.value || ''
        };

        const hayFiltros = Object.values(filtros).some(val => val && val.trim() !== '');
        if (!hayFiltros) {
            tbody.innerHTML = '<tr><td colspan="6">Por favor, especifica al menos un criterio de búsqueda.</td></tr>';
            throw new Error("Búsqueda vacía");
        }

        showFixedProgress(25, 'Buscando clientes...');
        let clientesIniciales = await database.buscarClientes({ sucursal: filtros.sucursal, curp: filtros.curp, nombre: filtros.nombre, grupo: filtros.grupo });
        if (operationId !== currentSearchOperation) throw new Error("Búsqueda cancelada");
        if (clientesIniciales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No se encontraron clientes con los filtros principales.</td></tr>';
            throw new Error("Sin resultados");
        }
        
        showFixedProgress(50, `Procesando ${clientesIniciales.length} clientes...`);
        tbody.innerHTML = '';
        let resultadosEncontrados = 0;
        let clientesProcesados = 0;

        for (const cliente of clientesIniciales) {
            if (operationId !== currentSearchOperation) throw new Error("Búsqueda cancelada");

            clientesProcesados++;
            const progress = 50 + Math.round((clientesProcesados / clientesIniciales.length) * 50);
            showFixedProgress(progress, `Procesando ${clientesProcesados} de ${clientesIniciales.length}...`);

            // **LÓGICA RESTAURADA Y CONFIABLE**
            const historial = await obtenerHistorialCreditoCliente(cliente.curp);

            // Aplicar filtros secundarios en memoria
            if ((filtros.estado && (!historial || historial.estado !== filtros.estado)) ||
                (filtros.curpAval && (!historial || !historial.curpAval?.toUpperCase().includes(filtros.curpAval.toUpperCase()))) ||
                (filtros.plazo && (!historial || historial.plazoTotal != filtros.plazo)) ||
                (filtros.idCredito && (!historial || historial.idCredito !== filtros.idCredito))) {
                continue;
            }

            resultadosEncontrados++;
            
            // **NUEVA LÓGICA PARA BADGE DE COMISIONISTA EN CLIENTES**
            const comisionistaBadge = cliente.isComisionista ? '<span class="comisionista-badge-cliente">COMISIONISTA</span>' : '';
            
            let infoCreditoHTML = '<em>Sin historial de crédito</em>';
            if (historial) {
                const estadoClase = `status-${historial.estado.replace(/\s/g, '-')}`;
                const estadoHTML = `<span class="info-value ${estadoClase}">${historial.estado.toUpperCase()}</span>`;
                const cicloSuffix = { 1: 'er', 2: 'do', 3: 'er' }[historial.cicloCredito] || 'º';
                infoCreditoHTML = `
                    <div class="credito-info">
                        <div class="info-grid">
                            <div class="info-item"><span class="info-label">Crédito ID:</span><span class="info-value">${historial.idCredito}</span></div>
                            <div class="info-item"><span class="info-label">Estado:</span>${estadoHTML}</div>
                            <div class="info-item"><span class="info-label">Ciclo:</span><span class="info-value">${historial.cicloCredito}${cicloSuffix} Crédito</span></div>
                            <div class="info-item"><span class="info-label">Saldo:</span><span class="info-value">$${historial.saldoRestante.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                            <div class="info-item"><span class="info-label">Semanas Pagadas:</span><span class="info-value">${historial.semanasPagadas} de ${historial.plazoTotal}</span></div>
                            ${historial.semanasAtraso > 0 ? `<div class="info-item"><span class="info-label">Semanas Atraso:</span><span class="info-value">${historial.semanasAtraso}</span></div>` : ''}
                            <div class="info-item"><span class="info-label">Último Pago:</span><span class="info-value">${historial.fechaUltimoPago}</span></div>
                            <div class="info-item"><span class="info-label">Nombre Aval:</span><span class="info-value">${historial.nombreAval}</span></div>
                        </div>
                    </div>`;
            }

            const rowHTML = `
                <tr>
                    <td><b>${cliente.office || 'N/A'}</b><br><small>Registro: ${historial ? historial.fechaRegistro : 'N/A'}</small></td>
                    <td>${cliente.curp}</td>
                    <td>${cliente.nombre} ${comisionistaBadge}</td>
                    <td>${cliente.poblacion_grupo}</td>
                    <td>${infoCreditoHTML}</td>
                    <td class="action-buttons">
                        <button class="btn btn-sm btn-info" onclick="editCliente('${cliente.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deleteCliente('${cliente.id}', '${cliente.nombre}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            tbody.insertAdjacentHTML('beforeend', rowHTML);
        }

        if (resultadosEncontrados === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No hay clientes que coincidan con todos los criterios de filtro.</td></tr>';
        }

        showFixedProgress(100, `Búsqueda completada: ${resultadosEncontrados} resultados encontrados.`);

    } catch (error) {
        if (error.message !== "Búsqueda cancelada" && error.message !== "Sin resultados" && error.message !== "Búsqueda vacía") {
            console.error('Error cargando clientes:', error);
            tbody.innerHTML = '<tr><td colspan="6">Error al cargar los clientes. Revisa la consola para más detalles.</td></tr>';
        }
    } finally {
        if (operationId === currentSearchOperation) {
            cargaEnProgreso = false;
            showButtonLoading('btn-aplicar-filtros', false);
            setTimeout(hideFixedProgress, 2000);
        }
    }
}


async function loadBasicReports() {
    showProcessingOverlay(true, 'Generando reportes...');
    showButtonLoading('btn-actualizar-reportes', true, 'Generando...');
    showFixedProgress(30, 'Recopilando datos...');

    try {
        showFixedProgress(60, 'Generando estadísticas...');
        const reportes = await database.generarReportes();

        if (!reportes) {
            showStatus('status_reportes', 'Error al generar reportes.', 'error');
            throw new Error('La función generarReportes devolvió null.');
        }

        showFixedProgress(80, 'Actualizando interfaz...');
        const elementos = {
            'total-clientes': reportes.totalClientes,
            'total-creditos': reportes.totalCreditos,
            'total-cartera': `$${reportes.totalCartera.toLocaleString()}`,
            'total-vencidos': reportes.totalVencidos,
            'pagos-registrados': reportes.pagosRegistrados,
            'cobrado-mes': `$${reportes.cobradoMes.toLocaleString()}`,
            'total-comisiones': `$${reportes.totalComisiones.toLocaleString()}`
        };

        Object.entries(elementos).forEach(([id, valor]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = valor;
        });

        const tasaElement = document.getElementById('tasa-recuperacion');
        if (tasaElement) tasaElement.textContent = `${reportes.tasaRecuperacion.toFixed(1)}%`;

        showFixedProgress(100, 'Reportes actualizados');
        showStatus('status_reportes', 'Reportes actualizados correctamente.', 'success');
    } catch (error) {
        console.error('Error cargando reportes:', error);
        showStatus('status_reportes', 'Error al cargar los reportes: ' + error.message, 'error');
    } finally {
        showProcessingOverlay(false);
        showButtonLoading('btn-actualizar-reportes', false);
        setTimeout(hideFixedProgress, 1000);
    }
}

function inicializarVistaReportesAvanzados() {
    const tbody = document.getElementById('tabla-reportes_avanzados');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="10">Aplica los filtros para generar el reporte.</td></tr>';
    }
    const hoy = new Date();
    const haceUnMes = new Date(hoy.getFullYear(), hoy.getMonth() - 1, hoy.getDate());
    const fechaInicio = document.getElementById('fecha_inicio_reporte');
    const fechaFin = document.getElementById('fecha_fin_reporte');

    if (fechaInicio) fechaInicio.value = haceUnMes.toISOString().split('T')[0];
    if (fechaFin) fechaFin.value = hoy.toISOString().split('T')[0];
}

function limpiarFiltrosReportes() {
    if (cargaEnProgreso) {
        cancelarCarga();
    }

    const filtrosContainer = document.getElementById('filtros-reportes-avanzados');
    if (filtrosContainer) {
        filtrosContainer.querySelectorAll('input, select').forEach(el => {
            if (el.type !== 'date') el.value = '';
        });
    }
    const hoy = new Date();
    const haceUnMes = new Date(hoy.getFullYear(), hoy.getMonth() - 1, hoy.getDate());
    const fechaInicio = document.getElementById('fecha_inicio_reporte');
    const fechaFin = document.getElementById('fecha_fin_reporte');

    if (fechaInicio) fechaInicio.value = haceUnMes.toISOString().split('T')[0];
    if (fechaFin) fechaFin.value = hoy.toISOString().split('T')[0];

    showButtonLoading('btn-aplicar-filtros-reportes', false);

    showStatus('status_reportes_avanzados', 'Filtros limpiados correctamente.', 'success');
}

async function loadAdvancedReports() {
    if (cargaEnProgreso) {
        showStatus('status_reportes_avanzados', 'Ya hay una carga en progreso. Espere a que termine.', 'warning');
        return;
    }
    cargaEnProgreso = true;

    showProcessingOverlay(true, 'Generando reporte avanzado...');
    showButtonLoading('btn-aplicar-filtros-reportes', true, 'Generando...');
    showFixedProgress(20, 'Aplicando filtros...');

    try {
        const filtros = {
            sucursal: document.getElementById('sucursal_filtro_reporte')?.value || '',
            grupo: document.getElementById('grupo_filtro_reporte')?.value || '',
            ruta: document.getElementById('ruta_filtro_reporte')?.value || '',
            tipoCredito: document.getElementById('tipo_credito_filtro_reporte')?.value || '',
            estadoCredito: document.getElementById('estado_credito_filtro_reporte')?.value || '',
            tipoPago: document.getElementById('tipo_pago_filtro_reporte')?.value || '',
            fechaInicio: document.getElementById('fecha_inicio_reporte')?.value || '',
            fechaFin: document.getElementById('fecha_fin_reporte')?.value || '',
            curpCliente: document.getElementById('curp_filtro_reporte')?.value || '',
            idCredito: document.getElementById('id_credito_filtro_reporte')?.value || ''
        };

        showFixedProgress(50, 'Generando reporte...');
        reportData = await database.generarReporteAvanzado(filtros);

        if (!cargaEnProgreso) {
            return;
        }

        showFixedProgress(80, 'Mostrando resultados...');
        mostrarReporteAvanzado(reportData);
        showFixedProgress(100, 'Reporte generado');

        showStatus('status_reportes_avanzados', `Reporte generado: ${reportData.length} registros encontrados.`, 'success');

    } catch (error) {
        console.error('Error generando reporte avanzado:', error);
        showStatus('status_reportes_avanzados', 'Error al generar el reporte: ' + error.message, 'error');
    } finally {
        showProcessingOverlay(false);
        showButtonLoading('btn-aplicar-filtros-reportes', false);
        setTimeout(hideFixedProgress, 1000);
        cargaEnProgreso = false;
    }
}

function mostrarReporteAvanzado(data) {
    const tbody = document.getElementById('tabla-reportes_avanzados');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10">No se encontraron datos con los filtros aplicados.</td></tr>';
        return;
    }

    data.forEach(item => {
        const tr = document.createElement('tr');

        const fechaRegistro = formatDateForDisplay(parsearFecha(item.fechaRegistro));
        const fechaCreacion = formatDateForDisplay(parsearFecha(item.fechaCreacion));
        const fechaPago = formatDateForDisplay(parsearFecha(item.fecha));

        let rowContent = '';
        if (item.tipo === 'cliente') {
            rowContent = `
                <td>CLIENTE</td>
                <td>${item.curp || ''}</td>
                <td>${item.nombre || ''}</td>
                <td>${item.poblacion_grupo || ''}</td>
                <td>${item.ruta || ''}</td>
                <td>${item.office || ''}</td>
                <td>${fechaRegistro}</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
            `;
        } else if (item.tipo === 'credito') {
            rowContent = `
                <td>CRÉDITO</td>
                <td>${item.curpCliente || ''}</td>
                <td>${item.nombreCliente || ''}</td>
                <td>${item.poblacion_grupo || ''}</td>
                <td>${item.ruta || ''}</td>
                <td>${item.office || ''}</td>
                <td>${fechaCreacion}</td>
                <td>${item.tipo || ''}</td>
                <td>$${item.monto ? item.monto.toLocaleString() : '0'}</td>
                <td>$${item.saldo ? item.saldo.toLocaleString() : '0'}</td>
            `;
        } else if (item.tipo === 'pago') {
            rowContent = `
                <td>PAGO</td>
                <td>${item.curpCliente || ''}</td>
                <td>${item.nombreCliente || ''}</td>
                <td>${item.poblacion_grupo || ''}</td>
                <td>${item.ruta || ''}</td>
                <td>${item.office || ''}</td>
                <td>${fechaPago}</td>
                <td>${item.tipoPago || ''}</td>
                <td>$${item.monto ? item.monto.toLocaleString() : '0'}</td>
                <td>$${item.saldoDespues ? item.saldoDespues.toLocaleString() : '0'}</td>
            `;
        }

        tr.innerHTML = rowContent;
        tbody.appendChild(tr);
    });

    const totalRegistros = data.length;
    const totalClientes = data.filter(item => item.tipo === 'cliente').length;
    const totalCreditos = data.filter(item => item.tipo === 'credito').length;
    const totalPagos = data.filter(item => item.tipo === 'pago').length;
    const totalMontoPagos = data.filter(item => item.tipo === 'pago').reduce((sum, item) => sum + (item.monto || 0), 0);

    const estadisticasElement = document.getElementById('estadisticas-reporte');
    if (estadisticasElement) {
        estadisticasElement.innerHTML = `
            <div class="status-message status-info">
                <strong>Estadísticas del Reporte:</strong><br>
                Total Registros: ${totalRegistros} | 
                Clientes: ${totalClientes} | 
                Créditos: ${totalCreditos} | 
                Pagos: ${totalPagos} | 
                Total Pagado: $${totalMontoPagos.toLocaleString()}
            </div>
        `;
    }
}

function exportToCSV() {
    if (!reportData || reportData.length === 0) {
        showStatus('status_reportes_avanzados', 'No hay datos para exportar.', 'error');
        return;
    }

    showProcessingOverlay(true, 'Generando archivo CSV...');
    showButtonLoading('btn-exportar-csv', true, 'Generando CSV...');
    showFixedProgress(50, 'Preparando datos...');

    try {
        const headers = ['Tipo', 'CURP', 'Nombre', 'Grupo/Población', 'Ruta', 'Sucursal', 'Fecha', 'Tipo Operación', 'Monto', 'Saldo'];
        let csvContent = headers.join(',') + '\n';

        showFixedProgress(70, 'Generando CSV...');
        reportData.forEach(item => {
            let row = [];
            const fechaRegistro = formatDateForDisplay(parsearFecha(item.fechaRegistro));
            const fechaCreacion = formatDateForDisplay(parsearFecha(item.fechaCreacion));
            const fechaPago = formatDateForDisplay(parsearFecha(item.fecha));

            if (item.tipo === 'cliente') {
                row = ['CLIENTE', item.curp || '', `"${item.nombre || ''}"`, item.poblacion_grupo || '', item.ruta || '', item.office || '', fechaRegistro, '', '', ''];
            } else if (item.tipo === 'credito') {
                row = ['CRÉDITO', item.curpCliente || '', `"${item.nombreCliente || ''}"`, item.poblacion_grupo || '', item.ruta || '', item.office || '', fechaCreacion, item.tipo || '', item.monto || 0, item.saldo || 0];
            } else if (item.tipo === 'pago') {
                row = ['PAGO', item.curpCliente || '', `"${item.nombreCliente || ''}"`, item.poblacion_grupo || '', item.ruta || '', item.office || '', fechaPago, item.tipoPago || '', item.monto || 0, item.saldoDespues || 0];
            }

            csvContent += row.join(',') + '\n';
        });

        showFixedProgress(90, 'Creando archivo...');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `reporte_finzana_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showFixedProgress(100, 'Archivo exportado');
        showStatus('status_reportes_avanzados', 'Archivo CSV exportado exitosamente.', 'success');
    } catch (error) {
        console.error('Error exportando CSV:', error);
        showStatus('status_reportes_avanzados', 'Error al exportar CSV: ' + error.message, 'error');
    } finally {
        showProcessingOverlay(false);
        showButtonLoading('btn-exportar-csv', false);
        setTimeout(hideFixedProgress, 1000);
    }
}

function exportToPDF() {
    if (!reportData || reportData.length === 0) {
        alert('No hay datos para exportar. Genera un reporte primero.');
        return;
    }

    showProcessingOverlay(true, 'Generando archivo PDF...');
    showButtonLoading('btn-exportar-pdf', true, 'Generando PDF...');
    showFixedProgress(50, 'Preparando PDF...');

    try {
        const element = document.getElementById('view-reportes-avanzados');
        if (!element) {
            throw new Error('No se encontró el elemento para exportar');
        }

        const opt = {
            margin: 1,
            filename: `reporte_finzana_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'cm', format: 'a4', orientation: 'landscape' }
        };

        showFixedProgress(80, 'Generando PDF...');
        const tempElement = element.cloneNode(true);
        tempElement.style.width = '100%';
        tempElement.style.padding = '20px';

        const exportButtons = tempElement.querySelector('.export-buttons');
        if (exportButtons) exportButtons.style.display = 'none';

        document.body.appendChild(tempElement);

        html2pdf().set(opt).from(tempElement).save().then(() => {
            document.body.removeChild(tempElement);
            showFixedProgress(100, 'PDF generado');
            showStatus('status_reportes_avanzados', 'Archivo PDF exportado exitosamente.', 'success');
            showProcessingOverlay(false);
            showButtonLoading('btn-exportar-pdf', false);
            setTimeout(hideFixedProgress, 1000);
        }).catch(error => {
            console.error('Error generando PDF:', error);
            showStatus('status_reportes_avanzados', 'Error al exportar PDF: ' + error.message, 'error');
            showProcessingOverlay(false);
            showButtonLoading('btn-exportar-pdf', false);
            setTimeout(hideFixedProgress, 1000);
        });

    } catch (error) {
        console.error('Error exportando PDF:', error);
        showStatus('status_reportes_avanzados', 'Error al exportar PDF: ' + error.message, 'error');
        showProcessingOverlay(false);
        showButtonLoading('btn-exportar-pdf', false);
        setTimeout(hideFixedProgress, 1000);
    }
}

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
    // Llama a la función que ahora puede manejar el modo de edición
    handleOfficeChangeForClientForm.call({ value: cliente.office });

    setTimeout(() => { // Delay para asegurar que el dropdown se llene con todas las opciones
        document.getElementById('poblacion_grupo_cliente').value = cliente.poblacion_grupo;
    }, 100);

    const curpInput = document.getElementById('curp_cliente');
    curpInput.value = cliente.curp;

    // Habilitar edición de CURP solo para admin o supervisor
    if (currentUserData && (currentUserData.role === 'admin' || currentUserData.role === 'supervisor')) {
        curpInput.readOnly = false;
    } else {
        curpInput.readOnly = true;
    }

    document.getElementById('nombre_cliente').value = cliente.nombre;
    document.getElementById('domicilio_cliente').value = cliente.domicilio;
    document.getElementById('cp_cliente').value = cliente.cp;
    document.getElementById('telefono_cliente').value = cliente.telefono;
    document.getElementById('ruta_cliente').value = cliente.ruta;
    document.getElementById('comisionista_cliente').checked = cliente.isComisionista || false;

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
            loadClientesTable(); // Forzar recarga de la tabla
        }
        showProcessingOverlay(false);
    }
}

function actualizarPlazosSegunCliente(esComisionista) {
    const plazos = esComisionista ? [10] : [13, 14];
    popularDropdown('plazo_colocacion', plazos.map(p => ({ value: p, text: `${p} semanas` })), 'Selecciona plazo', true);
}


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
            // No hacer nada aquí, la carga se dispara con el botón de filtrar
            break;
        case 'view-cliente':
            if (!editingClientId) { // Si es un cliente nuevo
                resetClientForm();
            }
            break;
        case 'view-colocacion':
            // Limpiar el formulario al mostrar
            document.getElementById('curp_colocacion').value = '';
            document.getElementById('form-colocacion').classList.add('hidden');
            showStatus('status_colocacion', '', 'info');
            break;
        case 'view-pago-grupo':
            // Limpiar formulario de pago grupal al mostrar
            document.getElementById('grupo_pago_grupal').value = '';
            document.getElementById('grupo-pago-details').classList.add('hidden');
            showStatus('status_pago_grupo', '', 'info');
            grupoDePagoActual = null;
            break;
        case 'view-reportes-graficos':
            // Inicializar fechas al mostrar la vista de gráficos
            const hoy = new Date();
            const haceUnAnio = new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate());
            document.getElementById('grafico_fecha_inicio').value = haceUnAnio.toISOString().split('T')[0];
            document.getElementById('grafico_fecha_fin').value = hoy.toISOString().split('T')[0];
            break;
    }
});

// *** NUEVA FUNCIÓN PARA MANEJAR DUPLICADOS ***
async function handleVerificarDuplicados() {
    showProcessingOverlay(true, 'Buscando clientes duplicados...');
    showButtonLoading('btn-verificar-duplicados', true);
    try {
        const resultado = await database.encontrarClientesDuplicados();
        if (!resultado.success) {
            throw new Error(resultado.message);
        }

        const { idsParaEliminar, duplicadosEncontrados, curpsAfectadas } = resultado;

        if (idsParaEliminar.length === 0) {
            showStatus('status_usuarios', '¡Excelente! No se encontraron clientes duplicados en la base de datos.', 'success');
            return;
        }

        const confirmacion = confirm(
            `Se encontraron ${duplicadosEncontrados} registros que corresponden a ${curpsAfectadas.length} clientes duplicados (por CURP).\n\n` +
            `Se conservará el registro más reciente de cada uno y se eliminarán ${idsParaEliminar.length} registros antiguos.\n\n` +
            `¿Deseas proceder con la limpieza? Esta acción no se puede deshacer.`
        );

        if (confirmacion) {
            showProcessingOverlay(true, `Eliminando ${idsParaEliminar.length} registros...`);
            const resEliminacion = await database.ejecutarEliminacionDuplicados(idsParaEliminar);
            showStatus('status_usuarios', resEliminacion.message, resEliminacion.success ? 'success' : 'error');
        } else {
            showStatus('status_usuarios', 'Operación de limpieza cancelada por el usuario.', 'info');
        }

    } catch (error) {
        console.error("Error al verificar duplicados:", error);
        showStatus('status_usuarios', `Error al verificar duplicados: ${error.message}`, 'error');
    } finally {
        showProcessingOverlay(false);
        showButtonLoading('btn-verificar-duplicados', false);
    }
}


console.log('app.js cargado correctamente');
