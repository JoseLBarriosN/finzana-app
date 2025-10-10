// =============================================
// INICIALIZACIÓN DE LA APLICACIÓN CON FIREBASE - CORREGIDO COMPLETO
// =============================================

let currentUser = null;
let creditoActual = null;
let currentImportTab = 'clientes';
let reportData = null;
let cargaEnProgreso = false;
let currentSearchOperation = null;

// ===== INICIO DE LA MODIFICACIÓN (Traductor de Fechas) =====
/**
 * Parsea de forma segura una fecha que puede estar en formato dd-mm-yyyy o ISO.
 * @param {string} fechaStr La cadena de texto de la fecha.
 * @returns {Date|null} Un objeto Date válido o null si el formato es incorrecto.
 */
function parsearFecha_DDMMYYYY(fechaStr) {
    if (!fechaStr || typeof fechaStr !== 'string') {
        return null;
    }
    // Si ya es un formato ISO completo (generado por la app), úsalo directamente.
    if (fechaStr.includes('T') && fechaStr.includes('Z')) {
        const fecha = new Date(fechaStr);
        return isNaN(fecha.getTime()) ? null : fecha;
    }

    // Intenta parsear el formato dd-mm-yyyy
    const partes = fechaStr.split('-');
    if (partes.length === 3) {
        // Reordena a yyyy-mm-dd, un formato que new Date() entiende de forma fiable.
        const [dia, mes, anio] = partes;
        if (dia.length === 2 && mes.length === 2 && anio.length === 4) {
            const fechaISO = `${anio}-${mes}-${dia}`;
            const fecha = new Date(fechaISO);
            // Comprueba que la fecha resultante sea válida
            return isNaN(fecha.getTime()) ? null : fecha;
        }
    }

    // Si todo lo demás falla, intenta un último parseo directo (puede ser yyyy-mm-dd)
    const fechaDirecta = new Date(fechaStr);
    return isNaN(fechaDirecta.getTime()) ? null : fechaDirecta;
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
        btnNuevoUsuario.addEventListener('click', mostrarFormularioUsuario);
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

    // Registrar Cliente
    const formCliente = document.getElementById('form-cliente');
    if (formCliente) {
        formCliente.addEventListener('submit', handleClientForm);
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
        // Mostrar barra de progreso fija para importación
        showFixedProgress(0, 'Iniciando importación...');

        const resultado = await database.importarDatosDesdeCSV(csvData, currentImportTab, office);

        // Actualizar progreso al finalizar
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

async function handleClientForm(e) {
    e.preventDefault();
    const curp = document.getElementById('curp_cliente').value;
    if (!validarFormatoCURP(curp)) {
        showStatus('status_cliente', 'El CURP debe tener 18 caracteres.', 'error');
        return;
    }

    showButtonLoading('#form-cliente button[type="submit"]', true, 'Guardando...');
    showFixedProgress(50, 'Registrando cliente...');

    try {
        const cliente = {
            office: document.getElementById('office_cliente').value,
            curp,
            nombre: document.getElementById('nombre_cliente').value,
            domicilio: document.getElementById('domicilio_cliente').value,
            cp: document.getElementById('cp_cliente').value,
            telefono: document.getElementById('telefono_cliente').value,
            poblacion_grupo: document.getElementById('poblacion_grupo_cliente').value,
            ruta: document.getElementById('ruta_cliente').value
        };

        if (!cliente.nombre || !cliente.domicilio || !cliente.poblacion_grupo || !cliente.ruta) {
            showStatus('status_cliente', 'Los campos con * son obligatorios.', 'error');
            showButtonLoading('#form-cliente button[type="submit"]', false);
            hideFixedProgress();
            return;
        }

        const resultado = await database.agregarCliente(cliente);
        showFixedProgress(100, 'Cliente registrado exitosamente');
        showStatus('status_cliente', resultado.message, resultado.success ? 'success' : 'error');
        if (resultado.success) {
            e.target.reset();
            // Resetear el dropdown de población al de GDL por defecto
            handleOfficeChangeForClientForm.call({ value: 'GDL' });
        }
    } catch (error) {
        showStatus('status_cliente', 'Error al guardar el cliente: ' + error.message, 'error');
    } finally {
        showButtonLoading('#form-cliente button[type="submit"]', false);
        setTimeout(hideFixedProgress, 1000);
    }
}

// =============================================
// GESTIÓN DE USUARIOS
// =============================================

function mostrarFormularioUsuario() {
    const formContainer = document.getElementById('form-usuario-container');
    const formTitulo = document.getElementById('form-usuario-titulo');
    const form = document.getElementById('form-usuario');

    if (formContainer && formTitulo && form) {
        formTitulo.textContent = 'Nuevo Usuario';
        form.reset();
        formContainer.classList.remove('hidden');
    }
}

function ocultarFormularioUsuario() {
    const formContainer = document.getElementById('form-usuario-container');
    if (formContainer) {
        formContainer.classList.add('hidden');
    }
}

async function handleUserForm(e) {
    e.preventDefault();

    const email = document.getElementById('nuevo-email').value;
    const password = document.getElementById('nuevo-password').value;
    const nombre = document.getElementById('nuevo-nombre').value;
    const rol = document.getElementById('nuevo-rol').value;

    if (!email || !password || !nombre || !rol) {
        showStatus('status_usuarios', 'Todos los campos son obligatorios.', 'error');
        return;
    }

    showButtonLoading('#form-usuario button[type="submit"]', true, 'Creando usuario...');
    showFixedProgress(30, 'Creando usuario en Firebase Auth...');

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        showFixedProgress(60, 'Guardando perfil de usuario...');

        await db.collection('users').doc(user.uid).set({
            email: email,
            name: nombre,
            role: rol,
            createdAt: new Date().toISOString()
        });

        showFixedProgress(100, 'Usuario creado exitosamente');
        showStatus('status_usuarios', 'Usuario creado exitosamente.', 'success');

        e.target.reset();
        ocultarFormularioUsuario();

        await loadUsersTable();

    } catch (error) {
        console.error('Error creando usuario:', error);
        let mensajeError = 'Error al crear usuario: ';

        switch (error.code) {
            case 'auth/email-already-in-use':
                mensajeError += 'El correo electrónico ya está en uso.';
                break;
            case 'auth/invalid-email':
                mensajeError += 'El correo electrónico no es válido.';
                break;
            case 'auth/weak-password':
                mensajeError += 'La contraseña es demasiado débil.';
                break;
            default:
                mensajeError += error.message;
        }

        showStatus('status_usuarios', mensajeError, 'error');
    } finally {
        showButtonLoading('#form-usuario button[type="submit"]', false);
        setTimeout(hideFixedProgress, 1000);
    }
}

async function loadUsersTable() {
    if (cargaEnProgreso) {
        showStatus('status_usuarios', 'Ya hay una búsqueda en progreso. Espere a que termine.', 'warning');
        return;
    }
    cargaEnProgreso = true;

    const tbody = document.getElementById('tabla-usuarios');
    if (!tbody) {
        console.error('No se encontró el elemento tabla-usuarios');
        cargaEnProgreso = false;
        return;
    }

    tbody.innerHTML = '<tr><td colspan="5">Buscando usuarios...</td></tr>';
    showButtonLoading('btn-aplicar-filtros-usuarios', true, 'Buscando...');
    showFixedProgress(10, 'Aplicando filtros...');

    try {
        const filtros = {
            email: document.getElementById('filtro-email-usuario')?.value?.toLowerCase() || '',
            nombre: document.getElementById('filtro-nombre-usuario')?.value?.toLowerCase() || '',
            rol: document.getElementById('filtro-rol-usuario')?.value || ''
        };

        const hayFiltros = Object.values(filtros).some(val => val && val.trim() !== '');

        showFixedProgress(30, 'Buscando usuarios...');

        const usuarios = await database.obtenerUsuarios();

        if (!cargaEnProgreso) {
            tbody.innerHTML = '<tr><td colspan="5">Búsqueda cancelada.</td></tr>';
            return;
        }

        if (!usuarios.success) {
            throw new Error(usuarios.message);
        }

        let usuariosFiltrados = usuarios.data;

        if (hayFiltros) {
            usuariosFiltrados = usuariosFiltrados.filter(usuario => {
                const emailMatch = !filtros.email || (usuario.email && usuario.email.toLowerCase().includes(filtros.email));
                const nombreMatch = !filtros.nombre || (usuario.name && usuario.name.toLowerCase().includes(filtros.nombre));
                const rolMatch = !filtros.rol || usuario.role === filtros.rol;
                return emailMatch && nombreMatch && rolMatch;
            });
        }

        tbody.innerHTML = '';

        if (usuariosFiltrados.length === 0) {
            showFixedProgress(100, 'No se encontraron usuarios');
            tbody.innerHTML = '<tr><td colspan="5">No se encontraron usuarios con los filtros aplicados.</td></tr>';
            return;
        }

        showFixedProgress(70, `Mostrando ${usuariosFiltrados.length} usuarios...`);

        usuariosFiltrados.forEach(usuario => {
            const tr = document.createElement('tr');
            const roleBadgeClass = `role-${usuario.role || 'default'}`;
            tr.innerHTML = `
                <td>${usuario.email || 'N/A'}</td>
                <td>${usuario.name || 'N/A'}</td>
                <td><span class="role-badge ${roleBadgeClass}">${usuario.role || 'N/A'}</span></td>
                <td>${usuario.office || 'N/A'}</td>
                <td>${usuario.uid || 'N/A'}</td>
            `;
            tbody.appendChild(tr);
        });

        showFixedProgress(100, `${usuariosFiltrados.length} usuarios encontrados`);
        showStatus('status_usuarios', `Se encontraron ${usuariosFiltrados.length} usuarios.`, 'success');

    } catch (error) {
        console.error('Error cargando usuarios:', error);
        tbody.innerHTML = '<tr><td colspan="5">Error al cargar los usuarios.</td></tr>';
        showStatus('status_usuarios', 'Error al cargar usuarios: ' + error.message, 'error');
    } finally {
        showButtonLoading('btn-aplicar-filtros-usuarios', false);
        setTimeout(hideFixedProgress, 1000);
    }
}

function limpiarFiltrosUsuarios() {
    if (cargaEnProgreso) {
        cancelarCarga();
    }

    const filtroEmail = document.getElementById('filtro-email-usuario');
    if (filtroEmail) filtroEmail.value = '';
    const filtroNombre = document.getElementById('filtro-nombre-usuario');
    if (filtroNombre) filtroNombre.value = '';
    const filtroRol = document.getElementById('filtro-rol-usuario');
    if (filtroRol) filtroRol.value = '';

    showButtonLoading('btn-aplicar-filtros-usuarios', false);

    const tbody = document.getElementById('tabla-usuarios');
    if (tbody) tbody.innerHTML = '';
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

        if (resultado.success) {
            showStatus('status_colocacion', `${resultado.message}. ID de crédito: ${resultado.data.id}`, 'success');
            e.target.reset();
            const formColocacion = document.getElementById('form-colocacion');
            const curpColocacion = document.getElementById('curp_colocacion');
            if (formColocacion) formColocacion.classList.add('hidden');
            if (curpColocacion) curpColocacion.value = '';
        } else {
            showStatus('status_colocacion', resultado.message, 'error');
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
                // Actualizar todos los campos del formulario de cobranza
                const campos = [
                    'nombre_cobranza', 'saldo_cobranza', 'estado_cobranza',
                    'semanas_atraso_cobranza', 'pago_semanal_cobranza',
                    'fecha_proximo_pago_cobranza', 'monto_cobranza'
                ];

                const valores = [
                    cliente ? cliente.nombre : 'N/A',
                    `$${historial.saldoRestante.toLocaleString()}`,
                    historial.estado.toUpperCase(),
                    historial.semanasAtraso || 0,
                    `$${historial.pagoSemanal.toLocaleString()}`,
                    historial.proximaFechaPago,
                    historial.pagoSemanal.toFixed(2)
                ];

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

        showStatus('status_cobranza', resultado.message, resultado.success ? 'success' : 'error');
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
    const saldoDespues = creditoActual.saldo - monto;
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
    const overlay = document.getElementById('processing-overlay');
    const messageElement = document.getElementById('processing-message');

    if (!overlay) {
        const newOverlay = document.createElement('div');
        newOverlay.id = 'processing-overlay';
        newOverlay.className = 'processing-overlay hidden';
        newOverlay.innerHTML = `
            <div class="processing-spinner"></div>
            <div id="processing-message" class="processing-message">${message}</div>
        `;
        document.body.appendChild(newOverlay);
    }

    const currentOverlay = document.getElementById('processing-overlay');
    const currentMessage = document.getElementById('processing-message');

    if (show) {
        if (currentMessage) currentMessage.textContent = message;
        currentOverlay.classList.remove('hidden');
    } else {
        currentOverlay.classList.add('hidden');
    }
}

function showButtonLoading(selector, show, text = 'Procesando...') {
    const button = document.querySelector(selector);
    if (!button) return;

    if (show) {
        const originalText = button.textContent;
        button.setAttribute('data-original-text', originalText);
        button.innerHTML = text;
        button.classList.add('btn-loading');
        button.disabled = true;
    } else {
        const originalText = button.getAttribute('data-original-text') || button.textContent;
        button.innerHTML = originalText;
        button.classList.remove('btn-loading');
        button.disabled = false;
    }
}

// =============================================
// FUNCIONES DE BARRA DE PROGRESO Y UTILIDADES
// =============================================

function showFixedProgress(percentage, message = '') {
    if (cargaEnProgreso === false && percentage > 0 && percentage < 100) {
        return;
    }

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
        const btnCancelar = document.getElementById('btn-cancelar-carga-fixed');
        if (btnCancelar) {
            btnCancelar.addEventListener('click', cancelarCarga);
        }
    }

    const progressBar = document.getElementById('progress-bar-fixed');
    const progressText = document.getElementById('progress-text-fixed');

    if (progressBar) {
        progressBar.style.width = percentage + '%';
        if (percentage < 30) progressBar.style.background = 'var(--danger)';
        else if (percentage < 70) progressBar.style.background = 'var(--warning)';
        else progressBar.style.background = 'var(--success)';
    }

    if (progressText && message) {
        progressText.textContent = message;
    }

    progressContainer.style.display = 'flex';
    document.body.classList.add('has-progress');
}

function hideFixedProgress() {
    const progressContainer = document.getElementById('progress-container-fixed');
    if (progressContainer) {
        progressContainer.style.display = 'none';
        document.body.classList.remove('has-progress');
        const progressBar = document.getElementById('progress-bar-fixed');
        if (progressBar) {
            progressBar.style.width = '0%';
        }
    }
    cargaEnProgreso = false;
}

function cancelarCarga() {
    cargaEnProgreso = false;
    hideFixedProgress();
    showStatus('status_gestion_clientes', 'Carga cancelada por el usuario.', 'info');
    showStatus('status_usuarios', 'Carga cancelada por el usuario.', 'info');

    const tablaClientes = document.getElementById('tabla-clientes');
    if (tablaClientes) tablaClientes.innerHTML = '<tr><td colspan="6">Carga cancelada.</td></tr>';

    const tablaUsuarios = document.getElementById('tabla-usuarios');
    if (tablaUsuarios) tablaUsuarios.innerHTML = '<tr><td colspan="5">Carga cancelada.</td></tr>';

    showButtonLoading('btn-aplicar-filtros', false);
    showButtonLoading('btn-aplicar-filtros-usuarios', false);
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
    console.log('Inicializando dropdowns...');
    const poblacionesGdl = ['LA CALERA', 'ATEQUIZA', 'SAN JACINTO', 'PONCITLAN', 'OCOTLAN', 'ARENAL', 'AMATITAN', 'ACATLAN DE JUAREZ', 'BELLAVISTA', 'SAN ISIDRO MAZATEPEC', 'TALA', 'CUISILLOS', 'HUAXTLA', 'NEXTIPAC', 'SANTA LUCIA', 'JAMAY', 'LA BARCA', 'SAN JUAN DE OCOTAN', 'TALA 2', 'EL HUMEDO', 'NEXTIPAC 2', 'ZZ PUEBLO'];
    const poblacionesLeon = ["ARANDAS", "ARANDAS [E]", "BAJIO DE BONILLAS", "BAJIO DE BONILLAS [E]", "CAPULIN", "CARDENAS", "CARDENAS [E]", "CERRITO DE AGUA CALIENTE", "CERRITO DE AGUA CALIENTE [E]", "CORRALEJO", "CORRALEJO [E]", "CUERAMARO", "CUERAMARO [E]", "DOLORES HIDALGO", "EL ALACRAN", "EL EDEN", "EL FUERTE", "EL MEZQUITILLO", "EL MEZQUITILLO [E]", "EL PALENQUE", "EL PALENQUE [E]", "EL PAXTLE", "EL TULE", "EL TULE [E]", "ESTACION ABASOLO", "ESTACION ABASOLO [E]", "ESTACION CORRALEJO", "ESTACION CORRALEJO [E]", "ESTACION JOAQUIN", "ESTACION JOAQUIN [E]", "EX ESTACION CHIRIMOYA", "EX ESTACION CHIRIMOYA [E]", "GAVIA DE RIONDA", "GODOY", "GODOY [E]", "IBARRA", "IBARRA [E]", "LA ALDEA", "LA CARROZA", "LA CARROZA [E]", "LA ESCONDIDA", "LA SANDIA", "LA SANDIA [E]", "LAGUNA DE GUADALUPE", "LAS CRUCES", "LAS CRUCES [E]", "LAS MASAS", "LAS MASAS [E]", "LAS PALOMAS", "LAS TIRITAS", "LOMA DE LA ESPERANZA", "LOMA DE LA ESPERANZA [E]", "LOS DOLORES", "LOS GALVANES", "LOS GALVANES [E]", "MAGUEY BLANCO", "MEDRANOS", "MEXICANOS", "MEXICANOS [E]", "MINERAL DE LA LUZ", "MISION DE ABAJO", "MISION DE ABAJO [E]", "MISION DE ARRIBA", "MISION DE ARRIBA [E]", "NORIA DE ALDAY", "OCAMPO", "PURISIMA DEL RINCON", "PURISIMA DEL RINCON [E]", "RANCHO NUEVO DE LA CRUZ", "RANCHO NUEVO DE LA CRUZ [E]", "RANCHO VIEJO", "RIO LAJA", "RIO LAJA [E]", "SAN ANDRES DE JALPA", "SAN ANDRES DE JALPA [E]", "SAN BERNARDO", "SAN BERNARDO [E]", "SAN CRISTOBAL", "SAN CRISTOBAL [E]", "SAN GREGORIO", "SAN GREGORIO [E]", "SAN ISIDRO DE CRESPO", "SAN ISIDRO DE CRESPO [E]", "SAN JOSE DE BADILLO", "SAN JOSE DE BADILLO [E]", "SAN JOSE DEL RODEO", "SAN JOSE DEL RODEO [E]", "SAN JUAN DE LA PUERTA", "SAN JUAN DE LA PUERTA [E]", "SANTA ANA DEL CONDE", "SANTA ROSA", "SANTA ROSA [E]", "SANTA ROSA PLAN DE AYALA", "SANTA ROSA PLAN DE AYALA [E]", "SANTO DOMINGO", "SERRANO", "TENERIA DEL SANTUARIO", "TENERIA DEL SANTUARIO [E]", "TIERRAS BLANCAS", "TIERRAS BLANCAS [E]", "TREJO", "TREJO [E]", "TUPATARO", "TUPATARO [E]", "VALTIERRILLA", "VALTIERRILLA 2", "VALTIERRILLA [E]", "VAQUERIAS", "VILLA DE ARRIAGA", "VILLA DE ARRIAGA [E]"].sort();
    const rutas = ['AUDITORIA', 'SUPERVISION', 'ADMINISTRACION', 'DIRECCION', 'COMERCIAL', 'COBRANZA', 'R1', 'R2', 'R3', 'JC1', 'RX'];
    const tiposCredito = ['NUEVO', 'RENOVACION', 'REINGRESO'];
    const montos = [3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000, 9000, 10000];
    const plazos = [13, 14];
    const estadosCredito = ['al corriente', 'atrasado', 'cobranza', 'juridico', 'liquidado'];
    const tiposPago = ['normal', 'extraordinario', 'actualizado'];
    const sucursales = ['GDL', 'LEON'];

    popularDropdown('poblacion_grupo_cliente', poblacionesGdl, 'Selecciona población/grupo');
    popularDropdown('ruta_cliente', rutas, 'Selecciona una ruta');

    popularDropdown('tipo_colocacion', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Selecciona tipo', true);
    popularDropdown('monto_colocacion', montos.map(m => ({ value: m, text: `$${m.toLocaleString()}` })), 'Selecciona monto', true);
    popularDropdown('plazo_colocacion', plazos.map(p => ({ value: p, text: `${p} semanas` })), 'Selecciona plazo', true);

    const todasLasPoblaciones = [...new Set([...poblacionesGdl, ...poblacionesLeon])].sort();
    popularDropdown('grupo_filtro', todasLasPoblaciones, 'Todos');
    popularDropdown('tipo_colocacion_filtro', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Todos', true);
    popularDropdown('plazo_filtro', plazos.map(p => ({ value: p, text: `${p} semanas` })), 'Todos', true);

    popularDropdown('filtro-rol-usuario', [
        { value: 'admin', text: 'Administrador' },
        { value: 'supervisor', text: 'Supervisor' },
        { value: 'cobrador', text: 'Cobrador' },
        { value: 'consulta', text: 'Consulta' }
    ], 'Todos los roles', true);

    popularDropdown('sucursal_filtro_reporte', sucursales, 'Todas');
    popularDropdown('grupo_filtro_reporte', todasLasPoblaciones, 'Todos');
    popularDropdown('ruta_filtro_reporte', rutas, 'Todas');
    popularDropdown('tipo_credito_filtro_reporte', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Todos', true);
    popularDropdown('estado_credito_filtro_reporte', estadosCredito.map(e => ({ value: e, text: e.toUpperCase() })), 'Todos', true);
    popularDropdown('tipo_pago_filtro_reporte', tiposPago.map(t => ({ value: t, text: t.toUpperCase() })), 'Todos', true);

    console.log('Dropdowns inicializados correctamente');
}

// =============================================
// LÓGICA MEJORADA DE CÁLCULO DE ESTADOS DE CRÉDITO
// =============================================

function _calcularEstadoCredito(credito, pagos) {
    console.log('🔍 Calculando estado del crédito:', credito.id);
    
    if (!credito || !credito.fechaCreacion) {
        console.log('❌ Crédito o fecha de creación inválida');
        return null;
    }

    // Si el crédito está liquidado
    if (credito.saldo <= 0.01) {
        console.log('✅ Crédito liquidado');
        return { 
            estado: 'liquidado', 
            diasAtraso: 0, 
            semanasAtraso: 0, 
            pagoSemanal: 0, 
            proximaFechaPago: 'N/A',
            montoPagado: credito.montoTotal,
            porcentajePagado: 100
        };
    }

    // Calcular pago semanal
    const pagoSemanal = (credito.plazo > 0) ? credito.montoTotal / credito.plazo : 0;
    const montoPagado = credito.montoTotal - credito.saldo;
    const porcentajePagado = (montoPagado / credito.montoTotal) * 100;

    console.log('📊 Datos del crédito:', {
        montoTotal: credito.montoTotal,
        saldo: credito.saldo,
        montoPagado: montoPagado,
        porcentajePagado: porcentajePagado,
        plazo: credito.plazo,
        pagoSemanal: pagoSemanal
    });

    // ===== USAR EL TRADUCTOR DE FECHAS =====
    const fechaInicio = parsearFecha_DDMMYYYY(credito.fechaCreacion);
    if (!fechaInicio) {
        console.log('❌ No se pudo parsear la fecha de creación:', credito.fechaCreacion);
        return null;
    }

    console.log('📅 Fecha de inicio parseada:', fechaInicio.toLocaleDateString());

    // Calcular tiempo transcurrido
    const hoy = new Date();
    const diasTranscurridos = Math.floor((hoy - fechaInicio) / (1000 * 60 * 60 * 24));
    const semanasTranscurridas = Math.floor(diasTranscurridos / 7);

    console.log('⏰ Tiempo transcurrido:', {
        dias: diasTranscurridos,
        semanas: semanasTranscurridas
    });

    // Si el crédito no ha comenzado
    if (diasTranscurridos < 0) {
        console.log('⏳ Crédito no ha comenzado');
        return { 
            estado: 'al corriente', 
            diasAtraso: 0, 
            semanasAtraso: 0, 
            pagoSemanal, 
            proximaFechaPago: fechaInicio.toLocaleDateString(),
            montoPagado: montoPagado,
            porcentajePagado: porcentajePagado
        };
    }

    // Calcular lo que debería estar pagado vs lo que realmente pagó
    const pagoRequeridoHastaHoy = semanasTranscurridas * pagoSemanal;
    const deficit = pagoRequeridoHastaHoy - montoPagado;

    console.log('💰 Análisis de pagos:', {
        pagoRequeridoHastaHoy: pagoRequeridoHastaHoy,
        montoPagado: montoPagado,
        deficit: deficit
    });

    // Calcular atraso
    let diasAtraso = 0;
    let semanasAtraso = 0;

    if (deficit > 0 && pagoSemanal > 0) {
        semanasAtraso = Math.ceil(deficit / pagoSemanal);
        diasAtraso = semanasAtraso * 7;
    }

    console.log('📈 Atraso calculado:', {
        deficit: deficit,
        semanasAtraso: semanasAtraso,
        diasAtraso: diasAtraso
    });

    // Determinar estado basado en el atraso
    let estado = 'al corriente';
    
    if (diasAtraso >= 7 && diasAtraso < 30) {
        estado = 'atrasado';
    } else if (diasAtraso >= 30 && diasAtraso < 90) {
        estado = 'cobranza';
    } else if (diasAtraso >= 90) {
        estado = 'juridico';
    }

    // Calcular próxima fecha de pago
    const semanasPagadas = (pagoSemanal > 0) ? montoPagado / pagoSemanal : 0;
    const proximaFecha = new Date(fechaInicio);
    proximaFecha.setDate(proximaFecha.getDate() + (Math.floor(semanasPagadas) + 1) * 7);

    console.log('🎯 Estado final:', {
        estado: estado,
        proximaFechaPago: proximaFecha.toLocaleDateString(),
        semanasAtraso: semanasAtraso
    });

    return {
        estado,
        diasAtraso: Math.max(0, diasAtraso),
        semanasAtraso: Math.max(0, semanasAtraso),
        pagoSemanal,
        proximaFechaPago: proximaFecha.toLocaleDateString(),
        montoPagado: montoPagado,
        porcentajePagado: porcentajePagado,
        semanasTranscurridas: semanasTranscurridas,
        pagoRequerido: pagoRequeridoHastaHoy
    };
}

async function obtenerHistorialCreditoCliente(curp) {
    console.log('🔍 Obteniendo historial para CURP:', curp);
    
    try {
        const creditosCliente = await database.buscarCreditosPorCliente(curp);
        console.log('📋 Créditos encontrados:', creditosCliente.length);

        if (creditosCliente.length === 0) {
            console.log('❌ No se encontraron créditos para el cliente');
            return null;
        }

        // Ordenar créditos por fecha (más reciente primero)
        creditosCliente.sort((a, b) => {
            const fechaA = parsearFecha_DDMMYYYY(a.fechaCreacion);
            const fechaB = parsearFecha_DDMMYYYY(b.fechaCreacion);
            if (!fechaA || !fechaB) return 0;
            return fechaB - fechaA;
        });

        const ultimoCredito = creditosCliente[0];
        console.log('🎯 Último crédito:', ultimoCredito.id);

        // Obtener pagos del crédito
        const pagos = await database.getPagosPorCredito(ultimoCredito.id);
        console.log('💳 Pagos encontrados:', pagos.length);

        // Calcular estado del crédito
        const estadoCalculado = _calcularEstadoCredito(ultimoCredito, pagos);
        
        if (!estadoCalculado) {
            console.log('❌ No se pudo calcular el estado del crédito');
            return null;
        }

        // Obtener fecha del último pago
        let fechaUltimoPagoStr = 'N/A';
        if (pagos.length > 0) {
            const ultimoPago = pagos[0];
            const fechaUltimoPagoObj = parsearFecha_DDMMYYYY(ultimoPago.fecha);
            fechaUltimoPagoStr = fechaUltimoPagoObj ? fechaUltimoPagoObj.toLocaleDateString() : 'N/A';
        }

        console.log('✅ Historial calculado correctamente:', estadoCalculado.estado);

        return {
            idCredito: ultimoCredito.id,
            saldoRestante: ultimoCredito.saldo,
            fechaUltimoPago: fechaUltimoPagoStr,
            ...estadoCalculado,
            semanaActual: Math.floor(pagos.length) + 1,
            plazoTotal: ultimoCredito.plazo,
            totalPagos: pagos.length,
            montoTotalCredito: ultimoCredito.montoTotal
        };

    } catch (error) {
        console.error('❌ Error obteniendo historial:', error);
        return null;
    }
}

async function verificarElegibilidadRenovacion(curp) {
    const credito = await database.buscarCreditoActivoPorCliente(curp);
    if (!credito) return true;

    const pagos = await database.getPagosPorCredito(credito.id);
    const estado = _calcularEstadoCredito(credito, pagos);

    // ===== INICIO DE LA MODIFICACIÓN (Uso del traductor de fechas) =====
    const fechaCreacionObj = parsearFecha_DDMMYYYY(credito.fechaCreacion);
    if (!estado || !fechaCreacionObj) return false; // No es elegible si no se pueden calcular los datos
    // ===== FIN DE LA MODIFICACIÓN =====

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
    showStatus('status_gestion_clientes', 'Filtros limpiados correctamente.', 'success');
}

async function loadClientesTable() {
    if (cargaEnProgreso) {
        showStatus('status_gestion_clientes', 'Ya hay una carga en progreso. Espere a que termine.', 'warning');
        return;
    }
    cargaEnProgreso = true;

    const tbody = document.getElementById('tabla-clientes');
    if (!tbody) {
        console.error('No se encontró el elemento tabla-clientes');
        cargaEnProgreso = false;
        return;
    }

    tbody.innerHTML = '<tr><td colspan="6">Buscando...</td></tr>';
    showButtonLoading('btn-aplicar-filtros', true, 'Buscando...');
    showFixedProgress(10, 'Aplicando filtros...');

    try {
        const filtros = {
            sucursal: document.getElementById('sucursal_filtro')?.value || '',
            curp: document.getElementById('curp_filtro')?.value?.toLowerCase() || '',
            nombre: document.getElementById('nombre_filtro')?.value?.toLowerCase() || '',
            fechaRegistro: document.getElementById('fecha_registro_filtro')?.value || '',
            fechaCredito: document.getElementById('fecha_credito_filtro')?.value || '',
            tipo: document.getElementById('tipo_colocacion_filtro')?.value || '',
            plazo: document.getElementById('plazo_filtro')?.value || '',
            curpAval: document.getElementById('curp_aval_filtro')?.value?.toLowerCase() || '',
            grupo: document.getElementById('grupo_filtro')?.value || ''
        };

        const hayFiltros = Object.values(filtros).some(val => val && val.trim() !== '');
        if (!hayFiltros) {
            tbody.innerHTML = '<tr><td colspan="6">Por favor, especifica al menos un criterio de búsqueda.</td></tr>';
            showButtonLoading('btn-aplicar-filtros', false);
            hideFixedProgress();
            return;
        }

        showFixedProgress(30, 'Buscando clientes...');
        const clientesFiltrados = await database.buscarClientes(filtros);

        if (!cargaEnProgreso) {
            tbody.innerHTML = '<tr><td colspan="6">Búsqueda cancelada.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        if (clientesFiltrados.length === 0) {
            showFixedProgress(100, 'No se encontraron clientes');
            tbody.innerHTML = '<tr><td colspan="6">No se encontraron clientes con los filtros iniciales.</td></tr>';
            return;
        }

        showFixedProgress(50, `Procesando ${clientesFiltrados.length} clientes...`);

        let clientesMostrados = 0;
        for (let i = 0; i < clientesFiltrados.length; i++) {
            if (!cargaEnProgreso) {
                tbody.innerHTML = '<tr><td colspan="6">Procesamiento cancelado.</td></tr>';
                break;
            }

            const cliente = clientesFiltrados[i];

            showFixedProgress(50 + Math.round((i / clientesFiltrados.length) * 40), `Procesando cliente ${i + 1} de ${clientesFiltrados.length}`);

            const fechaRegistroMatch = !filtros.fechaRegistro || (cliente.fechaRegistro && cliente.fechaRegistro.startsWith(filtros.fechaRegistro));
            if (!fechaRegistroMatch) {
                continue;
            }

            const necesitaFiltroCredito = filtros.fechaCredito || filtros.tipo || filtros.plazo || filtros.curpAval;
            if (necesitaFiltroCredito) {
                const creditos = await database.buscarCreditosPorCliente(cliente.curp);
                if (creditos.length === 0) {
                    continue;
                }
                const algunCreditoCoincide = creditos.some(credito => {
                    const fechaCreditoMatch = !filtros.fechaCredito || (credito.fechaCreacion && credito.fechaCreacion.startsWith(filtros.fechaCredito));
                    const tipoMatch = !filtros.tipo || credito.tipo === filtros.tipo;
                    const plazoMatch = !filtros.plazo || credito.plazo == filtros.plazo;
                    const curpAvalMatch = !filtros.curpAval || (credito.curpAval && credito.curpAval.toLowerCase().includes(filtros.curpAval));
                    return fechaCreditoMatch && tipoMatch && plazoMatch && curpAvalMatch;
                });
                if (!algunCreditoCoincide) {
                    continue;
                }
            }

            clientesMostrados++;
            const tr = document.createElement('tr');
            const historial = await obtenerHistorialCreditoCliente(cliente.curp);
            let infoCreditoHTML = '<em>Sin historial</em>';

            if (historial) {
                let estadoHTML = '', detallesHTML = '', estadoClase = '';
                
                // Asignar clases CSS según el estado
                switch (historial.estado) {
                    case 'al corriente': 
                        estadoClase = 'status-al-corriente';
                        estadoHTML = `<span class="info-value ${estadoClase}">✅ AL CORRIENTE</span>`;
                        break;
                    case 'atrasado': 
                        estadoClase = 'status-atrasado';
                        estadoHTML = `<span class="info-value ${estadoClase}">⚠️ ATRASADO</span>`;
                        break;
                    case 'cobranza': 
                        estadoClase = 'status-cobranza';
                        estadoHTML = `<span class="info-value ${estadoClase}">🔴 COBRANZA</span>`;
                        break;
                    case 'juridico': 
                        estadoClase = 'status-juridico';
                        estadoHTML = `<span class="info-value ${estadoClase}">⚖️ JURÍDICO</span>`;
                        break;
                    case 'liquidado': 
                        estadoClase = 'status-al-corriente';
                        estadoHTML = `<span class="info-value ${estadoClase}">🏁 LIQUIDADO</span>`;
                        break;
                }
                
                // Construir detalles del crédito
                detallesHTML += `
                    <div class="info-item">
                        <span class="info-label">Saldo:</span>
                        <span class="info-value">$${historial.saldoRestante.toLocaleString()}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Pagado:</span>
                        <span class="info-value">${historial.porcentajePagado ? historial.porcentajePagado.toFixed(1) + '%' : 'N/A'}</span>
                    </div>
                `;
                
                if (historial.semanasAtraso > 0) {
                    detallesHTML += `
                        <div class="info-item">
                            <span class="info-label">Semanas Atraso:</span>
                            <span class="info-value">${historial.semanasAtraso}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Días Atraso:</span>
                            <span class="info-value">${historial.diasAtraso}</span>
                        </div>
                    `;
                }
                
                detallesHTML += `
                    <div class="info-item">
                        <span class="info-label">Último Pago:</span>
                        <span class="info-value">${historial.fechaUltimoPago}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Próximo Pago:</span>
                        <span class="info-value">${historial.proximaFechaPago}</span>
                    </div>
                `;
                
                infoCreditoHTML = `
                    <div class="credito-info">
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="info-label">ID Crédito:</span>
                                <span class="info-value">${historial.idCredito}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Estado:</span>
                                ${estadoHTML}
                            </div>
                            ${detallesHTML}
                        </div>
                    </div>
                `;
            }

            tr.innerHTML = `
                <td>${cliente.office || 'N/A'}</td>
                <td>${cliente.curp}</td>
                <td>${cliente.nombre}</td>
                <td>${cliente.poblacion_grupo}</td>
                <td>${infoCreditoHTML}</td>
                <td class="action-buttons">
                    <button class="btn btn-sm btn-secondary" onclick="editCliente('${cliente.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCliente('${cliente.id}')"><i class="fas fa-trash"></i></button>
                </td>`;
            tbody.appendChild(tr);
        }

        if (clientesMostrados === 0 && cargaEnProgreso) {
            tbody.innerHTML = '<tr><td colspan="6">No se encontraron clientes con los filtros aplicados.</td></tr>';
        }

        if (cargaEnProgreso) {
            showFixedProgress(100, `Procesamiento completado: ${clientesMostrados} clientes`);
            showStatus('status_gestion_clientes', `Se encontraron ${clientesMostrados} clientes con los filtros aplicados.`, 'success');
        }

    } catch (error) {
        console.error('Error cargando clientes:', error);
        tbody.innerHTML = '<tr><td colspan="6">Error al cargar los clientes.</td></tr>';
        showStatus('status_gestion_clientes', 'Error al cargar los clientes: ' + error.message, 'error');
    } finally {
        showButtonLoading('btn-aplicar-filtros', false);
        setTimeout(hideFixedProgress, 1000);
    }
}

// =============================================
// FUNCIONES DE REPORTES
// =============================================

async function loadBasicReports() {
    showProcessingOverlay(true, 'Generando reportes...');
    showButtonLoading('btn-actualizar-reportes', true, 'Generando...');
    showFixedProgress(30, 'Recopilando datos...');

    try {
        showFixedProgress(60, 'Generando estadísticas...');
        const reportes = await database.generarReportes();

        if (!reportes) {
            showStatus('status_reportes', 'Error al generar reportes.', 'error');
            return;
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

        const tasaRecuperacion = (reportes.totalCartera + reportes.cobradoMes) > 0 ?
            (reportes.cobradoMes / (reportes.totalCartera + reportes.cobradoMes) * 100).toFixed(1) : 0;

        const tasaElement = document.getElementById('tasa-recuperacion');
        if (tasaElement) tasaElement.textContent = `${tasaRecuperacion}%`;

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
    const tbody = document.getElementById('tabla-reportes-avanzados');
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
    }
}

function mostrarReporteAvanzado(data) {
    const tbody = document.getElementById('tabla-reportes-avanzados');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10">No se encontraron datos con los filtros aplicados.</td></tr>';
        return;
    }

    data.forEach(item => {
        const tr = document.createElement('tr');

        // ===== INICIO DE LA MODIFICACIÓN (Uso del traductor de fechas) =====
        const fechaRegistro = parsearFecha_DDMMYYYY(item.fechaRegistro)?.toLocaleDateString() || '';
        const fechaCreacion = parsearFecha_DDMMYYYY(item.fechaCreacion)?.toLocaleDateString() || '';
        const fechaPago = parsearFecha_DDMMYYYY(item.fecha)?.toLocaleDateString() || '';
        // ===== FIN DE LA MODIFICACIÓN =====

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

            if (item.tipo === 'cliente') {
                row = [
                    'CLIENTE',
                    item.curp || '',
                    `"${item.nombre || ''}"`,
                    item.poblacion_grupo || '',
                    item.ruta || '',
                    item.office || '',
                    item.fechaRegistro ? (parsearFecha_DDMMYYYY(item.fechaRegistro)?.toLocaleDateString() || '') : '',
                    '',
                    '',
                    ''
                ];
            } else if (item.tipo === 'credito') {
                row = [
                    'CRÉDITO',
                    item.curpCliente || '',
                    `"${item.nombreCliente || ''}"`,
                    item.poblacion_grupo || '',
                    item.ruta || '',
                    item.office || '',
                    item.fechaCreacion ? (parsearFecha_DDMMYYYY(item.fechaCreacion)?.toLocaleDateString() || '') : '',
                    item.tipo || '',
                    item.monto || 0,
                    item.saldo || 0
                ];
            } else if (item.tipo === 'pago') {
                row = [
                    'PAGO',
                    item.curpCliente || '',
                    `"${item.nombreCliente || ''}"`,
                    item.poblacion_grupo || '',
                    item.ruta || '',
                    item.office || '',
                    item.fecha ? (parsearFecha_DDMMYYYY(item.fecha)?.toLocaleDateString() || '') : '',
                    item.tipoPago || '',
                    item.monto || 0,
                    item.saldoDespues || 0
                ];
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

// =============================================
// HERRAMIENTAS DE DEPURACIÓN
// =============================================

function depurarCalculoCredito(creditoId) {
    console.log('🔧 DEPURACIÓN - Calculando estado del crédito:', creditoId);
    
    database.buscarCreditoPorId(creditoId)
        .then(credito => {
            if (!credito) {
                console.log('❌ Crédito no encontrado');
                return;
            }
            
            console.log('📋 Datos del crédito:', {
                id: credito.id,
                fechaCreacion: credito.fechaCreacion,
                fechaParseada: parsearFecha_DDMMYYYY(credito.fechaCreacion)?.toLocaleDateString(),
                montoTotal: credito.montoTotal,
                saldo: credito.saldo,
                plazo: credito.plazo,
                estado: credito.estado
            });
            
            return database.getPagosPorCredito(creditoId);
        })
        .then(pagos => {
            console.log('💳 Pagos del crédito:', pagos.length);
            
            database.buscarCreditoPorId(creditoId)
                .then(credito => {
                    const estado = _calcularEstadoCredito(credito, pagos);
                    console.log('🎯 Estado calculado:', estado);
                });
        })
        .catch(error => {
            console.error('❌ Error en depuración:', error);
        });
}

// Funciones auxiliares para edición/eliminación (placeholder)
async function editCliente(docId) {
    alert("La función para editar clientes aún no está implementada en esta versión.");
}

async function deleteCliente(docId) {
    if (confirm("¿Estás seguro de que deseas eliminar este cliente? Esta acción no se puede deshacer.")) {
        alert("La función para eliminar clientes aún no está implementada en esta versión.");
    }
}

// Eventos de Vistas
document.addEventListener('viewshown', function (e) {
    const viewId = e.detail.viewId;
    console.log('Vista mostrada:', viewId);

    switch (viewId) {
        case 'view-reportes':
            const btnActualizar = document.getElementById('btn-actualizar-reportes');
            if (btnActualizar) btnActualizar.click();
            break;
        case 'view-reportes-avanzados':
            inicializarVistaReportesAvanzados();
            break;
        case 'view-usuarios':
            loadUsersTable();
            break;
        case 'view-gestion-clientes':
            inicializarVistaGestionClientes();
            break;
    }
});

console.log('app.js cargado correctamente');
