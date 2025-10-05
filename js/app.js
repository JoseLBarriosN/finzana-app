// =============================================
// INICIALIZACIÓN DE LA APLICACIÓN
// =============================================

let database;
let currentUser = null;
let currentImportTab = 'clientes';
let creditoActual = null;

document.addEventListener('DOMContentLoaded', function () {
    // Inicializar base de datos
    database = new FinzanaDatabase();

    // Inicializar dropdowns
    inicializarDropdowns();

    // Verificar sesión activa inmediatamente
    const savedUser = localStorage.getItem('finzana-user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            document.getElementById('loading-overlay').classList.add('hidden');
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');
            document.getElementById('user-name').textContent = currentUser.name;
            document.getElementById('user-role-display').textContent = currentUser.role;
        } catch (error) {
            console.error('Error al cargar sesión:', error);
            localStorage.removeItem('finzana-user');
            mostrarLogin();
        }
    } else {
        mostrarLogin();
    }

    // --- MANEJO DE EVENTOS ---
    setupEventListeners();
});

function mostrarLogin() {
    setTimeout(() => {
        document.getElementById('loading-overlay').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
    }, 500);
}

function setupEventListeners() {
    // Sistema de Autenticación
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('finzana-user');
        location.reload();
    });

    // Navegación Principal
    document.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', function () {
            showView(this.getAttribute('data-view'));
        });
    });

    // Gestión de Clientes
    document.getElementById('btn-aplicar-filtros').addEventListener('click', loadClientesTable);
    document.getElementById('btn-limpiar-filtros').addEventListener('click', limpiarFiltrosClientes);

    // Importación de Datos
    document.getElementById('office-select').addEventListener('change', handleOfficeChange);
    document.querySelectorAll('.import-tab').forEach(tab => tab.addEventListener('click', handleTabClick));
    document.getElementById('btn-procesar-importacion').addEventListener('click', handleImport);
    document.getElementById('btn-limpiar-datos').addEventListener('click', () => {
        if (confirm('¿Estás seguro de que deseas limpiar TODA la base de datos? Esta acción no se puede deshacer.')) {
            database.limpiarBaseDeDatos().then(resultado => {
                showStatus('estado-importacion', resultado.message, 'success');
                document.getElementById('resultado-importacion').classList.remove('hidden');
            });
        }
    });

    // Gestión de Usuarios
    document.getElementById('btn-nuevo-usuario').addEventListener('click', () => {
        document.getElementById('form-usuario-container').classList.remove('hidden');
        document.getElementById('form-usuario').reset();
        document.getElementById('form-usuario-titulo').textContent = 'Nuevo Usuario';
        document.getElementById('usuario-id').value = '';
        document.getElementById('nuevo-username').readOnly = false;
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

    // Evento para calcular saldo en tiempo real en cobranza
    document.getElementById('monto_cobranza').addEventListener('input', function () {
        if (creditoActual) {
            const montoPago = parseFloat(this.value) || 0;
            const saldoDespues = creditoActual.saldo - montoPago;
            document.getElementById('saldoDespues_cobranza').value = `$${Math.max(0, saldoDespues).toLocaleString()}`;
        }
    });

    // Reportes
    document.getElementById('btn-actualizar-reportes').addEventListener('click', actualizarReportes);

    // Eventos de Vistas
    document.getElementById('view-reportes').addEventListener('viewshown', actualizarReportes);
    document.getElementById('view-usuarios').addEventListener('viewshown', loadUsersTable);
    document.getElementById('view-gestion-clientes').addEventListener('viewshown', inicializarVistaGestionClientes);
}

// =============================================
// MANEJADORES DE EVENTOS
// =============================================

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const role = document.getElementById('user-role').value;

    if (!username || !password || !role) {
        showStatus('auth-status', 'Todos los campos son obligatorios.', 'error');
        return;
    }

    try {
        const users = await database.getUsers();
        if (users[username] && users[username].password === password && users[username].role === role) {
            currentUser = { username, name: users[username].name, role };
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');
            document.getElementById('user-name').textContent = currentUser.name;
            document.getElementById('user-role-display').textContent = currentUser.role;
            localStorage.setItem('finzana-user', JSON.stringify(currentUser));
            showStatus('auth-status', '', 'success'); // Limpiar mensaje
        } else {
            showStatus('auth-status', 'Credenciales incorrectas.', 'error');
        }
    } catch (error) {
        showStatus('auth-status', 'Error al conectar con la base de datos.', 'error');
    }
}

function handleOfficeChange() {
    const office = this.value;
    const isGDL = office === 'GDL';
    document.getElementById('import-gdl-section').classList.toggle('hidden', !isGDL);
    document.getElementById('import-leon-section').classList.toggle('hidden', isGDL);
    currentImportTab = 'clientes';

    // Activar la pestaña correcta
    const selector = isGDL ?
        '#import-gdl-section .import-tab[data-tab="clientes"]' :
        '#import-leon-section .import-tab[data-tab="clientes"]';

    const tabElement = document.querySelector(selector);
    if (tabElement) {
        handleTabClick.call(tabElement);
    }
}

function handleTabClick() {
    const parentSection = this.closest('[id$="-section"]');
    const tabType = this.getAttribute('data-tab');

    // Actualizar pestañas activas
    parentSection.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
    this.classList.add('active');
    currentImportTab = tabType;

    // Mostrar contenido correspondiente
    parentSection.querySelectorAll('.import-tab-content').forEach(c => c.classList.add('hidden'));
    const officePrefix = parentSection.id.includes('gdl') ? 'gdl' : 'leon';
    const contentId = `tab-${officePrefix}-${tabType}`;
    const contentElement = document.getElementById(contentId);

    if (contentElement) {
        contentElement.classList.remove('hidden');
    }
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

    showStatus('estado-importacion', 'Procesando importación...', 'success');
    document.getElementById('resultado-importacion').classList.remove('hidden');

    try {
        const resultado = await database.importarDatosDesdeCSV(csvData, currentImportTab, office);
        let mensaje = `Importación (${office} - ${currentImportTab}) completada: ${resultado.importados} de ${resultado.total} registros.`;

        if (resultado.errores && resultado.errores.length > 0) {
            mensaje += `<br>Errores: ${resultado.errores.length}`;
            document.getElementById('detalle-importacion').innerHTML =
                `<strong>Detalle de errores:</strong><ul>${resultado.errores.map(e => `<li>${e}</li>`).join('')}</ul>`;
        } else {
            document.getElementById('detalle-importacion').innerHTML = '<strong>Importación completada sin errores.</strong>';
        }

        showStatus('estado-importacion', mensaje, resultado.success ? 'success' : 'error');
    } catch (error) {
        showStatus('estado-importacion', `Error en importación: ${error.message}`, 'error');
    }
}

async function handleUserForm(e) {
    e.preventDefault();
    const users = await database.getUsers();
    const userId = document.getElementById('usuario-id').value;
    const username = document.getElementById('nuevo-username').value;
    const password = document.getElementById('nuevo-password').value;
    const nombre = document.getElementById('nuevo-nombre').value;
    const rol = document.getElementById('nuevo-rol').value;
    const email = document.getElementById('nuevo-email').value;
    const telefono = document.getElementById('nuevo-telefono').value;

    if (userId) { // Actualizar
        if (users[userId]) {
            users[userId] = { ...users[userId], name: nombre, role: rol, email, telefono, username: userId };
            if (password) users[userId].password = password;
            await database.put('users', users[userId]);
            showStatus('status_usuarios', 'Usuario actualizado.', 'success');
        }
    } else { // Crear
        if (users[username]) {
            showStatus('status_usuarios', 'Ese nombre de usuario ya existe.', 'error');
            return;
        }
        const newUser = { username, password, name: nombre, role: rol, email, telefono, fechaCreacion: new Date().toISOString() };
        await database.add('users', newUser);
        showStatus('status_usuarios', 'Usuario creado.', 'success');
    }
    document.getElementById('form-usuario-container').classList.add('hidden');
    loadUsersTable();
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
    if (resultado.success) this.reset();
}

async function handleSearchClientForCredit() {
    const curp = document.getElementById('curp_colocacion').value.trim();
    if (!validarFormatoCURP(curp)) {
        showStatus('status_colocacion', 'El CURP debe tener 18 caracteres.', 'error');
        return;
    }
    const cliente = await database.buscarClientePorCURP(curp);
    if (cliente) {
        const creditoActivo = await database.buscarCreditoActivoPorCliente(curp);
        if (creditoActivo) {
            showStatus('status_colocacion', `El cliente ya tiene un crédito activo (ID: ${creditoActivo.id}). No se puede generar uno nuevo.`, 'error');
            document.getElementById('form-colocacion').classList.add('hidden');
            return;
        }
        document.getElementById('nombre_colocacion').value = cliente.nombre;
        document.getElementById('idCredito_colocacion').value = 'Se asignará automáticamente';
        document.getElementById('form-colocacion').classList.remove('hidden');
        showStatus('status_colocacion', 'Cliente encontrado y elegible para crédito.', 'success');
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
        this.reset();
        document.getElementById('form-colocacion').classList.add('hidden');
        document.getElementById('curp_colocacion').value = '';
    } else {
        showStatus('status_colocacion', resultado.message, 'error');
    }
}

async function handleSearchCreditForPayment() {
    const idCredito = document.getElementById('idCredito_cobranza').value.trim();

    if (!idCredito) {
        showStatus('status_cobranza', 'Por favor ingresa un ID de crédito.', 'error');
        return;
    }

    showStatus('status_cobranza', 'Buscando crédito...', 'success');

    try {
        const credito = await database.buscarCreditoPorId(idCredito);
        if (credito) {
            creditoActual = credito;
            const cliente = await database.buscarClientePorCURP(credito.curpCliente);
            const pagosCredito = (await database.getPagos()).filter(p => p.idCredito === credito.id);
            const historial = await database.obtenerHistorialCreditoCliente(credito.curpCliente);

            document.getElementById('nombre_cobranza').value = cliente ? cliente.nombre : 'N/A';
            document.getElementById('grupo_cobranza').value = cliente ? cliente.poblacion_grupo : 'N/A';
            document.getElementById('saldo_cobranza').value = `$${credito.saldo.toLocaleString()}`;
            document.getElementById('estado_cobranza').value = historial ? historial.descripcion : 'N/A';
            document.getElementById('semanas_atraso_cobranza').value = historial ? historial.semanasAtraso : 0;
            document.getElementById('pago_semanal_cobranza').value = historial ? `$${historial.pagoSemanal.toLocaleString()}` : '$0';
            document.getElementById('fecha_proximo_pago_cobranza').value = historial ? historial.proximoPago : 'N/A';

            // Calcular saldo después del pago
            const montoPago = document.getElementById('monto_cobranza').value;
            const saldoDespues = credito.saldo - (parseFloat(montoPago) || 0);
            document.getElementById('saldoDespues_cobranza').value = `$${Math.max(0, saldoDespues).toLocaleString()}`;

            document.getElementById('form-cobranza').classList.remove('hidden');
            showStatus('status_cobranza', 'Crédito encontrado correctamente.', 'success');
        } else {
            showStatus('status_cobranza', 'Crédito no encontrado. Verifica el ID.', 'error');
            document.getElementById('form-cobranza').classList.add('hidden');
        }
    } catch (error) {
        showStatus('status_cobranza', `Error al buscar crédito: ${error.message}`, 'error');
        document.getElementById('form-cobranza').classList.add('hidden');
    }
}

async function handlePaymentForm(e) {
    e.preventDefault();

    if (!creditoActual) {
        showStatus('status_cobranza', 'Primero busca un crédito válido.', 'error');
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

    if (pago.monto > creditoActual.saldo) {
        showStatus('status_cobranza', `El monto del pago no puede exceder el saldo actual ($${creditoActual.saldo.toLocaleString()}).`, 'error');
        return;
    }

    try {
        const resultado = await database.agregarPago(pago);
        showStatus('status_cobranza', resultado.message, resultado.success ? 'success' : 'error');

        if (resultado.success) {
            // Limpiar formulario
            document.getElementById('form-pago-submit').reset();
            document.getElementById('form-cobranza').classList.add('hidden');
            document.getElementById('idCredito_cobranza').value = '';
            creditoActual = null;
        }
    } catch (error) {
        showStatus('status_cobranza', `Error al registrar pago: ${error.message}`, 'error');
    }
}

// =============================================
// FUNCIONES AUXILIARES Y DE VISTA
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
    if (element) {
        element.innerHTML = message;
        element.className = 'status-message ' + (type === 'success' ? 'status-success' : 'status-error');
        element.classList.remove('hidden');
    }
}

function calcularMontoTotalColocacion() {
    const monto = parseFloat(document.getElementById('monto_colocacion').value) || 0;
    const montoTotal = monto * 1.3;
    document.getElementById('montoTotal_colocacion').value = monto > 0 ? `$${montoTotal.toLocaleString()}` : '';
}

function validarCURP(input) {
    input.value = input.value.toUpperCase().substring(0, 18);
    input.style.borderColor = input.value.length === 18 ? 'var(--success)' : (input.value.length > 0 ? 'var(--danger)' : '');
}

function validarFormatoCURP(curp) {
    return curp && curp.length === 18;
}

// =============================================
// FUNCIONES DE REPORTES MEJORADAS
// =============================================

async function actualizarReportes() {
    const btn = document.getElementById('btn-actualizar-reportes');
    const originalText = btn.innerHTML;

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
    btn.disabled = true;

    try {
        const reportes = await database.generarReportes();

        if (reportes) {
            document.getElementById('total-clientes').textContent = reportes.totalClientes.toLocaleString();
            document.getElementById('total-creditos').textContent = reportes.totalCreditos.toLocaleString();
            document.getElementById('total-cartera').textContent = `$${reportes.totalCartera.toLocaleString()}`;
            document.getElementById('total-vencidos').textContent = reportes.totalVencidos.toLocaleString();
            document.getElementById('pagos-registrados').textContent = reportes.pagosRegistrados.toLocaleString();
            document.getElementById('cobrado-mes').textContent = `$${reportes.cobradoMes.toLocaleString()}`;
            document.getElementById('total-comisiones').textContent = `$${reportes.totalComisiones.toLocaleString()}`;

            // Calcular tasa de recuperación correctamente
            const tasaRecuperacion = reportes.cobradoMes > 0 ?
                (reportes.cobradoMes / (reportes.totalCartera + reportes.cobradoMes) * 100) : 0;
            document.getElementById('tasa-recuperacion').textContent = `${tasaRecuperacion.toFixed(1)}%`;
        }

        showStatus('status_reportes', 'Reportes actualizados correctamente.', 'success');
    } catch (error) {
        console.error('Error actualizando reportes:', error);
        showStatus('status_reportes', 'Error al actualizar reportes.', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// =============================================
// FUNCIONES DE CARGA DE DATOS PARA VISTAS
// =============================================

async function loadUsersTable() {
    const tbody = document.getElementById('tabla-usuarios');
    tbody.innerHTML = '';
    const users = await database.getUsers();
    for (const [username, userData] of Object.entries(users)) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${username}</td>
            <td>${userData.name}</td>
            <td><span class="role-badge role-${userData.role}">${userData.role}</span></td>
            <td>${userData.email || ''}</td>
            <td>${userData.telefono || ''}</td>
            <td class="action-buttons">
                <button class="btn btn-sm btn-secondary" onclick="editUser('${username}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteUser('${username}')"><i class="fas fa-trash"></i></button>
            </td>`;
        tbody.appendChild(tr);
    }
}

async function editUser(username) {
    const users = await database.getUsers();
    const user = users[username];
    if (user) {
        document.getElementById('form-usuario-container').classList.remove('hidden');
        document.getElementById('form-usuario-titulo').textContent = 'Editar Usuario';
        document.getElementById('usuario-id').value = username;
        document.getElementById('nuevo-username').value = username;
        document.getElementById('nuevo-username').readOnly = true;
        document.getElementById('nuevo-password').value = '';
        document.getElementById('nuevo-password').placeholder = 'Dejar en blanco para no cambiar';
        document.getElementById('nuevo-nombre').value = user.name;
        document.getElementById('nuevo-rol').value = user.role;
        document.getElementById('nuevo-email').value = user.email || '';
        document.getElementById('nuevo-telefono').value = user.telefono || '';
    }
}

async function deleteUser(username) {
    if (username === 'admin') {
        alert('No se puede eliminar al usuario administrador principal.');
        return;
    }
    if (confirm(`¿Estás seguro de que deseas eliminar al usuario ${username}?`)) {
        await database.delete('users', username);
        loadUsersTable();
        showStatus('status_usuarios', 'Usuario eliminado.', 'success');
    }
}

function inicializarVistaGestionClientes() {
    const tbody = document.getElementById('tabla-clientes');
    tbody.innerHTML = `<tr><td colspan="6">Utiliza los filtros para buscar y mostrar clientes.</td></tr>`;
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
        tbody.innerHTML = '<tr><td colspan="6">Por favor, especifica al menos un criterio de búsqueda para comenzar.</td></tr>';
        return;
    }

    try {
        const clientesFiltrados = await database.buscarClientes(filtros);

        tbody.innerHTML = '';
        if (clientesFiltrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No se encontraron clientes con los filtros aplicados.</td></tr>';
            return;
        }

        for (const cliente of clientesFiltrados) {
            const tr = document.createElement('tr');
            const historial = await database.obtenerHistorialCreditoCliente(cliente.curp);
            let infoCreditoHTML = '<em>Sin créditos registrados</em>';

            if (historial) {
                const estadoClase = `status-${historial.estado.replace('-', '_')}`;

                infoCreditoHTML = `
                    <div class="credito-info">
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="info-label">ID Crédito:</span>
                                <span class="info-value">${historial.idCredito || 'N/A'}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Estado:</span>
                                <span class="info-value ${estadoClase}">${historial.descripcion}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Saldo:</span>
                                <span class="info-value">$${historial.saldoRestante?.toLocaleString() || '0'}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Pago Semanal:</span>
                                <span class="info-value">$${historial.pagoSemanal?.toLocaleString() || '0'}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Próximo Pago:</span>
                                <span class="info-value">${historial.proximoPago || 'N/A'}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Semanas Atraso:</span>
                                <span class="info-value">${historial.semanasAtraso || 0}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Último Pago:</span>
                                <span class="info-value">${historial.fechaUltimoPago || 'N/A'}</span>
                            </div>
                            ${historial.elegibleNuevoCredito ?
                        '<div class="info-item"><span class="info-label status-al-corriente">✓ Elegible para nuevo crédito</span></div>' :
                        ''}
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
                    <button class="btn btn-sm btn-secondary" onclick="editCliente('${cliente.curp}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCliente('${cliente.curp}')"><i class="fas fa-trash"></i></button>
                </td>`;
            tbody.appendChild(tr);
        }
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6">Error al cargar los clientes. Intenta nuevamente.</td></tr>';
        console.error('Error al cargar clientes:', error);
    }
}

async function editCliente(curp) {
    const cliente = await database.buscarClientePorCURP(curp);
    if (cliente) {
        showView('view-cliente');
        const form = document.getElementById('form-cliente');
        const curpInput = document.getElementById('curp_cliente');

        curpInput.value = cliente.curp;
        curpInput.readOnly = true;
        document.getElementById('nombre_cliente').value = cliente.nombre;
        document.getElementById('domicilio_cliente').value = cliente.domicilio;
        document.getElementById('cp_cliente').value = cliente.cp;
        document.getElementById('telefono_cliente').value = cliente.telefono;
        document.getElementById('poblacion_grupo_cliente').value = cliente.poblacion_grupo;
        document.getElementById('ruta_cliente').value = cliente.ruta;

        form.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> Actualizar Cliente';

        form.onsubmit = async function (e) {
            e.preventDefault();
            const datosActualizados = {
                ...cliente,
                nombre: document.getElementById('nombre_cliente').value,
                domicilio: document.getElementById('domicilio_cliente').value,
                cp: document.getElementById('cp_cliente').value,
                telefono: document.getElementById('telefono_cliente').value,
                poblacion_grupo: document.getElementById('poblacion_grupo_cliente').value,
                ruta: document.getElementById('ruta_cliente').value
            };
            await database.put('clientes', datosActualizados);
            showStatus('status_cliente', 'Cliente actualizado exitosamente', 'success');

            form.reset();
            curpInput.readOnly = false;
            form.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> Guardar Cliente';
            form.onsubmit = handleClientForm;
            showView('view-gestion-clientes');
        };
    }
}

async function deleteCliente(curp) {
    if (await database.buscarCreditoActivoPorCliente(curp)) {
        alert('No se puede eliminar un cliente con un crédito activo.');
        return;
    }
    if (confirm(`¿Estás seguro de que deseas eliminar al cliente con CURP ${curp}? Se eliminarán también su historial de créditos y pagos.`)) {
        const cliente = await database.buscarClientePorCURP(curp);
        if (cliente) {
            await database.delete('clientes', cliente.id);
            // También eliminar créditos y pagos asociados
            const creditos = await database.getCreditos();
            const creditosCliente = creditos.filter(c => c.curpCliente === curp);
            for (const credito of creditosCliente) {
                await database.delete('creditos', credito.id);
            }
            showStatus('status_gestion_clientes', 'Cliente eliminado', 'success');
            inicializarVistaGestionClientes();
        }
    }
}

// =============================================
// INICIALIZACIÓN DE DROPDOWNS
// =============================================

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
