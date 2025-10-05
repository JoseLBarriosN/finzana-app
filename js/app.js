// =============================================
// INICIALIZACIÓN DE LA APLICACIÓN CON FIREBASE
// =============================================

let currentUser = null;
let creditoActual = null;
let currentImportTab = 'clientes';

document.addEventListener('DOMContentLoaded', function () {
    // La inicialización de Firebase ocurre en index.html
    setupEventListeners();

    // El nuevo manejador de estado de autenticación
    auth.onAuthStateChanged(user => {
        if (user) {
            // Usuario ha iniciado sesión
            currentUser = user;
            document.getElementById('user-name').textContent = user.displayName || user.email;
            // Podríamos añadir roles en el futuro usando "custom claims" de Firebase
            document.getElementById('user-role-display').textContent = "Usuario"; 
            
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
    // Sistema de Autenticación
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());

    // Navegación Principal
    document.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', function () { showView(this.getAttribute('data-view')); });
    });

    // Gestión de Clientes
    document.getElementById('btn-aplicar-filtros').addEventListener('click', loadClientesTable);
    document.getElementById('btn-limpiar-filtros').addEventListener('click', limpiarFiltrosClientes);

    // Importación de Datos
    document.getElementById('office-select').addEventListener('change', handleOfficeChange);
    document.querySelectorAll('.import-tab').forEach(tab => tab.addEventListener('click', handleTabClick));
    document.getElementById('btn-procesar-importacion').addEventListener('click', handleImport);
    document.getElementById('btn-limpiar-datos').addEventListener('click', async () => {
        if (confirm('¿Estás seguro de que deseas limpiar TODA la base de datos en la nube? Esta acción no se puede deshacer.')) {
            // Esta es una operación avanzada, por ahora solo mostraremos un mensaje.
            // La lógica real requeriría Cloud Functions para borrar colecciones de forma segura.
            showStatus('estado-importacion', 'La limpieza masiva debe hacerse desde la consola de Firebase.', 'info');
        }
    });

    // Gestión de Usuarios (Firebase Auth)
    document.getElementById('btn-nuevo-usuario').addEventListener('click', () => {
        document.getElementById('form-usuario-container').classList.remove('hidden');
        document.getElementById('form-usuario').reset();
        document.getElementById('form-usuario-titulo').textContent = 'Nuevo Usuario';
    });
    document.getElementById('btn-cancelar-usuario').addEventListener('click', () => {
        document.getElementById('form-usuario-container').classList.add('hidden');
    });
    document.getElementById('form-usuario').addEventListener('submit', handleUserForm);

    // Registrar Cliente
    document.getElementById('form-cliente').addEventListener('submit', handleClientForm);
    document.getElementById('curp_cliente').addEventListener('input', function () { validarCURP(this); });

    // Generar Crédito
    document.getElementById('btnBuscarCliente_colocacion').addEventListener('click', handleSearchClientForCredit);
    document.getElementById('form-credito-submit').addEventListener('submit', handleCreditForm);
    document.getElementById('curpAval_colocacion').addEventListener('input', function () { validarCURP(this); });
    document.getElementById('monto_colocacion').addEventListener('change', calcularMontoTotalColocacion);
    document.getElementById('plazo_colocacion').addEventListener('change', calcularMontoTotalColocacion);

    // Registrar Pago
    document.getElementById('btnBuscarCredito_cobranza').addEventListener('click', handleSearchCreditForPayment);
    document.getElementById('form-pago-submit').addEventListener('submit', handlePaymentForm);
    document.getElementById('monto_cobranza').addEventListener('input', handleMontoPagoChange);

    // Reportes
    document.getElementById('btn-actualizar-reportes').addEventListener('click', async () => {
        // La lógica de reportes necesitaría reescribirse para leer datos de Firestore.
        console.warn("La generación de reportes aún no está conectada a Firestore.");
    });

    // Eventos de Vistas
    document.getElementById('view-reportes').addEventListener('viewshown', () => document.getElementById('btn-actualizar-reportes').click());
    document.getElementById('view-usuarios').addEventListener('viewshown', () => { console.log("Cargando vista de usuarios..."); });
    document.getElementById('view-gestion-clientes').addEventListener('viewshown', inicializarVistaGestionClientes);
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
        statusElement.textContent = 'Iniciando sesión...';
        statusElement.className = 'status-message status-info';
        await auth.signInWithEmailAndPassword(email, password);
        // onAuthStateChanged se encarga de mostrar la app
    } catch (error) {
        console.error("Error de inicio de sesión:", error.code);
        statusElement.textContent = 'Error: correo o contraseña incorrectos.';
        statusElement.className = 'status-message status-error';
    }
}

function handleOfficeChange() {
    const office = this.value;
    const isGDL = office === 'GDL';
    document.getElementById('import-gdl-section').classList.toggle('hidden', !isGDL);
    document.getElementById('import-leon-section').classList.toggle('hidden', isGDL);
    currentImportTab = 'clientes';
    const selector = isGDL ? '#import-gdl-section .import-tab[data-tab="clientes"]' : '#import-leon-section .import-tab[data-tab="clientes"]';
    handleTabClick.call(document.querySelector(selector));
}

function handleTabClick() {
    const parentSection = this.closest('[id$="-section"]');
    parentSection.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
    this.classList.add('active');
    currentImportTab = this.getAttribute('data-tab');
    parentSection.querySelectorAll('.import-tab-content').forEach(c => c.classList.add('hidden'));
    const officePrefix = parentSection.id.includes('gdl') ? 'gdl' : 'leon';
    document.getElementById(`tab-${officePrefix}-${currentImportTab}`).classList.remove('hidden');
}

async function handleImport() {
    const office = document.getElementById('office-select').value;
    const textareaId = `datos-importar-${office.toLowerCase()}-${currentImportTab}`;
    const csvData = document.getElementById(textareaId).value;
    if (!csvData.trim()) {
        showStatus('estado-importacion', 'No hay datos para importar.', 'error');
        document.getElementById('resultado-importacion').classList.remove('hidden');
        return;
    }
    const resultado = await database.importarDatosDesdeCSV(csvData, currentImportTab, office);
    let mensaje = `Importación (${office}) completada: ${resultado.importados} de ${resultado.total} registros.`;
    if (resultado.errores && resultado.errores.length > 0) {
        mensaje += `<br>Errores: ${resultado.errores.length}`;
        document.getElementById('detalle-importacion').innerHTML = `<strong>Detalle:</strong><ul>${resultado.errores.map(e => `<li>${e}</li>`).join('')}</ul>`;
    } else {
        document.getElementById('detalle-importacion').innerHTML = '';
    }
    showStatus('estado-importacion', mensaje, resultado.success ? 'success' : 'error');
    document.getElementById('resultado-importacion').classList.remove('hidden');
}

async function handleUserForm(e) {
    e.preventDefault();
    // La creación y gestión de usuarios ahora se hace en la consola de Firebase.
    // Esta función podría adaptarse en el futuro para usar el Admin SDK en un servidor.
    showStatus('status_usuarios', 'La gestión de usuarios se realiza en la consola de Firebase.', 'info');
}

async function handleClientForm(e) {
    e.preventDefault();
    const curp = document.getElementById('curp_cliente').value;
    if (!validarFormatoCURP(curp)) {
        showStatus('status_cliente', 'El CURP debe tener 18 caracteres.', 'error');
        return;
    }
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
        showStatus('status_cliente', 'Los campos con * son obligatorios.', 'error');
        return;
    }
    const resultado = await database.agregarCliente(cliente);
    showStatus('status_cliente', resultado.message, resultado.success ? 'success' : 'error');
    if (resultado.success) e.target.reset();
}

async function handleSearchClientForCredit() {
    const curp = document.getElementById('curp_colocacion').value.trim();
    if (!validarFormatoCURP(curp)) {
        showStatus('status_colocacion', 'El CURP debe tener 18 caracteres.', 'error');
        return;
    }
    const cliente = await database.buscarClientePorCURP(curp);
    if (cliente) {
        const esElegible = await verificarElegibilidadRenovacion(curp);
        if (!esElegible) {
            showStatus('status_colocacion', `El cliente tiene un crédito activo que no cumple los requisitos para renovación (10 pagos puntuales).`, 'error');
            document.getElementById('form-colocacion').classList.add('hidden');
            return;
        }
        
        const creditoActivo = await database.buscarCreditoActivoPorCliente(curp);
        showStatus('status_colocacion', creditoActivo ? 'Cliente encontrado y elegible para renovación.' : 'Cliente encontrado y elegible para crédito nuevo.', 'success');
        
        document.getElementById('nombre_colocacion').value = cliente.nombre;
        document.getElementById('idCredito_colocacion').value = 'Se asignará automáticamente';
        document.getElementById('form-colocacion').classList.remove('hidden');
    } else {
        showStatus('status_colocacion', 'Cliente no encontrado. Registre al cliente primero.', 'error');
        document.getElementById('form-colocacion').classList.add('hidden');
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
    const resultado = await database.agregarCredito(credito);
    if (resultado.success) {
        showStatus('status_colocacion', `${resultado.message}. ID de crédito: ${resultado.data.id}`, 'success');
        e.target.reset();
        document.getElementById('form-colocacion').classList.add('hidden');
        document.getElementById('curp_colocacion').value = '';
    } else {
        showStatus('status_colocacion', resultado.message, 'error');
    }
}

async function handleSearchCreditForPayment() {
    const idCredito = document.getElementById('idCredito_cobranza').value.trim();
    creditoActual = await database.buscarCreditoPorId(idCredito);
    if (creditoActual) {
        const cliente = await database.buscarClientePorCURP(creditoActual.curpCliente);
        const historial = await obtenerHistorialCreditoCliente(creditoActual.curpCliente);
        
        document.getElementById('nombre_cobranza').value = cliente ? cliente.nombre : 'N/A';
        document.getElementById('saldo_cobranza').value = `$${historial.saldoRestante.toLocaleString()}`;
        document.getElementById('estado_cobranza').value = historial.estado.toUpperCase();
        document.getElementById('semanas_atraso_cobranza').value = historial.semanasAtraso || 0;
        document.getElementById('pago_semanal_cobranza').value = `$${historial.pagoSemanal.toLocaleString()}`;
        document.getElementById('fecha_proximo_pago_cobranza').value = historial.proximaFechaPago;
        document.getElementById('monto_cobranza').value = historial.pagoSemanal.toFixed(2);
        
        handleMontoPagoChange();
        
        document.getElementById('form-cobranza').classList.remove('hidden');
        showStatus('status_cobranza', 'Crédito encontrado.', 'success');
    } else {
        showStatus('status_cobranza', 'Crédito no encontrado.', 'error');
        document.getElementById('form-cobranza').classList.add('hidden');
    }
}

async function handlePaymentForm(e) {
    e.preventDefault();
    const pago = {
        idCredito: creditoActual.id,
        monto: parseFloat(document.getElementById('monto_cobranza').value),
        tipoPago: document.getElementById('tipo_cobranza').value
    };
    if (!pago.monto || pago.monto <= 0) {
        showStatus('status_cobranza', 'El monto del pago debe ser mayor a cero.', 'error');
        return;
    }
    const resultado = await database.agregarPago(pago);
    showStatus('status_cobranza', resultado.message, resultado.success ? 'success' : 'error');
    if (resultado.success) {
        document.getElementById('form-cobranza').classList.add('hidden');
        document.getElementById('idCredito_cobranza').value = '';
        creditoActual = null;
    }
}

function handleMontoPagoChange() {
    if (!creditoActual) return;
    const monto = parseFloat(document.getElementById('monto_cobranza').value) || 0;
    const saldoDespues = creditoActual.saldo - monto;
    document.getElementById('saldoDespues_cobranza').value = `$${saldoDespues.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

// =============================================
// FUNCIONES DE VISTA Y AUXILIARES
// =============================================

function showView(viewId) {
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
        targetView.dispatchEvent(new Event('viewshown'));
    }
}

function showStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    element.innerHTML = message;
    element.className = 'status-message ' + (type === 'success' ? 'status-success' : 'status-error');
}

function calcularMontoTotalColocacion() {
    const monto = parseFloat(document.getElementById('monto_colocacion').value) || 0;
    document.getElementById('montoTotal_colocacion').value = monto > 0 ? `$${(monto * 1.3).toLocaleString()}` : '';
}

function validarCURP(input) {
    input.value = input.value.toUpperCase().substring(0, 18);
    input.style.borderColor = input.value.length === 18 ? 'var(--success)' : (input.value.length > 0 ? 'var(--danger)' : '');
}

function validarFormatoCURP(curp) {
    return curp.length === 18;
}

function inicializarDropdowns() {
    const poblaciones = ['LA CALERA', 'ATEQUIZA', 'SAN JACINTO', 'PONCITLAN', 'OCOTLAN', 'ARENAL', 'AMATITAN', 'ACATLAN DE JUAREZ', 'BELLAVISTA', 'SAN ISIDRO MAZATEPEC', 'TALA', 'CUISILLOS', 'HUAXTLA', 'NEXTIPAC', 'SANTA LUCIA', 'JAMAY', 'LA BARCA', 'SAN JUAN DE OCOTAN', 'TALA 2', 'EL HUMEDO', 'NEXTIPAC 2', 'ZZ PUEBLO'];
    const rutas = ['AUDITORIA', 'SUPERVISION', 'ADMINISTRACION', 'DIRECCION', 'COMERCIAL', 'COBRANZA', 'R1', 'R2', 'R3', 'JC1', 'RX'];
    const tiposCredito = ['NUEVO', 'RENOVACION', 'REINGRESO'];
    const montos = [3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000, 9000, 10000];
    const plazos = [13, 14];
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
    popularDropdown('poblacion_grupo_cliente', poblaciones, 'Selecciona población/grupo');
    popularDropdown('ruta_cliente', rutas, 'Selecciona una ruta');
    popularDropdown('tipo_colocacion', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Selecciona tipo', true);
    popularDropdown('monto_colocacion', montos.map(m => ({ value: m, text: `$${m.toLocaleString()}` })), 'Selecciona monto', true);
    popularDropdown('plazo_colocacion', plazos.map(p => ({ value: p, text: `${p} semanas` })), 'Selecciona plazo', true);
    popularDropdown('grupo_filtro', poblaciones, 'Todos');
    popularDropdown('tipo_colocacion_filtro', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Todos', true);
    popularDropdown('plazo_filtro', plazos.map(p => ({ value: p, text: `${p} semanas` })), 'Todos', true);
}

// =============================================
// LÓGICA DE NEGOCIO (VIVE EN APP.JS)
// =============================================

function _calcularEstadoCredito(credito, pagos) {
    if (!credito) return null;
    if (credito.saldo <= 0.01) {
        return { estado: 'liquidado', diasAtraso: 0, semanasAtraso: 0, pagoSemanal: 0, proximaFechaPago: 'N/A' };
    }
    const pagoSemanal = (credito.plazo > 0) ? credito.montoTotal / credito.plazo : 0;
    const montoPagado = credito.montoTotal - credito.saldo;
    const fechaInicio = new Date(credito.fechaCreacion);
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
    
    creditosCliente.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
    const ultimoCredito = creditosCliente[0];
    
    const pagos = await database.getPagosPorCredito(ultimoCredito.id);
    const ultimoPago = pagos.length > 0 ? pagos[0] : null;

    const estadoCalculado = _calcularEstadoCredito(ultimoCredito, pagos);

    return {
        idCredito: ultimoCredito.id,
        saldoRestante: ultimoCredito.saldo,
        fechaUltimoPago: ultimoPago ? new Date(ultimoPago.fecha).toLocaleDateString() : 'N/A',
        ...estadoCalculado,
        semanaActual: Math.floor(pagos.length) + 1,
        plazoTotal: ultimoCredito.plazo,
    };
}

async function verificarElegibilidadRenovacion(curp) {
    const credito = await database.buscarCreditoActivoPorCliente(curp);
    if (!credito) return true; // Si no hay crédito activo, es elegible

    const pagos = await database.getPagosPorCredito(credito.id);
    const estado = _calcularEstadoCredito(credito, pagos);
    const semanasTranscurridas = Math.floor((new Date() - new Date(credito.fechaCreacion)) / (1000 * 60 * 60 * 24 * 7));

    return semanasTranscurridas >= 10 && estado.estado === 'al corriente';
}

// =============================================
// FUNCIONES DE CARGA DE DATOS PARA VISTAS
// =============================================

function inicializarVistaGestionClientes() {
    document.getElementById('tabla-clientes').innerHTML = `<tr><td colspan="6">Utiliza los filtros para buscar y mostrar clientes.</td></tr>`;
}

function limpiarFiltrosClientes() {
    document.getElementById('filtros-grid').querySelectorAll('input, select').forEach(el => el.value = '');
    inicializarVistaGestionClientes();
}

async function loadClientesTable() {
    const tbody = document.getElementById('tabla-clientes');
    tbody.innerHTML = '<tr><td colspan="6">Buscando...</td></tr>';
    const filtros = {
        sucursal: document.getElementById('sucursal_filtro').value,
        curp: document.getElementById('curp_filtro').value.toLowerCase(),
        nombre: document.getElementById('nombre_filtro').value.toLowerCase(),
        fechaRegistro: document.getElementById('fecha_registro_filtro').value,
        fechaCredito: document.getElementById('fecha_credito_filtro').value,
        tipo: document.getElementById('tipo_colocacion_filtro').value,
        plazo: document.getElementById('plazo_filtro').value,
        curpAval: document.getElementById('curp_aval_filtro').value.toLowerCase(),
        grupo: document.getElementById('grupo_filtro').value
    };

    const hayFiltros = Object.values(filtros).some(val => val && val.trim() !== '');
    if (!hayFiltros) {
        tbody.innerHTML = '<tr><td colspan="6">Por favor, especifica al menos un criterio de búsqueda.</td></tr>';
        return;
    }

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
            let estadoHTML = '', detallesHTML = '', estadoClase = '';
            switch (historial.estado) {
                case 'al corriente': estadoClase = 'status-al-corriente'; break;
                case 'atrasado': estadoClase = 'status-atrasado'; break;
                case 'cobranza': estadoClase = 'status-cobranza'; break;
                case 'juridico': estadoClase = 'status-juridico'; break;
                case 'liquidado': estadoClase = 'status-al-corriente'; break;
            }
            estadoHTML = `<span class="info-value ${estadoClase}">${historial.estado.toUpperCase()}</span>`;
            if(historial.estado !== 'liquidado') detallesHTML += `<div class="info-item"><span class="info-label">Saldo:</span><span class="info-value">$${historial.saldoRestante.toLocaleString()}</span></div>`;
            if(historial.semanasAtraso > 0) detallesHTML += `<div class="info-item"><span class="info-label">Semanas Atraso:</span><span class="info-value">${historial.semanasAtraso}</span></div>`;
            detallesHTML += `<div class="info-item"><span class="info-label">Último Pago:</span><span class="info-value">${historial.fechaUltimoPago}</span></div>`;
            infoCreditoHTML = `<div class="credito-info"><div class="info-grid"><div class="info-item"><span class="info-label">Último ID:</span><span class="info-value">${historial.idCredito}</span></div><div class="info-item"><span class="info-label">Estado:</span>${estadoHTML}</div>${detallesHTML}</div></div>`;
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
}

async function loadUsersTable() {
    // Esta función necesitaría una implementación con Firebase Admin SDK en un servidor
    // para listar usuarios de forma segura. Por ahora, se deja vacía.
    document.getElementById('tabla-usuarios').innerHTML = `<tr><td colspan="5">La gestión de usuarios se realiza en la consola de Firebase.</td></tr>`;
}

async function editCliente(docId) {
    // La lógica de edición para Firebase es más compleja y se omite por brevedad,
    // ya que requiere cargar datos en el formulario y luego actualizarlos.
    alert("Función de editar no implementada en esta versión de Firebase.");
}

async function deleteCliente(docId) {
    // La lógica de borrado para Firebase es más compleja y se omite.
    alert("Función de borrar no implementada en esta versión de Firebase.");
}
