// =============================================
// INICIALIZACIÓN DE LA APLICACIÓN CON FIREBASE
// =============================================

let currentUser = null;
let creditoActual = null;
let currentImportTab = 'clientes';


document.addEventListener('DOMContentLoaded', function () {
    setupEventListeners();

    // El nuevo manejador de estado de autenticación de Firebase
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            document.getElementById('user-name').textContent = user.displayName || user.email;
            document.getElementById('user-role-display').textContent = "Usuario"; 
            
            document.getElementById('loading-overlay').classList.add('hidden');
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');
        } else {
            currentUser = null;
            document.getElementById('loading-overlay').classList.add('hidden');
            document.getElementById('main-app').classList.add('hidden');
            document.getElementById('login-screen').classList.remove('hidden');
        }
    });
});

function setupEventListeners() {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
    document.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', function () { showView(this.getAttribute('data-view')); });
    });
    document.getElementById('btn-aplicar-filtros').addEventListener('click', loadClientesTable);
    document.getElementById('btn-limpiar-filtros').addEventListener('click', limpiarFiltrosClientes);
    document.getElementById('office-select').addEventListener('change', handleOfficeChange);
    document.querySelectorAll('.import-tab').forEach(tab => tab.addEventListener('click', handleTabClick));
    document.getElementById('btn-procesar-importacion').addEventListener('click', handleImport);
    document.getElementById('btn-limpiar-datos').addEventListener('click', () => { /* ... Lógica de limpiar BD ... */ });
    document.getElementById('btn-nuevo-usuario').addEventListener('click', () => { /* ... Lógica de UI ... */ });
    document.getElementById('btn-cancelar-usuario').addEventListener('click', () => { /* ... Lógica de UI ... */ });
    document.getElementById('form-usuario').addEventListener('submit', handleUserForm);
    document.getElementById('form-cliente').addEventListener('submit', handleClientForm);
    document.getElementById('curp_cliente').addEventListener('input', function () { validarCURP(this); });
    document.getElementById('btnBuscarCliente_colocacion').addEventListener('click', handleSearchClientForCredit);
    document.getElementById('form-credito-submit').addEventListener('submit', handleCreditForm);
    document.getElementById('curpAval_colocacion').addEventListener('input', function () { validarCURP(this); });
    document.getElementById('monto_colocacion').addEventListener('change', calcularMontoTotalColocacion);
    document.getElementById('plazo_colocacion').addEventListener('change', calcularMontoTotalColocacion);
    document.getElementById('btnBuscarCredito_cobranza').addEventListener('click', handleSearchCreditForPayment);
    document.getElementById('form-pago-submit').addEventListener('submit', handlePaymentForm);
    document.getElementById('monto_cobranza').addEventListener('input', handleMontoPagoChange);
    document.getElementById('btn-actualizar-reportes').addEventListener('click', () => { /* ... Lógica de reportes ... */ });
    document.getElementById('view-reportes').addEventListener('viewshown', () => document.getElementById('btn-actualizar-reportes').click());
    document.getElementById('view-usuarios').addEventListener('viewshown', () => { /* ... Cargar usuarios de Firebase ... */ });
    document.getElementById('view-gestion-clientes').addEventListener('viewshown', inicializarVistaGestionClientes);
}

// =============================================
// MANEJADORES DE EVENTOS CON FIREBASE
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
    document.getElementById('saldoDespues_cobranza').value = `$${saldoDespues.toLocaleString()}`;
}

async function loadClientesTable() {
    const tbody = document.getElementById('tabla-clientes');
    tbody.innerHTML = '<tr><td colspan="6">Buscando...</td></tr>';
    const filtros = {
        sucursal: document.getElementById('sucursal_filtro').value,
        curp: document.getElementById('curp_filtro').value.toLowerCase(),
        nombre: document.getElementById('nombre_filtro').value.toLowerCase(),
        // ... otros filtros
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

// =============================================
// LÓGICA DE NEGOCIO (MOVIDA A APP.JS)
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
    if (!credito) return true;

    const pagos = await database.getPagosPorCredito(credito.id);
    const estado = _calcularEstadoCredito(credito, pagos);
    const semanasTranscurridas = Math.floor((new Date() - new Date(credito.fechaCreacion)) / (1000 * 60 * 60 * 24 * 7));

    return semanasTranscurridas >= 10 && estado.estado === 'al corriente';
}

// =============================================
// EL RESTO DE FUNCIONES (SIN CAMBIOS LÓGICOS IMPORTANTES)
// =============================================
function inicializarVistaGestionClientes() {
    document.getElementById('tabla-clientes').innerHTML = `<tr><td colspan="6">Utiliza los filtros para buscar y mostrar clientes.</td></tr>`;
}
function limpiarFiltrosClientes() {
    document.getElementById('filtros-grid').querySelectorAll('input, select').forEach(el => el.value = '');
    inicializarVistaGestionClientes();
}
function inicializarDropdowns() { /* ... (código sin cambios) ... */ }
function showStatus(elementId, message, type) { /* ... (código sin cambios) ... */ }
function showView(viewId) { /* ... (código sin cambios) ... */ }
function calcularMontoTotalColocacion() { /* ... (código sin cambios) ... */ }
function validarCURP(input) { /* ... (código sin cambios) ... */ }
function validarFormatoCURP(curp) { return curp.length === 18; }
async function loadUsersTable() { /* ... Lógica para cargar usuarios de Firebase Auth ... */ }
async function editCliente(docId) { /* ... Lógica para editar cliente en Firebase ... */ }
async function deleteCliente(docId) { /* ... Lógica para borrar cliente en Firebase ... */ }
