// =============================================
// INICIALIZACIÓN DE LA APLICACIÓN CON FIREBASE - CORREGIDO
// =============================================

let currentUser = null;
let creditoActual = null;
let currentImportTab = 'clientes';
let reportData = null;

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

    // Gestión de Usuarios (Firebase Auth)
    const btnNuevoUsuario = document.getElementById('btn-nuevo-usuario');
    if (btnNuevoUsuario) {
        btnNuevoUsuario.addEventListener('click', () => {
            showStatus('status_usuarios', 'La creación de usuarios se realiza en la Consola de Firebase > Authentication.', 'info');
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
        const resultado = await database.importarDatosDesdeCSV(csvData, currentImportTab, office);
        
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

    const cliente = {
        curp,
        nombre: document.getElementById('nombre_cliente').value,
        domicilio: document.getElementById('domicilio_cliente').value,
        cp: document.getElementById('cp_cliente').value,
        telefono: document.getElementById('telefono_cliente').value,
        poblacion_grupo: document.getElementById('poblacion_grupo_cliente').value,
        ruta: document.getElementById('ruta_cliente').value
    };

    if (!cliente.nombre || !cliente.domicilio || !cliente.poblacion_grupo || !cliente.ruta) {
        showStatus('status_cliente', 'Todos los campos son obligatorios.', 'error');
        showButtonLoading('#form-cliente button[type="submit"]', false);
        return;
    }

    try {
        const resultado = await database.agregarCliente(cliente);
        showStatus('status_cliente', resultado.message, resultado.success ? 'success' : 'error');
        if (resultado.success) {
            document.getElementById('form-cliente').reset();
        }
    } catch (error) {
        showStatus('status_cliente', `Error: ${error.message}`, 'error');
    } finally {
        showButtonLoading('#form-cliente button[type="submit"]', false);
    }
}

async function handleSearchClientForCredit() {
    const curp = document.getElementById('curpCliente_colocacion').value.toUpperCase();
    if (!validarFormatoCURP(curp)) {
        showStatus('status_colocacion', 'CURP inválido. Debe tener 18 caracteres.', 'error');
        return;
    }

    showButtonLoading('#btnBuscarCliente_colocacion', true, 'Buscando...');

    try {
        const cliente = await database.buscarClientePorCURP(curp);
        if (cliente) {
            document.getElementById('nombreCliente_colocacion').value = cliente.nombre;
            document.getElementById('domicilioCliente_colocacion').value = cliente.domicilio;
            document.getElementById('telefonoCliente_colocacion').value = cliente.telefono;
            document.getElementById('poblacion_grupo_colocacion').value = cliente.poblacion_grupo;
            document.getElementById('ruta_colocacion').value = cliente.ruta;
            showStatus('status_colocacion', 'Cliente encontrado.', 'success');
        } else {
            showStatus('status_colocacion', 'Cliente no encontrado.', 'error');
            limpiarCamposClienteColocacion();
        }
    } catch (error) {
        showStatus('status_colocacion', `Error: ${error.message}`, 'error');
    } finally {
        showButtonLoading('#btnBuscarCliente_colocacion', false);
    }
}

async function handleCreditForm(e) {
    e.preventDefault();
    const curpCliente = document.getElementById('curpCliente_colocacion').value;
    const curpAval = document.getElementById('curpAval_colocacion').value;

    if (!validarFormatoCURP(curpCliente)) {
        showStatus('status_colocacion', 'CURP del cliente inválido.', 'error');
        return;
    }

    if (!validarFormatoCURP(curpAval)) {
        showStatus('status_colocacion', 'CURP del aval inválido.', 'error');
        return;
    }

    showButtonLoading('#form-credito-submit button[type="submit"]', true, 'Generando...');

    const credito = {
        curpCliente,
        curpAval,
        nombreCliente: document.getElementById('nombreCliente_colocacion').value,
        nombreAval: document.getElementById('nombreAval_colocacion').value,
        monto: parseFloat(document.getElementById('monto_colocacion').value),
        plazo: parseInt(document.getElementById('plazo_colocacion').value),
        tipo: document.getElementById('tipo_colocacion').value,
        poblacion_grupo: document.getElementById('poblacion_grupo_colocacion').value,
        ruta: document.getElementById('ruta_colocacion').value,
        office: document.getElementById('office_colocacion').value
    };

    if (!credito.nombreCliente || !credito.nombreAval || !credito.monto || !credito.plazo || !credito.tipo || !credito.poblacion_grupo || !credito.ruta) {
        showStatus('status_colocacion', 'Todos los campos son obligatorios.', 'error');
        showButtonLoading('#form-credito-submit button[type="submit"]', false);
        return;
    }

    try {
        const resultado = await database.agregarCredito(credito);
        showStatus('status_colocacion', resultado.message, resultado.success ? 'success' : 'error');
        if (resultado.success) {
            document.getElementById('form-credito').reset();
            limpiarCamposClienteColocacion();
            limpiarCamposAvalColocacion();
        }
    } catch (error) {
        showStatus('status_colocacion', `Error: ${error.message}`, 'error');
    } finally {
        showButtonLoading('#form-credito-submit button[type="submit"]', false);
    }
}

async function handleSearchCreditForPayment() {
    const curp = document.getElementById('curpCliente_cobranza').value.toUpperCase();
    if (!validarFormatoCURP(curp)) {
        showStatus('status_cobranza', 'CURP inválido. Debe tener 18 caracteres.', 'error');
        return;
    }

    showButtonLoading('#btnBuscarCredito_cobranza', true, 'Buscando...');

    try {
        const credito = await database.buscarCreditoActivoPorCliente(curp);
        if (credito) {
            creditoActual = credito;
            document.getElementById('nombreCliente_cobranza').value = credito.nombreCliente;
            document.getElementById('idCredito_cobranza').value = credito.id;
            document.getElementById('montoTotal_cobranza').value = credito.montoTotal.toFixed(2);
            document.getElementById('saldoActual_cobranza').value = credito.saldo.toFixed(2);
            document.getElementById('monto_cobranza').max = credito.saldo;
            showStatus('status_cobranza', 'Crédito activo encontrado.', 'success');
        } else {
            showStatus('status_cobranza', 'No se encontró un crédito activo para este cliente.', 'error');
            limpiarCamposCreditoCobranza();
        }
    } catch (error) {
        showStatus('status_cobranza', `Error: ${error.message}`, 'error');
    } finally {
        showButtonLoading('#btnBuscarCredito_cobranza', false);
    }
}

async function handlePaymentForm(e) {
    e.preventDefault();
    if (!creditoActual) {
        showStatus('status_cobranza', 'Primero busca un crédito activo.', 'error');
        return;
    }

    const monto = parseFloat(document.getElementById('monto_cobranza').value);
    if (!monto || monto <= 0) {
        showStatus('status_cobranza', 'Monto inválido.', 'error');
        return;
    }

    if (monto > creditoActual.saldo) {
        showStatus('status_cobranza', 'El monto no puede ser mayor al saldo actual.', 'error');
        return;
    }

    showButtonLoading('#form-pago-submit button[type="submit"]', true, 'Registrando...');

    const pago = {
        idCredito: creditoActual.id,
        monto,
        tipoPago: document.getElementById('tipoPago_cobranza').value,
        office: creditoActual.office
    };

    try {
        const resultado = await database.agregarPago(pago);
        showStatus('status_cobranza', resultado.message, resultado.success ? 'success' : 'error');
        if (resultado.success) {
            document.getElementById('form-pago').reset();
            limpiarCamposCreditoCobranza();
            creditoActual = null;
        }
    } catch (error) {
        showStatus('status_cobranza', `Error: ${error.message}`, 'error');
    } finally {
        showButtonLoading('#form-pago-submit button[type="submit"]', false);
    }
}

function handleMontoPagoChange() {
    const monto = parseFloat(this.value) || 0;
    const saldoActual = parseFloat(document.getElementById('saldoActual_cobranza').value) || 0;
    const nuevoSaldo = saldoActual - monto;
    document.getElementById('nuevoSaldo_cobranza').value = nuevoSaldo.toFixed(2);
}

// =============================================
// FUNCIONES DE VISUALIZACIÓN
// =============================================

function showView(viewId) {
    console.log('Mostrando vista:', viewId);
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    const targetView = document.getElementById(viewId);
    const targetButton = document.querySelector(`[data-view="${viewId}"]`);

    if (targetView) targetView.classList.remove('hidden');
    if (targetButton) targetButton.classList.add('active');

    // Cargar datos específicos de la vista
    switch (viewId) {
        case 'view-clientes':
            loadClientesTable();
            break;
        case 'view-reportes':
            loadBasicReports();
            break;
        case 'view-reportes-avanzados':
            loadAdvancedReports();
            break;
        case 'view-importacion':
            // Reiniciar estado de importación
            const resultadoImportacion = document.getElementById('resultado-importacion');
            if (resultadoImportacion) resultadoImportacion.classList.add('hidden');
            break;
    }
}

function showStatus(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.innerHTML = message;
    element.className = 'status-message';

    switch (type) {
        case 'success':
            element.classList.add('status-success');
            break;
        case 'error':
            element.classList.add('status-error');
            break;
        case 'info':
            element.classList.add('status-info');
            break;
        case 'warning':
            element.classList.add('status-warning');
            break;
    }

    element.classList.remove('hidden');
}

function showButtonLoading(selector, isLoading, loadingText = 'Cargando...') {
    const button = document.querySelector(selector);
    if (!button) return;

    if (isLoading) {
        button.setAttribute('data-original-text', button.textContent);
        button.innerHTML = `<span class="button-loading-spinner"></span> ${loadingText}`;
        button.disabled = true;
    } else {
        const originalText = button.getAttribute('data-original-text') || 'Enviar';
        button.textContent = originalText;
        button.disabled = false;
    }
}

function showProcessingOverlay(show, message = 'Procesando...') {
    const overlay = document.getElementById('processing-overlay');
    const messageElement = document.getElementById('processing-message');
    
    if (!overlay) return;
    
    if (show) {
        if (messageElement) messageElement.textContent = message;
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

// =============================================
// FUNCIONALIDADES ESPECÍFICAS
// =============================================

async function loadClientesTable() {
    const filtros = {
        sucursal: document.getElementById('filtro-sucursal').value,
        grupo: document.getElementById('filtro-grupo').value,
        curp: document.getElementById('filtro-curp').value,
        nombre: document.getElementById('filtro-nombre').value
    };

    showProcessingOverlay(true, 'Cargando clientes...');

    try {
        const clientes = await database.buscarClientes(filtros);
        const tbody = document.getElementById('tabla-clientes-body');
        tbody.innerHTML = '';

        if (clientes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center">No se encontraron clientes</td></tr>';
        } else {
            clientes.forEach(cliente => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${cliente.curp || 'N/A'}</td>
                    <td>${cliente.nombre || 'N/A'}</td>
                    <td>${cliente.domicilio || 'N/A'}</td>
                    <td>${cliente.cp || 'N/A'}</td>
                    <td>${cliente.telefono || 'N/A'}</td>
                    <td>${cliente.poblacion_grupo || 'N/A'}</td>
                    <td>${cliente.ruta || 'N/A'}</td>
                    <td>${cliente.office || 'N/A'}</td>
                    <td>${formatearFecha(cliente.fechaRegistro)}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error('Error cargando clientes:', error);
        showStatus('status_clientes', `Error: ${error.message}`, 'error');
    } finally {
        showProcessingOverlay(false);
    }
}

function limpiarFiltrosClientes() {
    document.getElementById('filtro-sucursal').value = '';
    document.getElementById('filtro-grupo').value = '';
    document.getElementById('filtro-curp').value = '';
    document.getElementById('filtro-nombre').value = '';
    loadClientesTable();
}

async function loadBasicReports() {
    showProcessingOverlay(true, 'Generando reportes...');
    showButtonLoading('#btn-actualizar-reportes', true, 'Actualizando...');

    try {
        const reportes = await database.generarReportes();
        if (!reportes) {
            showStatus('status_reportes', 'Error al generar reportes.', 'error');
            return;
        }

        // Actualizar tarjetas de métricas
        document.getElementById('total-clientes').textContent = reportes.totalClientes.toLocaleString();
        document.getElementById('total-creditos').textContent = reportes.totalCreditos.toLocaleString();
        document.getElementById('total-cartera').textContent = `$${reportes.totalCartera.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('total-vencidos').textContent = reportes.totalVencidos.toLocaleString();
        document.getElementById('pagos-registrados').textContent = reportes.pagosRegistrados.toLocaleString();
        document.getElementById('cobrado-mes').textContent = `$${reportes.cobradoMes.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('total-comisiones').textContent = `$${reportes.totalComisiones.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('tasa-recuperacion').textContent = `${reportes.tasaRecuperacion.toFixed(2)}%`;

        showStatus('status_reportes', 'Reportes actualizados correctamente.', 'success');
    } catch (error) {
        console.error('Error cargando reportes:', error);
        showStatus('status_reportes', `Error: ${error.message}`, 'error');
    } finally {
        showProcessingOverlay(false);
        showButtonLoading('#btn-actualizar-reportes', false);
    }
}

async function loadAdvancedReports() {
    const filtros = {
        sucursal: document.getElementById('filtro-sucursal-reportes').value,
        grupo: document.getElementById('filtro-grupo-reportes').value,
        ruta: document.getElementById('filtro-ruta-reportes').value,
        tipoCredito: document.getElementById('filtro-tipo-credito').value,
        estadoCredito: document.getElementById('filtro-estado-credito').value,
        tipoPago: document.getElementById('filtro-tipo-pago').value,
        idCredito: document.getElementById('filtro-id-credito').value,
        curpCliente: document.getElementById('filtro-curp-cliente').value,
        fechaInicio: document.getElementById('filtro-fecha-inicio').value,
        fechaFin: document.getElementById('filtro-fecha-fin').value
    };

    showProcessingOverlay(true, 'Generando reporte avanzado...');

    try {
        const resultados = await database.generarReporteAvanzado(filtros);
        reportData = resultados;

        const tbody = document.getElementById('tabla-reportes-avanzados-body');
        tbody.innerHTML = '';

        if (resultados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">No se encontraron registros</td></tr>';
        } else {
            resultados.forEach(item => {
                const tr = document.createElement('tr');
                let contenido = '';

                if (item.tipo === 'cliente') {
                    contenido = `
                        <td>${formatearFecha(item.fechaRegistro)}</td>
                        <td>Cliente</td>
                        <td>${item.curp || 'N/A'}</td>
                        <td>${item.nombre || 'N/A'}</td>
                        <td>${item.poblacion_grupo || 'N/A'}</td>
                        <td>${item.ruta || 'N/A'}</td>
                        <td>${item.office || 'N/A'}</td>
                        <td>N/A</td>
                    `;
                } else if (item.tipo === 'credito') {
                    contenido = `
                        <td>${formatearFecha(item.fechaCreacion)}</td>
                        <td>Crédito</td>
                        <td>${item.curpCliente || 'N/A'}</td>
                        <td>${item.nombreCliente || 'N/A'}</td>
                        <td>${item.poblacion_grupo || 'N/A'}</td>
                        <td>${item.ruta || 'N/A'}</td>
                        <td>${item.office || 'N/A'}</td>
                        <td>$${item.montoTotal?.toFixed(2) || 'N/A'}</td>
                    `;
                } else if (item.tipo === 'pago') {
                    contenido = `
                        <td>${formatearFecha(item.fecha)}</td>
                        <td>Pago</td>
                        <td>${item.curpCliente || 'N/A'}</td>
                        <td>${item.nombreCliente || 'N/A'}</td>
                        <td>${item.poblacion_grupo || 'N/A'}</td>
                        <td>${item.ruta || 'N/A'}</td>
                        <td>${item.office || 'N/A'}</td>
                        <td>$${item.monto?.toFixed(2) || 'N/A'}</td>
                    `;
                }

                tr.innerHTML = contenido;
                tbody.appendChild(tr);
            });
        }

        showStatus('status_reportes_avanzados', `Reporte generado: ${resultados.length} registros encontrados.`, 'success');
    } catch (error) {
        console.error('Error cargando reportes avanzados:', error);
        showStatus('status_reportes_avanzados', `Error: ${error.message}`, 'error');
    } finally {
        showProcessingOverlay(false);
    }
}

function limpiarFiltrosReportes() {
    document.getElementById('filtro-sucursal-reportes').value = '';
    document.getElementById('filtro-grupo-reportes').value = '';
    document.getElementById('filtro-ruta-reportes').value = '';
    document.getElementById('filtro-tipo-credito').value = '';
    document.getElementById('filtro-estado-credito').value = '';
    document.getElementById('filtro-tipo-pago').value = '';
    document.getElementById('filtro-id-credito').value = '';
    document.getElementById('filtro-curp-cliente').value = '';
    document.getElementById('filtro-fecha-inicio').value = '';
    document.getElementById('filtro-fecha-fin').value = '';
    loadAdvancedReports();
}

// =============================================
// FUNCIONES DE UTILIDAD
// =============================================

function inicializarDropdowns() {
    const dropdowns = document.querySelectorAll('.dropdown');
    dropdowns.forEach(dropdown => {
        const toggle = dropdown.querySelector('.dropdown-toggle');
        const menu = dropdown.querySelector('.dropdown-menu');

        if (toggle && menu) {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.toggle('hidden');
            });

            // Cerrar al hacer clic fuera
            document.addEventListener('click', () => {
                menu.classList.add('hidden');
            });
        }
    });
}

function validarCURP(input) {
    input.value = input.value.toUpperCase();
    const curp = input.value.trim();
    const isValid = validarFormatoCURP(curp);

    if (curp.length > 0 && !isValid) {
        input.classList.add('input-error');
    } else {
        input.classList.remove('input-error');
    }
}

function validarFormatoCURP(curp) {
    if (!curp || curp.length !== 18) return false;
    const regex = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z][0-9]$/;
    return regex.test(curp);
}

function calcularMontoTotalColocacion() {
    const monto = parseFloat(document.getElementById('monto_colocacion').value) || 0;
    const plazo = parseInt(document.getElementById('plazo_colocacion').value) || 0;
    const montoTotal = monto * 1.3; // 30% de interés
    document.getElementById('montoTotal_colocacion').value = montoTotal.toFixed(2);
}

function limpiarCamposClienteColocacion() {
    document.getElementById('nombreCliente_colocacion').value = '';
    document.getElementById('domicilioCliente_colocacion').value = '';
    document.getElementById('telefonoCliente_colocacion').value = '';
    document.getElementById('poblacion_grupo_colocacion').value = '';
    document.getElementById('ruta_colocacion').value = '';
}

function limpiarCamposAvalColocacion() {
    document.getElementById('nombreAval_colocacion').value = '';
}

function limpiarCamposCreditoCobranza() {
    document.getElementById('nombreCliente_cobranza').value = '';
    document.getElementById('idCredito_cobranza').value = '';
    document.getElementById('montoTotal_cobranza').value = '';
    document.getElementById('saldoActual_cobranza').value = '';
    document.getElementById('nuevoSaldo_cobranza').value = '';
    document.getElementById('monto_cobranza').value = '';
}

function formatearFecha(fechaString) {
    if (!fechaString) return 'N/A';
    try {
        const fecha = new Date(fechaString);
        return fecha.toLocaleDateString('es-MX');
    } catch (e) {
        return 'Fecha inválida';
    }
}

function exportToCSV() {
    if (!reportData || reportData.length === 0) {
        showStatus('status_reportes_avanzados', 'No hay datos para exportar.', 'error');
        return;
    }

    let csv = 'Tipo,Fecha,CURP,Nombre,Grupo,Ruta,Sucursal,Monto\n';
    reportData.forEach(item => {
        let fila = '';
        if (item.tipo === 'cliente') {
            fila = `Cliente,${formatearFecha(item.fechaRegistro)},${item.curp || ''},${item.nombre || ''},${item.poblacion_grupo || ''},${item.ruta || ''},${item.office || ''},N/A`;
        } else if (item.tipo === 'credito') {
            fila = `Crédito,${formatearFecha(item.fechaCreacion)},${item.curpCliente || ''},${item.nombreCliente || ''},${item.poblacion_grupo || ''},${item.ruta || ''},${item.office || ''},${item.montoTotal || ''}`;
        } else if (item.tipo === 'pago') {
            fila = `Pago,${formatearFecha(item.fecha)},${item.curpCliente || ''},${item.nombreCliente || ''},${item.poblacion_grupo || ''},${item.ruta || ''},${item.office || ''},${item.monto || ''}`;
        }
        csv += fila + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_finzana_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportToPDF() {
    showStatus('status_reportes_avanzados', 'Exportación a PDF aún no implementada.', 'info');
}

// Inicialización final
console.log('app.js cargado correctamente');
