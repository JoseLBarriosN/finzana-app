// =============================================
// INICIALIZACIÓN DE LA APLICACIÓN CON FIREBASE - CORREGIDO COMPLETO
// =============================================

let currentUser = null;
let currentUserData = null; // Para almacenar los datos del usuario logueado
let creditoActual = null; // Almacenará el objeto COMPLETO del crédito seleccionado (incluyendo Firestore ID y historicalIdCredito)
let currentImportTab = 'clientes';
let reportData = null;
let cargaEnProgreso = false;
let currentSearchOperation = null;
let editingClientId = null; // ID del cliente que se está editando
let editingUserId = null;
let isOnline = true;
let inactivityTimer; // Temporizador para el cierre de sesión por inactividad
let grupoDePagoActual = null; // Para la nueva función de pago grupal
let currentChart = null; // Para la nueva función de gráficos
let cobranzaRutaData = null;
let dropdownUpdateInProgress = false; // Prevenir actualizaciones duplicadas

/** Parsea de forma robusta una fecha que puede ser un string (ISO 8601, yyyy-mm-dd, etc.) **/
function parsearFecha(fechaInput) {
    if (!fechaInput) return null;
    if (fechaInput instanceof Date) return fechaInput;
    if (typeof fechaInput === 'object' && typeof fechaInput.toDate === 'function') return fechaInput.toDate(); // Soporte para Timestamps de Firestore

    if (typeof fechaInput === 'string') {
        const fechaStr = fechaInput.trim();
        // Prioridad 1: Formato ISO 8601 (el más confiable) YYYY-MM-DDTHH:mm:ss.sssZ
        if (fechaStr.includes('T') && fechaStr.includes('Z') && fechaStr.length > 10) {
            const fecha = new Date(fechaStr);
            if (!isNaN(fecha.getTime())) return fecha;
        }

        // Prioridad 2: YYYY-MM-DD (sin hora)
        if (/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
            const fecha = new Date(fechaStr + 'T00:00:00Z'); // Interpretar como UTC
            if (!isNaN(fecha.getTime())) return fecha;
        }


        // Prioridad 3: Formatos con guiones o slashes (DD-MM-YYYY, MM/DD/YYYY etc.)
        const separador = fechaStr.includes('/') ? '/' : '-';
        const partes = fechaStr.split('T')[0].split(separador); // Ignorar hora si la hubiera


        if (partes.length === 3) {
            const [p1, p2, p3] = partes.map(p => parseInt(p, 10));
            if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
                let anio, mes, dia;
                // Intentar DD-MM-YYYY
                if (p3 > 1000 && p1 <= 31 && p2 <= 12) {
                    anio = p3; dia = p1; mes = p2;
                }
                // Intentar YYYY-MM-DD (ya cubierto arriba, pero por si acaso)
                else if (p1 > 1000 && p2 <= 12 && p3 <= 31) {
                    anio = p1; mes = p2; dia = p3;
                }
                // Intentar MM-DD-YYYY
                else if (p3 > 1000 && p1 <= 12 && p2 <= 31) {
                    anio = p3; mes = p1; dia = p2;
                }


                if (anio && mes && dia && mes > 0 && mes <= 12 && dia > 0 && dia <= 31) {
                    // Verificar validez del día para el mes y año
                    const diasEnMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
                    if (dia <= diasEnMes) {
                        const fecha = new Date(Date.UTC(anio, mes - 1, dia));
                        if (!isNaN(fecha.getTime())) return fecha;
                    }
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
    // Usar UTC para evitar problemas de zona horaria al mostrar
    const dia = String(dateObj.getUTCDate()).padStart(2, '0');
    const mes = String(dateObj.getUTCMonth() + 1).padStart(2, '0'); // Meses son 0-11
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
    const filtrosOnline = document.querySelectorAll('#sucursal_filtro, #estado_credito_filtro, #plazo_filtro, #curp_aval_filtro, #grupo_filtro, #tipo_colocacion_filtro');
    const botonesOnline = document.querySelectorAll('#btn-aplicar-filtros-reportes, #btn-exportar-csv, #btn-exportar-pdf, #btn-generar-grafico, #btn-verificar-duplicados, #btn-diagnosticar-pagos, #btn-agregar-poblacion, #btn-agregar-ruta'); // Añadir más si aplica
    const progressContainer = document.getElementById('progress-container-fixed');
    const isProgressActive = progressContainer && progressContainer.classList.contains('visible');

    if (isProgressActive) {

        if (isOnline) {
              filtrosOnline.forEach(el => { if (el) el.disabled = false; });
              botonesOnline.forEach(el => { if (el) el.disabled = false; });
              if (currentUserData) aplicarPermisosUI(currentUserData.role);
              logoutBtn.disabled = false;
              logoutBtn.title = 'Cerrar Sesión';
        }    

        if (isOnline) {
            return; 
        }
        
    if (isOnline) {
        statusDiv.textContent = 'Conexión restablecida. Sincronizando datos...';
        statusDiv.className = 'connection-status online';
        statusDiv.classList.remove('hidden');
        document.body.classList.add('has-connection-status');
        logoutBtn.disabled = false;
        logoutBtn.title = 'Cerrar Sesión';
        filtrosOnline.forEach(el => { if (el) el.disabled = false; });
        botonesOnline.forEach(el => { if (el) el.disabled = false; });
        if (currentUserData) aplicarPermisosUI(currentUserData.role);
        setTimeout(() => {
            if (navigator.onLine) {
                statusDiv.textContent = 'Datos sincronizados correctamente.';             
                setTimeout(() => {                
                    if (navigator.onLine) {
                        statusDiv.classList.add('hidden');
                        document.body.classList.remove('has-connection-status');
                    }
                }, 2500);
            }
        }, 3000);
    } else {
        statusDiv.textContent = 'Modo sin conexión. Búsquedas por CURP, Nombre e ID Crédito habilitadas.';
        statusDiv.className = 'connection-status offline';
        statusDiv.classList.remove('hidden');
        document.body.classList.add('has-connection-status');
        logoutBtn.disabled = true;
        logoutBtn.title = 'No puedes cerrar sesión sin conexión';
        filtrosOnline.forEach(el => { if (el) el.disabled = true; });
        botonesOnline.forEach(el => { if (el) el.disabled = true; });
    }
}

// =============================================
// *** INICIO DE LA CORRECCIÓN: LÓGICA DE ESTADO/SEMANAS PAGADAS (REVISADA) ***
// =============================================
/**
 * Calcula el estado actual de un crédito (atraso, estado, etc.) basado en sus datos y pagos.
 * @param {object} credito El objeto de crédito de Firestore.
 * @param {Array<object>} pagos Un array de objetos de pago para ese crédito (DEBEN ESTAR ORDENADOS DESC POR FECHA).
 * @returns {object|null} Un objeto con { estado, semanasAtraso, pagoSemanal, saldoRestante, proximaFechaPago } o null si hay error.
 */
function _calcularEstadoCredito(credito, pagos) {
    if (!credito || !credito.montoTotal || !credito.plazo || credito.plazo <= 0 || !credito.fechaCreacion) {
        console.warn("Datos de crédito insuficientes para calcular estado:", credito?.id || credito?.historicalIdCredito);
        return null; // Datos insuficientes
    }

    // --- 1. Calcular valores base ---
    const pagoSemanal = credito.montoTotal / credito.plazo;
    const montoTotal = credito.montoTotal;

    // --- 1.1. RECALCULAR SALDO (La corrección clave) ---
    let totalPagado = 0;
    if (pagos && pagos.length > 0) {
        totalPagado = pagos.reduce((sum, p) => sum + (p.monto || 0), 0);
    }

    let saldoCalculado = montoTotal - totalPagado;

    // Redondeo y tolerancia (si pagó 4000.005 en un crédito de 4000, está liquidado)
    const toleranciaLiquidado = 0.015; // Un poco más de 1 centavo
    if (saldoCalculado < toleranciaLiquidado) {
        saldoCalculado = 0;
    }
    
    const saldoRestante = parseFloat(saldoCalculado.toFixed(2));
    
    // --- 2. VERIFICACIÓN DE LIQUIDADO (Prioridad #1) ---
    if (saldoRestante === 0) {
        
        let semanasPagadasCalc = 0;
        if (pagoSemanal > 0.01) {
            const montoPagadoTotal = totalPagado;
            const epsilon = 0.001;
            semanasPagadasCalc = Math.floor((montoPagadoTotal / pagoSemanal) + epsilon);
            semanasPagadasCalc = Math.min(Math.max(0, semanasPagadasCalc), credito.plazo);
        }
        
        if (semanasPagadasCalc < credito.plazo) {
            console.warn(`Crédito ${credito.historicalIdCredito || credito.id} liquidado por cálculo de pagos (Saldo: ${saldoRestante}), pero cálculo de semanas (${semanasPagadasCalc}) no coincide con plazo (${credito.plazo}). Forzando a plazo completo.`);
            semanasPagadasCalc = credito.plazo;
        }

        return {
            estado: 'liquidado',
            semanasAtraso: 0,
            pagoSemanal: pagoSemanal,
            saldoRestante: 0, // Forzar a 0
            proximaFechaPago: 'N/A',
            semanasPagadas: semanasPagadasCalc
        };
    }

    // --- 3. Calcular Estado según Reglas de Fecha (Si NO está liquidado) ---
    const fechaCreacion = parsearFecha(credito.fechaCreacion);
    if (!fechaCreacion) {
        console.warn("Fecha de creación de crédito inválida:", credito.fechaCreacion, "ID:", credito.id || credito.historicalIdCredito);
        return null;
    }
    let fechaReferencia;
    if (pagos && pagos.length > 0) {
        fechaReferencia = parsearFecha(pagos[0].fecha);
    } else {
        fechaReferencia = fechaCreacion;
    }

    if (!fechaReferencia) {
        console.warn("Fecha de referencia inválida para crédito:", credito.id || credito.historicalIdCredito);
        return null;
    }

    const hoy = new Date();
    // Asegurarse de comparar solo fechas, no horas, usando UTC
    const hoyUTC = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
    const refUTC = new Date(Date.UTC(fechaReferencia.getUTCFullYear(), fechaReferencia.getUTCMonth(), fechaReferencia.getUTCDate()));

    const msDesdeReferencia = hoyUTC.getTime() - refUTC.getTime();
    const diasDesdeReferencia = Math.floor(msDesdeReferencia / (1000 * 60 * 60 * 24));

    let estadoDisplay;
    if (diasDesdeReferencia <= 7) {
        estadoDisplay = 'al corriente';
    } else if (diasDesdeReferencia > 7 && diasDesdeReferencia <= 30) {
        estadoDisplay = 'atrasado';
    } else if (diasDesdeReferencia > 30 && diasDesdeReferencia <= 180) {
        estadoDisplay = 'cobranza';
    } else {
        estadoDisplay = 'juridico';
    }

    // --- 4. Calcular Atraso en Semanas (para visualización) ---
    const msTranscurridos = hoyUTC.getTime() - fechaCreacion.getTime(); // Usar UTC aquí también
    const semanasTranscurridas = Math.floor(msTranscurridos / (1000 * 60 * 60 * 24 * 7));

    const montoPagadoTotal = totalPagado; // Usar el totalPagado calculado

    let semanasPagadas = 0;
    if (pagoSemanal > 0.01) {
        const epsilon = 0.001;
        semanasPagadas = Math.floor((montoPagadoTotal / pagoSemanal) + epsilon);
    }
    semanasPagadas = Math.min(Math.max(0, semanasPagadas), credito.plazo);

    let semanasQueDebieronPagarse = Math.min(semanasTranscurridas + 1, credito.plazo);
    let semanasAtraso = Math.max(0, semanasQueDebieronPagarse - semanasPagadas);

    if (semanasTranscurridas >= credito.plazo) {
        semanasAtraso = Math.max(0, credito.plazo - semanasPagadas);
    }


    // --- 5. Calcular Próxima Fecha de Pago ---
    let proximaFechaPago = 'N/A';
    // Solo hay próxima fecha si aún no ha completado el plazo en pagos
    if (semanasPagadas < credito.plazo) {
        const proximaFecha = new Date(fechaCreacion);
        // La próxima fecha teórica es después de la última semana pagada
        proximaFecha.setUTCDate(proximaFecha.getUTCDate() + (semanasPagadas + 1) * 7);
        proximaFechaPago = formatDateForDisplay(proximaFecha);
    }

    // Devolver el objeto de estado calculado
    return {
        estado: estadoDisplay, // El estado se basa en los DÍAS desde ref.
        semanasAtraso: semanasAtraso, // El atraso numérico se basa en SEMANAS calculadas
        pagoSemanal: pagoSemanal,
        saldoRestante: saldoRestante, // Devolver el saldo RECALCULADO
        proximaFechaPago: proximaFechaPago,
        semanasPagadas: semanasPagadas
    };
}
// =============================================
// *** FIN DE LA CORRECCIÓN DE ESTADO ***
// =============================================


// =============================================
// LÓGICA DE SEGURIDAD, SESIÓN Y PERMISOS
// =============================================

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        if (currentUser) {
            alert("Sesión cerrada por inactividad.");
            auth.signOut();
        }
    }, 600000); // 10 minutos (10 * 60 * 1000 ms)
}

function setupSecurityListeners() {
    // Resetear en varias interacciones del usuario
    window.addEventListener('load', resetInactivityTimer);
    document.addEventListener('mousemove', resetInactivityTimer);
    document.addEventListener('keypress', resetInactivityTimer);
    document.addEventListener('click', resetInactivityTimer);
    document.addEventListener('touchstart', resetInactivityTimer);
    document.addEventListener('scroll', resetInactivityTimer); // Añadir scroll

    // Cancelar operaciones en progreso al intentar cerrar/recargar
    window.addEventListener('beforeunload', (event) => {
        if (cargaEnProgreso) {
            cancelarCarga();
            // event.returnValue = 'Hay una operación en progreso. ¿Seguro que quieres salir?'; // Descomentar si se quiere advertencia
        }
    });
}

/**
 * Muestra/oculta elementos del menú y ajusta filtros según el rol y oficina del usuario.
 * @param {string} role El rol del usuario (ej. 'Administrador', 'Gerencia', 'Área comercial').
 */
function aplicarPermisosUI(role) {
    if (!currentUserData) {
        console.warn("aplicarPermisosUI llamada sin currentUserData");
        document.querySelectorAll('.menu-card').forEach(card => card.style.display = 'none');
        return;
    }
    // 1. Definir permisos del menú
    const permisosMenu = {
        'Super Admin': ['all'],
        'Gerencia': ['all'],
        'Administrador': [
            'view-gestion-clientes', 'view-cliente', 'view-colocacion', 'view-cobranza',
            'view-pago-grupo', 'view-reportes', 'view-reportes-avanzados',
            'view-usuarios', 'view-importar', 'view-configuracion',
            'view-gestion-efectivo'
        ],
        'Área comercial': [
            'view-gestion-clientes',
            'view-cliente',
            'view-colocacion',
            'view-cobranza',
            'view-pago-grupo',
            'view-registrar-gasto' // <-- AÑADIDO
        ],
        'default': []
    };

    // Mapeo (admin -> Administrador)
    const userRoleKey = role === 'admin' ? 'Administrador' : role;
    const userPerms = permisosMenu[userRoleKey] || permisosMenu['default'];

    // Ocultar/Mostrar ítems del Menú Principal
    document.querySelectorAll('.menu-card').forEach(card => {
        const view = card.getAttribute('data-view');
        // Mostrar si tiene 'all' o la vista específica está en sus permisos
        if (userPerms.includes('all') || userPerms.includes(view)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });

    // 2. Ajustar filtros y UI basados en la OFICINA del usuario
    const userOffice = currentUserData.office;
    const filtrosOffice = [
        '#sucursal_filtro', '#sucursal_filtro_reporte', '#grafico_sucursal',
        '#office_cliente', '#nueva-poblacion-sucursal', '#nueva-ruta-sucursal',
        '#filtro-sucursal-usuario',
        '#nuevo-sucursal'
    ];

    const esAdminConAccesoTotal = (userRoleKey === 'Super Admin' || userRoleKey === 'Gerencia');
    if (userOffice && userOffice !== 'AMBAS' && !esAdminConAccesoTotal) {
        filtrosOffice.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) {
                el.value = userOffice;
                el.disabled = true;
            }
        });
        _actualizarDropdownGrupo('grupo_filtro', userOffice, 'Todos');
        _actualizarDropdownGrupo('grupo_filtro_reporte', userOffice, 'Todos');
        _actualizarDropdownGrupo('grafico_grupo', userOffice, 'Todos');
    } else {
        filtrosOffice.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) {
                el.disabled = false;
                if (esAdminConAccesoTotal && userOffice && userOffice !== 'AMBAS') {
                    if (el.value !== userOffice) {
                        el.value = userOffice;
                        if (el.id === 'sucursal_filtro') _actualizarDropdownGrupo('grupo_filtro', userOffice, 'Todos');
                        if (el.id === 'sucursal_filtro_reporte') _actualizarDropdownGrupo('grupo_filtro_reporte', userOffice, 'Todos');
                        if (el.id === 'grafico_sucursal') _actualizarDropdownGrupo('grafico_grupo', userOffice, 'Todos');
                        if (el.id === 'office_cliente') handleOfficeChangeForClientForm.call(el);
                        if (el.id === 'nuevo-sucursal') _cargarRutasParaUsuario(userOffice);
                    }
                } else if (!userOffice || userOffice === 'AMBAS') {
                     if (!['office_cliente', 'nueva-poblacion-sucursal', 'nueva-ruta-sucursal', 'nuevo-sucursal'].includes(el.id)) {
                          if (el.value !== '') {
                              el.value = '';
                              if (el.id === 'sucursal_filtro') _actualizarDropdownGrupo('grupo_filtro', '', 'Todos');
                              if (el.id === 'sucursal_filtro_reporte') _actualizarDropdownGrupo('grupo_filtro_reporte', '', 'Todos');
                              if (el.id === 'grafico_sucursal') _actualizarDropdownGrupo('grafico_grupo', '', 'Todos');
                          }
                     }
                }
            }
        });
         if (!userOffice || userOffice === 'AMBAS') {
            _actualizarDropdownGrupo('grupo_filtro', '', 'Todos');
            _actualizarDropdownGrupo('grupo_filtro_reporte', '', 'Todos');
            _actualizarDropdownGrupo('grafico_grupo', '', 'Todos');
         }
    }

    // 3. Ajustar UI específica (ej. CURP editable)
    const curpInput = document.getElementById('curp_cliente');
    if (curpInput) {
        const puedeEditarCURP = ['Super Admin', 'Gerencia', 'Administrador'].includes(userRoleKey);
        curpInput.readOnly = !puedeEditarCURP;
        const curpFieldNote = curpInput.closest('.form-group')?.querySelector('.field-note');
        if (curpFieldNote) {
            curpFieldNote.style.display = puedeEditarCURP ? 'block' : 'none';
        }
    }

    const btnExportarTelefonos = document.getElementById('btn-exportar-telefonos');
    if (btnExportarTelefonos) {
        const puedeExportar = ['Super Admin', 'Gerencia'].includes(userRoleKey);
        btnExportarTelefonos.classList.toggle('hidden', !puedeExportar);
    }
}


// =============================================
// FUNCIONES MOVIDAS ANTES DE DOMContentLoaded
// =============================================

// --- Funciones de Gestión de Clientes --- //
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
    showButtonLoading('#btn-aplicar-filtros', true, 'Buscando...');
    showFixedProgress(10, 'Iniciando búsqueda...');

    try {
        const esAdminConAccesoTotal = (currentUserData?.role === 'Super Admin' || currentUserData?.role === 'Gerencia');
        const oficinaSeleccionada = document.getElementById('sucursal_filtro')?.value || '';
        const filtros = {
            office: oficinaSeleccionada,
            curp: document.getElementById('curp_filtro')?.value?.trim() || '',
            nombre: document.getElementById('nombre_filtro')?.value?.trim() || '',
            idCredito: document.getElementById('id_credito_filtro')?.value?.trim() || '',
            estado: document.getElementById('estado_credito_filtro')?.value || '',
            curpAval: document.getElementById('curp_aval_filtro')?.value?.trim() || '',
            plazo: document.getElementById('plazo_filtro')?.value || '',
            grupo: document.getElementById('grupo_filtro')?.value || '',
            userOffice: esAdminConAccesoTotal ? null : currentUserData?.office,
            soloComisionistas: document.getElementById('comisionista_filtro')?.checked || false
        };

        const hayFiltros = Object.values(filtros).some((val, key) => val && val.trim() !== '' && key !== 'userOffice');
        if (!hayFiltros) {
            tbody.innerHTML = '<tr><td colspan="6">Por favor, especifica al menos un criterio de búsqueda.</td></tr>';
            throw new Error("Búsqueda vacía");
        }

        let creditosAMostrar = [];
        const clientesMap = new Map(); // Cache para client data
        showFixedProgress(25, 'Obteniendo datos base...');

        if (filtros.idCredito) {
            // --- PATH 1: Search by Credit ID (Historical ID) ---
            creditosAMostrar = await database.buscarCreditosPorHistoricalId(filtros.idCredito, { userOffice: filtros.userOffice, office: filtros.office });
        } else if (filtros.curp || filtros.nombre || filtros.grupo || filtros.office) {
            // --- PATH 2: Search by Client Filters ---
            const clientesIniciales = await database.buscarClientes(filtros); // filtros ya incluye userSucursal
                let clientesFiltrados = clientesIniciales;
            if (filtros.soloComisionistas) {
            clientesFiltrados = clientesIniciales.filter(c => c.isComisionista === true);
        }

            if (operationId !== currentSearchOperation) throw new Error("Búsqueda cancelada");
            if (clientesFiltrados.length === 0) throw new Error("No se encontraron clientes.");

        showFixedProgress(40, `Buscando créditos para ${clientesFiltrados.length} clientes...`);

        let progress = 40;
        for (const [index, cliente] of clientesFiltrados.entries()) {
            if (operationId !== currentSearchOperation) throw new Error("Búsqueda cancelada");
            clientesMap.set(cliente.curp, cliente);
                const creditosDelCliente = await database.buscarCreditosPorCliente(cliente.curp);
                creditosAMostrar.push(...creditosDelCliente);
                progress = 40 + Math.round((index / clientesFiltrados.length) * 30);
            showFixedProgress(progress, `Revisando cliente ${index + 1} de ${clientesFiltrados.length}`);
        }
            
        } else if (filtros.curpAval || filtros.plazo || filtros.estado) {
            // --- PATH 3: Search by Credit-Only Filters ---
            showFixedProgress(40, `Buscando créditos por filtros...`);
            creditosAMostrar = await database.buscarCreditos(filtros);
        } else {
            tbody.innerHTML = '<tr><td colspan="6">Combinación de filtros no soportada o vacía.</td></tr>';
            throw new Error("Filtros inválidos");
        }

        if (operationId !== currentSearchOperation) throw new Error("Búsqueda cancelada");
        if (creditosAMostrar.length === 0) throw new Error("No se encontraron créditos que coincidan con los filtros iniciales.");

        showFixedProgress(70, `Procesando ${creditosAMostrar.length} créditos...`);
        tbody.innerHTML = '';
        let resultadosEncontrados = 0;
        let creditosProcesados = 0;

        creditosAMostrar.sort((a, b) => (parsearFecha(b.fechaCreacion)?.getTime() || 0) - (parsearFecha(a.fechaCreacion)?.getTime() || 0));

        for (const credito of creditosAMostrar) {
            if (operationId !== currentSearchOperation) throw new Error("Búsqueda cancelada");

            creditosProcesados++;
            const progress = 70 + Math.round((creditosProcesados / creditosAMostrar.length) * 30);
            showFixedProgress(progress, `Procesando crédito ${creditosProcesados} de ${creditosAMostrar.length}...`);

            // 1. Get Client Data
            let cliente = clientesMap.get(credito.curpCliente);
            if (!cliente) {
                cliente = await database.buscarClientePorCURP(credito.curpCliente, filtros.userOffice); // Aplicar filtro sucursal aquí también
                if (cliente) {
                    clientesMap.set(cliente.curp, cliente);
                } else {
                    cliente = { id: null, nombre: 'Cliente no encontrado', curp: credito.curpCliente, poblacion_grupo: credito.poblacion_grupo || 'N/A', office: credito.office || 'N/A', isComisionista: false };
                    console.warn(`No se encontró cliente para CURP ${credito.curpCliente} asociado al crédito ID Firestore ${credito.id}`);
                }
            }

            // 2. Get Payments & Calculate Status
            const historicalId = credito.historicalIdCredito || credito.id;
            const pagos = await database.getPagosPorCredito(historicalId, credito.office);
            pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0));
            const ultimoPago = pagos.length > 0 ? pagos[0] : null;

            const estadoCalculado = _calcularEstadoCredito(credito, pagos);

            if (!estadoCalculado) {
                console.warn(`No se pudo calcular el estado para el crédito ID Firestore ${credito.id} (Histórico: ${historicalId})`);
                continue;
            }

            // 3. Apply secondary filters
            if (filtros.estado && estadoCalculado.estado !== filtros.estado) continue;
            if (filtros.plazo && credito.plazo != filtros.plazo) continue;
            if (filtros.curpAval && (!credito.curpAval || !credito.curpAval.toUpperCase().includes(filtros.curpAval.toUpperCase()))) continue;
            if (filtros.office && cliente.office !== filtros.office) continue;
            if (filtros.grupo && cliente.poblacion_grupo !== filtros.grupo) continue;
            if (filtros.curp && !filtros.curp.includes(',') && cliente.curp !== filtros.curp.toUpperCase()) continue;
            if (filtros.nombre && !(cliente.nombre || '').toLowerCase().includes(filtros.nombre.toLowerCase())) continue;

            resultadosEncontrados++;

            // --- Build the Row ---
            const fechaInicioCredito = formatDateForDisplay(parsearFecha(credito.fechaCreacion));
            const fechaUltimoPago = formatDateForDisplay(ultimoPago ? parsearFecha(ultimoPago.fecha) : null);
            const comisionistaBadge = cliente.isComisionista ? '<span class="comisionista-badge-cliente" title="Comisionista">★</span>' : '';
            const estadoClase = `status-${estadoCalculado.estado.replace(/\s/g, '-')}`;
            const estadoHTML = `<span class="info-value ${estadoClase}">${estadoCalculado.estado.toUpperCase()}</span>`;
            const semanasPagadas = estadoCalculado.semanasPagadas || 0;
            const saldoRestante = estadoCalculado.saldoRestante;
            const infoCreditoHTML = `
                <div class="credito-info">
                    <div class="info-grid">
                        <div class="info-item"><span class="info-label">ID Crédito (Hist):</span><span class="info-value">${historicalId}</span></div>
                        <div class="info-item"><span class="info-label">Estado:</span>${estadoHTML}</div>
                        <div class="info-item"><span class="info-label">Saldo Actual:</span><span class="info-value">$${saldoRestante.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                        <div class="info-item"><span class="info-label">Semanas Pagadas:</span><span class="info-value">${semanasPagadas} de ${credito.plazo || '?'}</span></div>
                        ${estadoCalculado.semanasAtraso > 0 ? `<div class="info-item"><span class="info-label">Semanas Atraso:</span><span class="info-value">${estadoCalculado.semanasAtraso}</span></div>` : ''}
                        <div class="info-item"><span class="info-label">Último Pago:</span><span class="info-value">${fechaUltimoPago}</span></div>
                        <div class="info-item"><span class="info-label">Nombre Aval:</span><span class="info-value">${credito.nombreAval || 'N/A'}</span></div>
                         <div class="info-item"><span class="info-label">CURP Aval:</span><span class="info-value">${credito.curpAval || 'N/A'}</span></div>
                    </div>
                    <button class="btn btn-sm btn-info" onclick="mostrarHistorialPagos('${historicalId}', '${credito.office}')" style="width: 100%; margin-top: 10px;">
                        <i class="fas fa-receipt"></i> Ver Historial de Pagos (${pagos.length})
                    </button>
                </div>`;

            const clienteJsonString = JSON.stringify(cliente).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

            const rowHTML = `
                <tr>
                    <td><b>${cliente.office || 'N/A'}</b><br><small>Inicio Créd.: ${fechaInicioCredito}</small></td>
                    <td>${cliente.curp}</td>
                    <td>${cliente.nombre} ${comisionistaBadge}</td>
                    <td>${cliente.poblacion_grupo}</td>
                    <td>${infoCreditoHTML}</td>
                    <td class="action-buttons">
                        ${cliente.id ? `<button class="btn btn-sm btn-info" onclick='editCliente(${clienteJsonString})' title="Editar Cliente"><i class="fas fa-edit"></i></button>` : ''}
                        ${cliente.id ? `<button class="btn btn-sm btn-danger" onclick="deleteCliente('${cliente.id}', '${cliente.nombre}')" title="Eliminar Cliente"><i class="fas fa-trash"></i></button>` : ''}
                        </td>
                </tr>`;
            tbody.insertAdjacentHTML('beforeend', rowHTML);
        }

        if (resultadosEncontrados === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No se encontraron créditos que coincidan con todos los criterios de filtro aplicados.</td></tr>';
        }

        showFixedProgress(100, `Búsqueda completada: ${resultadosEncontrados} resultados encontrados.`);

    } catch (error) {
        if (error.message === "Búsqueda cancelada") {
            tbody.innerHTML = '<tr><td colspan="6">Búsqueda cancelada por el usuario.</td></tr>';
            showStatus('status_gestion_clientes', 'Búsqueda cancelada.', 'info');
        } else if (error.message === "Búsqueda vacía" || error.message === "Filtros inválidos") {
            tbody.innerHTML = '<tr><td colspan="6">Por favor, especifica al menos un criterio de búsqueda válido.</td></tr>';
            showStatus('status_gestion_clientes', 'Especifica filtros para buscar.', 'warning');
        } else if (error.message === "No se encontraron clientes.") {
            tbody.innerHTML = '<tr><td colspan="6">No se encontraron clientes que coincidan con los filtros iniciales.</td></tr>';
            showStatus('status_gestion_clientes', 'No se encontraron clientes.', 'info');
        } else if (error.message === "No se encontraron créditos que coincidan con los filtros iniciales.") {
            tbody.innerHTML = '<tr><td colspan="6">No se encontraron créditos para los clientes/filtros especificados.</td></tr>';
            showStatus('status_gestion_clientes', 'No se encontraron créditos asociados.', 'info');
        } else {
            console.error('Error en loadClientesTable:', error);
            tbody.innerHTML = `<tr><td colspan="6">Error al cargar los datos: ${error.message}. Revisa la consola para más detalles.</td></tr>`;
            showStatus('status_gestion_clientes', `Error: ${error.message}`, 'error');
        }
    } finally {
        if (operationId === currentSearchOperation) {
            cargaEnProgreso = false;
            showButtonLoading('#btn-aplicar-filtros', false);
            setTimeout(hideFixedProgress, 2000);
        }
    }
}

//**INICIALIZAR VISTA GESTION DE CLIENTES**//
function inicializarVistaGestionClientes() {
    const tbody = document.getElementById('tabla-clientes');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6">Utiliza los filtros para buscar y mostrar clientes/créditos.</td></tr>`;
    }
}

function limpiarFiltrosClientes() {
    if (cargaEnProgreso) {
        cancelarCarga();
    }
    const filtrosGrid = document.getElementById('filtros-grid');
    if (filtrosGrid) {
        filtrosGrid.querySelectorAll('input, select').forEach(el => {
            if (!el.disabled) {
                el.value = '';
            }
        });
    }
    inicializarVistaGestionClientes();
    showStatus('status_gestion_clientes', 'Filtros limpiados. Ingresa nuevos criterios para buscar.', 'info');
}

// --- Inicializar Reportes Avanzados ---
function inicializarVistaReportesAvanzados() {
    const tbody = document.getElementById('tabla-reportes_avanzados');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="10">Aplica los filtros para generar el reporte.</td></tr>';
    }
    const hoy = new Date();
    const haceUnMes = new Date(hoy.getFullYear(), hoy.getMonth() - 1, hoy.getDate() + 1);
    const hoyISO = hoy.toISOString().split('T')[0];
    const haceUnMesISO = haceUnMes.toISOString().split('T')[0];

    const fechaInicio = document.getElementById('fecha_inicio_reporte');
    const fechaFin = document.getElementById('fecha_fin_reporte');

    if (fechaInicio) fechaInicio.value = haceUnMesISO;
    if (fechaFin) fechaFin.value = hoyISO;

    reportData = null;
    const estadisticasElement = document.getElementById('estadisticas-reporte');
    if (estadisticasElement) estadisticasElement.innerHTML = '';
    showStatus('status_reportes_avanzados', 'Filtros inicializados. Presiona "Generar Reporte".', 'info');
}

function limpiarFiltrosReportes() {
    if (cargaEnProgreso) {
        cancelarCarga();
    }
    const filtrosContainer = document.getElementById('filtros-reportes-avanzados');
    if (filtrosContainer) {
        filtrosContainer.querySelectorAll('input, select').forEach(el => {
            if (el.type !== 'date' && !el.disabled) { // No limpiar sucursal si está deshabilitada
                el.value = '';
            }
        });
    }
    inicializarVistaReportesAvanzados();
    showStatus('status_reportes_avanzados', 'Filtros limpiados. Selecciona nuevos criterios y genera el reporte.', 'info');
}

async function loadAdvancedReports() {
    if (cargaEnProgreso) {
        showStatus('status_reportes_avanzados', 'Ya hay una generación de reporte en progreso. Espera a que termine.', 'warning');
        return;
    }
    cargaEnProgreso = true;
    currentSearchOperation = Date.now();
    const operationId = currentSearchOperation;

    showProcessingOverlay(true, 'Generando reporte avanzado...');
    showButtonLoading('#btn-aplicar-filtros-reportes', true, 'Generando...');
    showFixedProgress(20, 'Recopilando filtros...');
    const statusReportes = document.getElementById('status_reportes_avanzados');
    statusReportes.innerHTML = 'Aplicando filtros y buscando datos...';
    statusReportes.className = 'status-message status-info';
    document.getElementById('tabla-reportes_avanzados').innerHTML = '<tr><td colspan="10">Generando reporte...</td></tr>';
    document.getElementById('estadisticas-reporte').innerHTML = '';
    reportData = null;

    try {
        const filtros = {
            office: document.getElementById('sucursal_filtro_reporte')?.value || '',
            grupo: document.getElementById('grupo_filtro_reporte')?.value || '',
            ruta: document.getElementById('ruta_filtro_reporte')?.value || '',
            tipoCredito: document.getElementById('tipo_credito_filtro_reporte')?.value || '',
            estadoCredito: document.getElementById('estado_credito_filtro_reporte')?.value || '',
            tipoPago: document.getElementById('tipo_pago_filtro_reporte')?.value || '',
            fechaInicio: document.getElementById('fecha_inicio_reporte')?.value || '',
            fechaFin: document.getElementById('fecha_fin_reporte')?.value || '',
            curpCliente: document.getElementById('curp_filtro_reporte')?.value.trim().toUpperCase() || '',
            idCredito: document.getElementById('id_credito_filtro_reporte')?.value.trim() || '',
            userOffice: currentUserData?.office // <-- APLICAR SEGREGACIÓN
        };

        if (filtros.fechaInicio && filtros.fechaFin && new Date(filtros.fechaInicio) > new Date(filtros.fechaFin)) {
            throw new Error("La fecha de inicio no puede ser posterior a la fecha de fin.");
        }

        showFixedProgress(50, 'Consultando base de datos...');
        const data = await database.generarReporteAvanzado(filtros); // Pasa todos los filtros, incl. userSucursal

        if (operationId !== currentSearchOperation) throw new Error("Búsqueda cancelada");

        reportData = data;

        showFixedProgress(80, 'Mostrando resultados...');
        mostrarReporteAvanzado(reportData);
        showFixedProgress(100, 'Reporte generado');

        showStatus('status_reportes_avanzados', `Reporte generado: ${reportData.length} registros encontrados.`, 'success');

    } catch (error) {
        if (error.message === "Búsqueda cancelada") {
            showStatus('status_reportes_avanzados', 'Generación de reporte cancelada.', 'warning');
            document.getElementById('tabla-reportes_avanzados').innerHTML = '<tr><td colspan="10">Generación cancelada.</td></tr>';
        } else {
            console.error('Error generando reporte avanzado:', error);
            showStatus('status_reportes_avanzados', `Error al generar el reporte: ${error.message}`, 'error');
            document.getElementById('tabla-reportes_avanzados').innerHTML = `<tr><td colspan="10">Error: ${error.message}</td></tr>`;
        }
        hideFixedProgress();
    } finally {
        if (operationId === currentSearchOperation) {
            cargaEnProgreso = false;
            showProcessingOverlay(false);
            showButtonLoading('#btn-aplicar-filtros-reportes', false);
            setTimeout(hideFixedProgress, 2000);
        }
    }
}

function mostrarReporteAvanzado(data) {
    const tbody = document.getElementById('tabla-reportes_avanzados');
    const estadisticasElement = document.getElementById('estadisticas-reporte');
    if (!tbody || !estadisticasElement) return;

    tbody.innerHTML = '';
    estadisticasElement.innerHTML = '';

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
            rowContent = `<td>CLIENTE</td><td>${item.curp || ''}</td><td>${item.nombre || ''}</td><td>${item.poblacion_grupo || ''}</td><td>${item.ruta || ''}</td><td>${item.office || ''}</td><td>${fechaRegistro}</td><td>Registro</td><td>-</td><td>-</td>`;
        } else if (item.tipo === 'credito') {
            rowContent = `<td>CRÉDITO</td><td>${item.curpCliente || ''}</td><td>${item.nombreCliente || ''}</td><td>${item.poblacion_grupo || ''}</td><td>${item.ruta || ''}</td><td>${item.office || ''}</td><td>${fechaCreacion}</td><td>${item.tipo || 'Colocación'}</td><td>$${(item.monto || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>$${(item.saldo !== undefined ? item.saldo : 'N/A').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`;
        } else if (item.tipo === 'pago') {
            rowContent = `<td>PAGO</td><td>${item.curpCliente || ''}</td><td>${item.nombreCliente || ''}</td><td>${item.poblacion_grupo || ''}</td><td>${item.ruta || ''}</td><td>${item.office || ''}</td><td>${fechaPago}</td><td>${item.tipoPago || 'Pago'}</td><td>$${(item.monto || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>$${(item.saldoDespues !== undefined ? item.saldoDespues : 'N/A').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`;
        }
        tr.innerHTML = rowContent;
        tbody.appendChild(tr);
    });

    const totalRegistros = data.length;
    const totalClientes = new Set(data.filter(item => item.tipo === 'cliente').map(item => item.curp)).size;
    const totalCreditos = new Set(data.filter(item => item.tipo === 'credito').map(item => item.historicalIdCredito || item.id)).size;
    const totalPagos = data.filter(item => item.tipo === 'pago').length;
    const totalMontoPagos = data.filter(item => item.tipo === 'pago').reduce((sum, item) => sum + (item.monto || 0), 0);
    const totalMontoColocado = data.filter(item => item.tipo === 'credito').reduce((sum, item) => sum + (item.monto || 0), 0);

    estadisticasElement.innerHTML = `
        <div class="status-message status-info">
            <strong>Resumen del Reporte:</strong><br>
            Registros Totales: ${totalRegistros} |
            Clientes Únicos (en reporte): ${totalClientes} |
            Créditos Únicos (en reporte): ${totalCreditos} |
            Total Pagos: ${totalPagos} |
            Monto Total Pagado: $${totalMontoPagos.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} |
             Monto Total Colocado (en reporte): $${totalMontoColocado.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
    `;
}

function exportToCSV() {
    if (!reportData || reportData.length === 0) {
        showStatus('status_reportes_avanzados', 'No hay datos para exportar. Genera un reporte primero.', 'warning');
        return;
    }

    showProcessingOverlay(true, 'Generando archivo CSV...');
    showButtonLoading('#btn-exportar-csv', true, 'Generando...');
    showFixedProgress(50, 'Preparando datos...');

    try {
        const headers = ['Tipo', 'CURP', 'Nombre', 'Grupo/Población', 'Ruta', 'Sucursal', 'Fecha', 'Tipo Operación', 'Monto', 'Saldo', 'ID Crédito (Hist)'];
        let csvContent = headers.join(',') + '\n';

        showFixedProgress(70, 'Convirtiendo datos a CSV...');
        reportData.forEach(item => {
            let row = [];
            const fechaRegistro = formatDateForDisplay(parsearFecha(item.fechaRegistro));
            const fechaCreacion = formatDateForDisplay(parsearFecha(item.fechaCreacion));
            const fechaPago = formatDateForDisplay(parsearFecha(item.fecha));
            const idCreditoMostrar = item.historicalIdCredito || item.idCredito || item.id || '';

            const escapeCSV = (field) => {
                if (field === undefined || field === null) return '';
                let str = String(field);
                if (str.includes('"') || str.includes(',') || str.includes('\n')) {
                    str = `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };

            if (item.tipo === 'cliente') {
                row = ['CLIENTE', escapeCSV(item.curp), escapeCSV(item.nombre), escapeCSV(item.poblacion_grupo), escapeCSV(item.ruta), escapeCSV(item.office), fechaRegistro, 'Registro', '', '', ''];
            } else if (item.tipo === 'credito') {
                row = ['CRÉDITO', escapeCSV(item.curpCliente), escapeCSV(item.nombreCliente), escapeCSV(item.poblacion_grupo), escapeCSV(item.ruta), escapeCSV(item.office), fechaCreacion, escapeCSV(item.tipo || 'Colocación'), item.monto || 0, item.saldo !== undefined ? item.saldo : '', escapeCSV(idCreditoMostrar)];
            } else if (item.tipo === 'pago') {
                row = ['PAGO', escapeCSV(item.curpCliente), escapeCSV(item.nombreCliente), escapeCSV(item.poblacion_grupo), escapeCSV(item.ruta), escapeCSV(item.office), fechaPago, escapeCSV(item.tipoPago || 'Pago'), item.monto || 0, item.saldoDespues !== undefined ? item.saldoDespues : '', escapeCSV(idCreditoMostrar)];
            }

            csvContent += row.join(',') + '\n';
        });

        showFixedProgress(90, 'Creando archivo descargable...');
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.setAttribute('download', `reporte_finzana_${timestamp}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } else {
            alert("Tu navegador no soporta la descarga directa. El archivo CSV podría abrirse en una nueva pestaña.");
            const url = URL.createObjectURL(blob);
            window.open(url);
        }

        showFixedProgress(100, 'Archivo CSV exportado');
        showStatus('status_reportes_avanzados', 'Archivo CSV exportado exitosamente.', 'success');
    } catch (error) {
        console.error('Error exportando CSV:', error);
        showStatus('status_reportes_avanzados', `Error al exportar CSV: ${error.message}`, 'error');
        hideFixedProgress();
    } finally {
        showProcessingOverlay(false);
        showButtonLoading('#btn-exportar-csv', false);
        setTimeout(hideFixedProgress, 2000);
    }
}

function exportToPDF() {
    if (!reportData || reportData.length === 0) {
        alert('No hay datos para exportar. Genera un reporte primero.');
        return;
    }

    showProcessingOverlay(true, 'Generando archivo PDF...');
    showButtonLoading('#btn-exportar-pdf', true, 'Generando...');
    showFixedProgress(30, 'Preparando contenido para PDF...');

    try {
        const tableElement = document.getElementById('tabla-reportes_avanzados');
        const titleElement = document.querySelector('#view-reportes-avanzados h2');
        const filtersElement = document.getElementById('filtros-reportes-avanzados');
        const statsElement = document.getElementById('estadisticas-reporte');

        if (!tableElement) {
            throw new Error('No se encontró la tabla del reporte para exportar.');
        }

        const contentForPdf = document.createElement('div');
        contentForPdf.style.padding = '20px';
        contentForPdf.style.fontFamily = 'Arial, sans-serif';
        contentForPdf.style.fontSize = '10px';

        if (titleElement) {
            const titleClone = titleElement.cloneNode(true);
            titleClone.style.textAlign = 'center';
            titleClone.style.marginBottom = '15px';
            contentForPdf.appendChild(titleClone);
        }

        if (filtersElement) {
            const filtersSummary = document.createElement('div');
            filtersSummary.style.marginBottom = '15px';
            filtersSummary.style.fontSize = '9px';
            filtersSummary.style.border = '1px solid #ccc';
            filtersSummary.style.padding = '10px';
            filtersSummary.innerHTML = '<strong>Filtros Aplicados:</strong><br>';
            filtersElement.querySelectorAll('input, select').forEach(el => {
                if (el.value && el.id) {
                    const label = filtersElement.querySelector(`label[for="${el.id}"]`)?.textContent || el.id;
                    filtersSummary.innerHTML += `${label}: ${el.selectedOptions ? el.selectedOptions[0].text : el.value}<br>`;
                }
            });
            contentForPdf.appendChild(filtersSummary);
        }

        if (statsElement) {
            const statsClone = statsElement.cloneNode(true);
            statsClone.style.marginBottom = '15px';
            statsClone.querySelector('div')?.classList.remove('status-message', 'status-info', 'status-success', 'status-warning', 'status-error');
            contentForPdf.appendChild(statsClone);
        }

        const tableClone = tableElement.cloneNode(true);
        const headers = tableClone.querySelector('thead tr');
        if (headers) {
            const th = document.createElement('th');
            th.textContent = 'ID Crédito (Hist)';
            headers.appendChild(th);
        }
        const rows = tableClone.querySelectorAll('tbody tr');
        rows.forEach((row, index) => {
            const item = reportData[index];
            const idCreditoMostrar = item.historicalIdCredito || item.idCredito || item.id || '';
            const td = document.createElement('td');
            td.textContent = idCreditoMostrar;
            row.appendChild(td);
        });

        tableClone.style.width = '100%';
        tableClone.style.borderCollapse = 'collapse';
        tableClone.querySelectorAll('th, td').forEach(cell => {
            cell.style.border = '1px solid #ddd';
            cell.style.padding = '4px 6px';
            cell.style.fontSize = '8px';
        });
        tableClone.querySelector('thead').style.backgroundColor = '#f2f2f2';
        contentForPdf.appendChild(tableClone);

        const opt = {
            margin: [1, 0.5, 1, 0.5],
            filename: `reporte_finzana_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'cm', format: 'a4', orientation: 'landscape' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        showFixedProgress(70, 'Generando PDF...');

        html2pdf().set(opt).from(contentForPdf).save()
            .then(() => {
                showFixedProgress(100, 'PDF generado');
                showStatus('status_reportes_avanzados', 'Archivo PDF exportado exitosamente.', 'success');
                showProcessingOverlay(false);
                showButtonLoading('#btn-exportar-pdf', false);
                setTimeout(hideFixedProgress, 2000);
            })
            .catch(error => {
                console.error('Error generando PDF con html2pdf:', error);
                throw new Error(`Error al generar PDF: ${error.message}`);
            });

    } catch (error) {
        console.error('Error preparando contenido para PDF:', error);
        showStatus('status_reportes_avanzados', `Error al exportar PDF: ${error.message}`, 'error');
        showProcessingOverlay(false);
        showButtonLoading('#btn-exportar-pdf', false);
        hideFixedProgress();
    }
}

// =============================================
// MANEJADORES DE EVENTOS ESPECÍFICOS
// =============================================
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const statusElement = document.getElementById('auth-status');
    const loginButton = e.target.querySelector('button[type="submit"]');

    showButtonLoading(loginButton, true, 'Iniciando...');
    statusElement.textContent = 'Iniciando sesión...';
    statusElement.className = 'status-message status-info';
    statusElement.classList.remove('hidden');

    try {
        await auth.signInWithEmailAndPassword(email, password);
        // El onAuthStateChanged se encargará de ocultar esto y mostrar la app
        // No es necesario re-habilitar el botón aquí, onAuthStateChanged lo hará si falla

    } catch (error) {
        console.error("Error de inicio de sesión:", error.code, error.message);
        let mensajeError = 'Error: Credenciales incorrectas o problema de conexión.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            mensajeError = 'Error: Correo electrónico o contraseña incorrectos.';
        } else if (error.code === 'auth/network-request-failed') {
            mensajeError = 'Error: No se pudo conectar al servidor. Verifica tu conexión a internet.';
        } else if (error.code === 'auth/too-many-requests') {
            mensajeError = 'Error: Demasiados intentos fallidos. Intenta más tarde.';
        }
        statusElement.textContent = mensajeError;
        statusElement.className = 'status-message status-error';
        showButtonLoading(loginButton, false); // Re-habilitar botón SÓLO si falla el login
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
    const activeSection = isGDL ? gdlSection : leonSection;
    if (activeSection) {
        activeSection.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
        activeSection.querySelectorAll('.import-tab-content').forEach(c => c.classList.add('hidden'));

        const clienteTab = activeSection.querySelector(`.import-tab[data-tab="clientes"]`);
        if (clienteTab) clienteTab.classList.add('active');

        const clienteContentId = `tab-${office.toLowerCase()}-clientes`;
        const clienteContent = document.getElementById(clienteContentId);
        if (clienteContent) clienteContent.classList.remove('hidden');
    }
    document.getElementById('resultado-importacion')?.classList.add('hidden');
    document.getElementById('estado-importacion').innerHTML = '';
    document.getElementById('detalle-importacion').innerHTML = '';
}


function handleTabClick() {
    const parentSection = this.closest('[id$="-section"]');
    if (!parentSection) return;

    parentSection.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
    this.classList.add('active');
    currentImportTab = this.getAttribute('data-tab');
    parentSection.querySelectorAll('.import-tab-content').forEach(c => c.classList.add('hidden'));

    const officePrefix = parentSection.id.includes('gdl') ? 'gdl' : 'leon';
    const targetTabContentId = `tab-${officePrefix}-${currentImportTab}`;
    const targetTabContent = document.getElementById(targetTabContentId);

    if (targetTabContent) {
        targetTabContent.classList.remove('hidden');
        const textareaId = `datos-importar-${officePrefix.toLowerCase()}-${currentImportTab}`;
        const textarea = document.getElementById(textareaId);
        if (textarea) textarea.value = '';
    }
    document.getElementById('resultado-importacion')?.classList.add('hidden');
    document.getElementById('estado-importacion').innerHTML = '';
    document.getElementById('detalle-importacion').innerHTML = '';
}

// EN app.js - AÑADIR NUEVA FUNCIÓN

/**
 * Maneja los clics en los botones dentro de las listas de configuración.
 */
async function handleConfigListClick(e) {
    const button = e.target.closest('button'); // Encuentra el botón clickeado
    if (!button) return; // No se hizo clic en un botón

    const id = button.getAttribute('data-id');
    const nombre = button.getAttribute('data-nombre'); // Para confirmación/logs
    const tipo = button.getAttribute('data-tipo'); // 'poblacion' o 'ruta' (solo en eliminar)
    const listItem = button.closest('.config-list-item');
    const inputNombreRuta = listItem?.querySelector('.ruta-nombre-editable');

    // --- Botón Eliminar ---
    if (button.classList.contains('btn-eliminar-config')) {
        const tipoItem = button.getAttribute('data-tipo'); // 'poblacion' o 'ruta'
        const nombreItem = button.getAttribute('data-nombre');
        handleEliminarConfig(tipoItem, id, nombreItem); // Llama a la función existente
    }
    // --- Botón Editar Ruta (Nombre) ---
    else if (button.classList.contains('btn-editar-ruta')) {
         if (!inputNombreRuta) return;
         inputNombreRuta.readOnly = false;
         inputNombreRuta.style.border = '1px solid #ccc';
         inputNombreRuta.style.background = '#fff';
         inputNombreRuta.focus();
         // Ocultar Editar, Mostrar Guardar/Cancelar
         button.classList.add('hidden');
         listItem.querySelector('.btn-guardar-ruta')?.classList.remove('hidden');
         listItem.querySelector('.btn-cancelar-ruta')?.classList.remove('hidden');
    }
    // --- Botón Cancelar Ruta (Nombre) ---
    else if (button.classList.contains('btn-cancelar-ruta')) {
        if (!inputNombreRuta) return;
        inputNombreRuta.value = button.getAttribute('data-original-nombre'); // Restaurar valor
        inputNombreRuta.readOnly = true;
        inputNombreRuta.style.border = 'none';
        inputNombreRuta.style.background = 'transparent';
        // Ocultar Guardar/Cancelar, Mostrar Editar
        button.classList.add('hidden');
        listItem.querySelector('.btn-guardar-ruta')?.classList.add('hidden');
        listItem.querySelector('.btn-editar-ruta')?.classList.remove('hidden');
    }
    // --- Botón Guardar Ruta (Nombre) ---
    else if (button.classList.contains('btn-guardar-ruta')) {
        if (!inputNombreRuta) return;
        const nuevoNombre = inputNombreRuta.value.trim();
        const originalNombre = listItem.querySelector('.btn-cancelar-ruta')?.getAttribute('data-original-nombre');

        if (!nuevoNombre) {
            showStatus('status_configuracion', 'El nombre de la ruta no puede estar vacío.', 'warning');
            return;
        }
        if (nuevoNombre.toUpperCase() === originalNombre.toUpperCase()) {
             // Si no cambió, solo cancelar la edición
             listItem.querySelector('.btn-cancelar-ruta')?.click(); // Simular clic en cancelar
             return;
        }

        showProcessingOverlay(true, 'Actualizando nombre de ruta...');
        const resultado = await database.actualizarNombreRuta(id, nuevoNombre);
        showProcessingOverlay(false);

        if (resultado.success) {
             showStatus('status_configuracion', resultado.message, 'success');
             // Actualizar UI sin recargar todo (mejor experiencia)
             inputNombreRuta.readOnly = true;
             inputNombreRuta.style.border = 'none';
             inputNombreRuta.style.background = 'transparent';
             listItem.querySelector('.btn-cancelar-ruta')?.setAttribute('data-original-nombre', nuevoNombre.toUpperCase()); // Actualizar original
             button.classList.add('hidden'); // Ocultar Guardar
             listItem.querySelector('.btn-cancelar-ruta')?.classList.add('hidden');
             listItem.querySelector('.btn-editar-ruta')?.classList.remove('hidden');
             // Podríamos necesitar actualizar dropdowns en otras partes si el nombre cambió
             await inicializarDropdowns(); // Recargar todos los dropdowns
        } else {
             showStatus('status_configuracion', `Error: ${resultado.message}`, 'error');
        }
    }
    // --- Botón Editar Población (Asignar Ruta) ---
    else if (button.classList.contains('btn-editar-poblacion')) {
        const poblacionId = id;
        const poblacionNombre = button.getAttribute('data-nombre');
        const poblacionOffice = button.getAttribute('data-office');
        const rutaActual = button.getAttribute('data-ruta') || '';

        // Obtener rutas disponibles para ESA oficina
        const rutasDisponibles = await database.obtenerRutas(poblacionOffice);
        const opcionesRutas = rutasDisponibles.map(r => r.nombre).sort();

        // Crear HTML para el modal o prompt
        let selectHTML = `<label for="ruta-poblacion-select">Selecciona la nueva ruta para <strong>${poblacionNombre}</strong> (${poblacionOffice}):</label><br>`;
        selectHTML += `<select id="ruta-poblacion-select" style="width: 100%; margin-top: 10px;">`;
        selectHTML += `<option value="">-- Sin asignar --</option>`; // Opción para quitar ruta
        opcionesRutas.forEach(rutaNombre => {
            selectHTML += `<option value="${rutaNombre}" ${rutaNombre === rutaActual ? 'selected' : ''}>${rutaNombre}</option>`;
        });
        selectHTML += `</select>`;
        selectHTML += `<br><br><button id="btn-confirmar-ruta-poblacion" class="btn btn-success">Guardar Cambio</button>`;

        // Mostrar en un modal (Asumiendo que tienes un modal genérico)
        document.getElementById('modal-title').textContent = 'Asignar Ruta a Población';
        document.getElementById('modal-body').innerHTML = selectHTML;
        document.getElementById('generic-modal').classList.remove('hidden');

        // Añadir listener al botón dentro del modal
         const btnConfirmar = document.getElementById('btn-confirmar-ruta-poblacion');
         if (btnConfirmar) {
            // Remover listener previo si existe
             btnConfirmar.replaceWith(btnConfirmar.cloneNode(true));
             document.getElementById('btn-confirmar-ruta-poblacion').addEventListener('click', async () => {
                 const nuevaRuta = document.getElementById('ruta-poblacion-select').value || null; // null si es '-- Sin asignar --'

                 showProcessingOverlay(true, 'Asignando ruta...');
                 const resultado = await database.asignarRutaAPoblacion(poblacionId, nuevaRuta);
                 showProcessingOverlay(false);
                 document.getElementById('generic-modal').classList.add('hidden'); // Cerrar modal

                 if (resultado.success) {
                     showStatus('status_configuracion', resultado.message, 'success');
                     await loadConfiguracion(); // Recargar la lista para ver el cambio
                 } else {
                     showStatus('status_configuracion', `Error: ${resultado.message}`, 'error');
                 }
             });
         }
    }
}

/**
 * Carga todas las poblaciones en los dropdowns y los muestra
 */
async function handleCargarPoblaciones() {
    const statusEl = 'status_configuracion';
    
    showButtonLoading('#btn-cargar-poblaciones', true, 'Cargando...');
    
    try {
        const userOffice = currentUserData?.office;
        const esAdminTotal = (currentUserData?.role === 'Super Admin' || currentUserData?.role === 'Gerencia');
        
        let oficinaFiltro = '';
        if (esAdminTotal && (!userOffice || userOffice === 'AMBAS')) {
            oficinaFiltro = '';
        } else if (userOffice && userOffice !== 'AMBAS') {
            oficinaFiltro = userOffice;
        } else {
            showStatus(statusEl, 'No tienes permisos para cargar poblaciones.', 'error');
            return;
        }
        
        const poblaciones = await database.obtenerPoblaciones(oficinaFiltro);
        const nombresPoblaciones = [...new Set(poblaciones.map(p => p.nombre))].sort();
        
        if (document.getElementById('poblacion_grupo_cliente')) {
            popularDropdown('poblacion_grupo_cliente', nombresPoblaciones, 'Selecciona población/grupo');
        }
        
        if (document.getElementById('grupo_filtro')) {
            popularDropdown('grupo_filtro', nombresPoblaciones, 'Todos');
        }
        
        if (document.getElementById('grupo_filtro_reporte')) {
            popularDropdown('grupo_filtro_reporte', nombresPoblaciones, 'Todos');
        }
        
        if (document.getElementById('grafico_grupo')) {
            popularDropdown('grafico_grupo', nombresPoblaciones, 'Todos');
        }
        
        showStatus(statusEl, `Se cargaron ${nombresPoblaciones.length} poblaciones en todos los dropdowns.`, 'success');
        console.log('Poblaciones cargadas en dropdowns:', nombresPoblaciones);
        
    } catch (error) {
        console.error("Error cargando poblaciones:", error);
        showStatus(statusEl, `Error al cargar poblaciones: ${error.message}`, 'error');
    } finally {
        showButtonLoading('#btn-cargar-poblaciones', false);
    }
}

/**
 * Carga todas las rutas en los dropdowns y los muestra
 */
async function handleCargarRutas() {
    const statusEl = 'status_configuracion';
    
    showButtonLoading('#btn-cargar-rutas', true, 'Cargando...');
    
    try {
        const userOffice = currentUserData?.office;
        const esAdminTotal = (currentUserData?.role === 'Super Admin' || currentUserData?.role === 'Gerencia');
        
        let oficinaFiltro = '';
        if (esAdminTotal && (!userOffice || userOffice === 'AMBAS')) {
            oficinaFiltro = '';
        } else if (userOffice && userOffice !== 'AMBAS') {
            oficinaFiltro = userOffice;
        } else {
            showStatus(statusEl, 'No tienes permisos para cargar rutas.', 'error');
            return;
        }
        
        const rutas = await database.obtenerRutas(oficinaFiltro);
        const nombresRutas = [...new Set(rutas.map(r => r.nombre))].sort();
        
        if (document.getElementById('ruta_cliente')) {
            popularDropdown('ruta_cliente', nombresRutas, 'Selecciona una ruta');
        }
        
        if (document.getElementById('ruta_filtro_reporte')) {
            popularDropdown('ruta_filtro_reporte', nombresRutas, 'Todas');
        }
        
        if (document.getElementById('nuevo-ruta')) {
            popularDropdown('nuevo-ruta', nombresRutas, '-- Sin asignar --');
        }
        
        showStatus(statusEl, `Se cargaron ${nombresRutas.length} rutas en todos los dropdowns.`, 'success');
        console.log('Rutas cargadas en dropdowns:', nombresRutas);
        
    } catch (error) {
        console.error("Error cargando rutas:", error);
        showStatus(statusEl, `Error al cargar rutas: ${error.message}`, 'error');
    } finally {
        showButtonLoading('#btn-cargar-rutas', false);
    }
}

// =============================================
// *** NUEVAS FUNCIONES: EFECTIVO Y COMISIONES ***
// =============================================
/**
 * Carga la lista de agentes (Área Comercial) en los dropdowns de la vista Gestión Efectivo.
 * Se llama al mostrar la vista 'view-gestion-efectivo'.
 */
async function loadGestionEfectivo() {
    console.log("--- Ejecutando loadGestionEfectivo (Corregido) ---");
    const selectAgenteEntrega = document.getElementById('entrega-agente');
    const selectAgenteFiltro = document.getElementById('filtro-agente');
    const statusEntrega = document.getElementById('status_registrar_entrega');

    if (!selectAgenteEntrega || !selectAgenteFiltro) {
        console.error("loadGestionEfectivo: No se encontraron los dropdowns 'entrega-agente' o 'filtro-agente'.");
        return;
    }

    // Resetear vista
    selectAgenteEntrega.innerHTML = '<option value="">Cargando...</option>';
    selectAgenteFiltro.innerHTML = '<option value="">Cargando...</option>';
    document.getElementById('resultados-gestion-efectivo').classList.add('hidden');
    document.getElementById('tabla-movimientos-efectivo').innerHTML = '<tr><td colspan="5">Selecciona un agente y rango de fechas.</td></tr>';
    document.getElementById('form-registrar-entrega').reset();

    // Poner fechas por defecto
    const hoy = new Date();
    const haceUnMes = new Date(hoy.getFullYear(), hoy.getMonth() - 1, hoy.getDate() + 1);
    document.getElementById('filtro-fecha-inicio-efectivo').value = haceUnMes.toISOString().split('T')[0];
    document.getElementById('filtro-fecha-fin-efectivo').value = hoy.toISOString().split('T')[0];

    try {
        const resultado = await database.obtenerUsuarios();
        
        if (!resultado.success) {
            throw new Error(resultado.message || 'Error desconocido al obtener usuarios.');
        }

        let agentes = resultado.data || [];
        
        // --- INICIO DE LA CORRECCIÓN ---
        const adminOffice = currentUserData?.office;
        const adminRole = currentUserData?.role; // <-- Obtener el rol
        const esAdminConAccesoTotal = (adminRole === 'Super Admin' || adminRole === 'Gerencia'); // <-- Variable de permiso

        agentes = agentes.filter(u =>
            u.role === 'Área comercial' &&
            // <-- Lógica corregida que incluye a Super Admin/Gerencia
            (esAdminConAccesoTotal || adminOffice === 'AMBAS' || !adminOffice || u.office === u.office)
        );
        // --- FIN DE LA CORRECCIÓN ---

        agentes.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        // Poblar dropdowns
        if (agentes.length === 0) {
            const msg = (adminOffice && adminOffice !== 'AMBAS' && !esAdminConAccesoTotal) ? `No hay agentes para ${adminOffice}` : 'No hay agentes de Área Comercial';
            popularDropdown('entrega-agente', [], msg, true);
            popularDropdown('filtro-agente', [], msg, true);
        } else {
            const opciones = agentes.map(a => ({ value: a.id, text: `${a.name} (${a.office || 'Sin Oficina'})` }));
            popularDropdown('entrega-agente', opciones, 'Selecciona un agente', true);
            popularDropdown('filtro-agente', opciones, 'Selecciona un agente', true);
        }

        if (statusEntrega) showStatus(statusEntrega.id, 'Listo.', 'info');

    } catch (error) {
        console.error("Error cargando agentes para gestión efectivo:", error);
        if (statusEntrega) showStatus(statusEntrega.id, `Error cargando agentes: ${error.message}`, 'error');
        popularDropdown('entrega-agente', [], 'Error al cargar', true);
        popularDropdown('filtro-agente', [], 'Error al cargar', true);
    }
}

/**
 * Maneja el formulario para registrar una entrega de efectivo a un agente.
 */
async function handleRegistrarEntregaInicial(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const statusEl = document.getElementById('status_registrar_entrega');
    
    const agenteId = document.getElementById('entrega-agente').value;
    const monto = parseFloat(document.getElementById('entrega-monto').value);
    const descripcion = document.getElementById('entrega-descripcion').value || 'Entrega inicial de efectivo';
    
    // Obtener datos del agente seleccionado para guardar su oficina
    const agenteSelect = document.getElementById('entrega-agente');
    const agenteTexto = agenteSelect.options[agenteSelect.selectedIndex].text; // Ej: "Nombre Agente (GDL)"
    const officeAgente = agenteTexto.includes('(GDL)') ? 'GDL' : (agenteTexto.includes('(LEON)') ? 'LEON' : null);

    if (!agenteId || isNaN(monto) || monto <= 0 || !officeAgente) {
        showStatus(statusEl.id, 'Selecciona un agente válido, un monto positivo y asegúrate que el agente tenga oficina.', 'error');
        return;
    }

    showButtonLoading(btn, true, 'Registrando...');
    showStatus(statusEl.id, 'Registrando entrega...', 'info');

    try {
        const movimientoData = {
            userId: agenteId,
            fecha: new Date().toISOString(),
            tipo: 'ENTREGA_INICIAL',
            monto: monto, // Monto POSITIVO (entrada para el agente)
            descripcion: descripcion,
            registradoPor: currentUserData.email,
            office: officeAgente
        };

        const resultado = await database.agregarMovimientoEfectivo(movimientoData);
        if (!resultado.success) throw new Error(resultado.message);

        showStatus(statusEl.id, 'Entrega registrada exitosamente.', 'success');
        e.target.reset(); // Limpiar formulario de entrega
        
        // Si el agente filtrado es el mismo, recargar los movimientos
        if (document.getElementById('filtro-agente').value === agenteId) {
            handleBuscarMovimientos();
        }

    } catch (error) {
        console.error("Error registrando entrega:", error);
        showStatus(statusEl.id, `Error: ${error.message}`, 'error');
    } finally {
        showButtonLoading(btn, false);
    }
}

/**
 * Busca y muestra los movimientos y el balance del agente seleccionado.
 * CORREGIDO: Ahora pasa el filtro de 'office' del administrador a la consulta.
 */
async function handleBuscarMovimientos() {
    const btn = document.getElementById('btn-buscar-movimientos');
    const statusEl = 'status_registrar_entrega';
    const agenteId = document.getElementById('filtro-agente').value;
    const fechaInicio = document.getElementById('filtro-fecha-inicio-efectivo').value;
    const fechaFin = document.getElementById('filtro-fecha-fin-efectivo').value;
    
    const resultadosDiv = document.getElementById('resultados-gestion-efectivo');
    const tbody = document.getElementById('tabla-movimientos-efectivo');
    const balanceContainer = document.getElementById('balance-container');

    if (!agenteId) {
        showStatus(statusEl, 'Por favor, selecciona un agente para buscar.', 'warning');
        return;
    }
    
    showButtonLoading(btn, true, 'Buscando...');
    showStatus(statusEl, 'Buscando movimientos...', 'info');
    resultadosDiv.classList.add('hidden');
    tbody.innerHTML = '<tr><td colspan="5">Buscando...</td></tr>';
    
    // Resetear balance
    document.getElementById('balance-agente').textContent = '...';
    document.getElementById('balance-entregado').textContent = '...';
    document.getElementById('balance-gastos').textContent = '...';
    document.getElementById('balance-colocado').textContent = '...';
    document.getElementById('balance-final').textContent = '...';

    try {
        // --- INICIO DE LA CORRECCIÓN ---
        const adminOffice = currentUserData?.office;
        const esAdminTotal = (currentUserData?.role === 'Super Admin' || currentUserData?.role === 'Gerencia');
        
        const filtros = {
            userId: agenteId,
            fechaInicio: fechaInicio ? (fechaInicio + 'T00:00:00Z') : null,
            fechaFin: fechaFin ? (fechaFin + 'T23:59:59Z') : null,
            // Añadir el filtro de oficina del admin (si no es admin total)
            // 'null' significa que la función de DB no aplicará filtro de oficina
            office: (esAdminTotal || !adminOffice || adminOffice === 'AMBAS') ? null : adminOffice
        };
        // --- FIN DE LA CORRECCIÓN ---

        const movimientos = await database.getMovimientosEfectivo(filtros);

        if (movimientos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">No se encontraron movimientos para este agente en este rango de fechas.</td></tr>';
            showStatus(statusEl, 'No se encontraron movimientos.', 'info');
        } else {
            // El resto de la función (renderizado de tabla) es correcto
            tbody.innerHTML = movimientos.map(mov => `
                <tr style="color: ${mov.monto > 0 ? 'var(--success)' : 'var(--danger)'};">
                    <td>${formatDateForDisplay(parsearFecha(mov.fecha))}</td>
                    <td>${mov.tipo || 'N/A'}</td>
                    <td>$${(mov.monto || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>${mov.descripcion || 'N/A'}</td>
                    <td>${mov.registradoPor || 'N/A'}</td>
                </tr>
            `).join('');
            showStatus(statusEl, `Se encontraron ${movimientos.length} movimientos.`, 'success');
        }
        
        // El resto del cálculo de balance es correcto
        let totalEntregado = 0;
        let totalGastos = 0;
        let totalColocado = 0;
        
        movimientos.forEach(mov => {
            if (mov.tipo === 'ENTREGA_INICIAL') {
                totalEntregado += (mov.monto || 0);
            } else if (mov.tipo === 'GASTO') {
                totalGastos += (mov.monto || 0);
            } else if (mov.tipo === 'COLOCACION') {
                totalColocado += (mov.monto || 0);
            }
        });
        
        const balanceFinal = totalEntregado + totalGastos + totalColocado;

        const agenteSelect = document.getElementById('filtro-agente');
        document.getElementById('balance-agente').textContent = agenteSelect.options[agenteSelect.selectedIndex].text;
        document.getElementById('balance-entregado').textContent = `$${totalEntregado.toFixed(2)}`;
        document.getElementById('balance-gastos').textContent = `$${totalGastos.toFixed(2)}`;
        document.getElementById('balance-colocado').textContent = `$${totalColocado.toFixed(2)}`;
        document.getElementById('balance-final').textContent = `$${balanceFinal.toFixed(2)}`;
        document.getElementById('balance-final').style.color = balanceFinal >= 0 ? 'var(--success)' : 'var(--danger)';

        resultadosDiv.classList.remove('hidden');

    } catch (error) {
        console.error("Error buscando movimientos:", error);
        showStatus(statusEl, `Error: ${error.message}`, 'error');
        tbody.innerHTML = `<tr><td colspan="5">Error: ${error.message}</td></tr>`;
    } finally {
        showButtonLoading(btn, false);
    }
}

/**
 * Maneja el formulario para registrar un gasto (Área Comercial).
 */
async function handleRegistrarGasto(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const statusEl = document.getElementById('status_registrar_gasto');

    const monto = parseFloat(document.getElementById('gasto-monto').value);
    const descripcion = document.getElementById('gasto-descripcion').value.trim();
    const fechaInput = document.getElementById('gasto-fecha').value; // YYYY-MM-DD

    if (isNaN(monto) || monto <= 0 || !descripcion || !fechaInput) {
        showStatus(statusEl.id, 'Todos los campos son obligatorios y el monto debe ser positivo.', 'error');
        return;
    }

    // Convertir fecha YYYY-MM-DD a ISO String con hora
    const fechaGasto = new Date(fechaInput + 'T12:00:00Z').toISOString(); // Usar mediodía UTC

    showButtonLoading(btn, true, 'Guardando...');
    showStatus(statusEl.id, 'Registrando gasto...', 'info');

    try {
        const movimientoData = {
            userId: currentUserData.id, // ID del agente
            fecha: fechaGasto,
            tipo: 'GASTO',
            monto: -monto, // Monto NEGATIVO (salida)
            descripcion: descripcion,
            registradoPor: currentUserData.email,
            office: currentUserData.office
        };

        const resultado = await database.agregarMovimientoEfectivo(movimientoData);
        if (!resultado.success) throw new Error(resultado.message);

        let successMsg = 'Gasto registrado exitosamente.';
        if (!isOnline) successMsg += ' (Guardado localmente, se sincronizará).';
        showStatus(statusEl.id, successMsg, 'success');
        e.target.reset();

    } catch (error) {
        console.error("Error registrando gasto:", error);
        showStatus(statusEl.id, `Error: ${error.message}`, 'error');
    } finally {
        showButtonLoading(btn, false);
    }
}

//** IMPORTACIÓN DE DATOS **//
async function handleImport() {
    const office = document.getElementById('office-select').value;
    const textareaId = `datos-importar-${office.toLowerCase()}-${currentImportTab}`;
    const textarea = document.getElementById(textareaId);
    const resultadoImportacionDiv = document.getElementById('resultado-importacion');
    const estadoImportacionDiv = document.getElementById('estado-importacion');
    const detalleImportacionDiv = document.getElementById('detalle-importacion');

    if (!textarea) {
        showStatus('estado-importacion', 'Error interno: No se encontró el área de texto para importar.', 'error');
        resultadoImportacionDiv?.classList.remove('hidden');
        return;
    }
    const csvData = textarea.value;
    if (!csvData.trim()) {
        showStatus('estado-importacion', 'No hay datos en el área de texto para importar.', 'warning');
        resultadoImportacionDiv?.classList.remove('hidden');
        detalleImportacionDiv.innerHTML = '';
        return;
    }

    showProcessingOverlay(true, `Importando ${currentImportTab} para ${office}...`);
    showButtonLoading('#btn-procesar-importacion', true, 'Importando...');
    showFixedProgress(0, `Iniciando importación de ${currentImportTab}...`);
    estadoImportacionDiv.innerHTML = 'Procesando archivo CSV...';
    estadoImportacionDiv.className = 'status-message status-info';
    detalleImportacionDiv.innerHTML = '';
    resultadoImportacionDiv?.classList.remove('hidden');

    try {
        const resultado = await database.importarDatosDesdeCSV(csvData, currentImportTab, office);
        showFixedProgress(100, 'Importación completada');
        let mensaje = `<b>Importación (${office} - ${currentImportTab}) finalizada:</b> ${resultado.importados} registros importados de ${resultado.total} líneas procesadas.`;

        if (resultado.errores && resultado.errores.length > 0) {
            mensaje += `<br><b>Se encontraron ${resultado.errores.length} errores u omisiones.</b>`;
            if (detalleImportacionDiv) {
                const erroresMostrados = resultado.errores.slice(0, 50);
                detalleImportacionDiv.innerHTML = `<strong>Detalle de errores/omisiones (primeros ${erroresMostrados.length}):</strong><ul>${erroresMostrados.map(e => `<li>${e}</li>`).join('')}</ul>`;
                if (resultado.errores.length > 50) {
                    detalleImportacionDiv.innerHTML += `<p><i>(${resultado.errores.length - 50} errores más omitidos)</i></p>`;
                }
            }
            showStatus('estado-importacion', mensaje, resultado.importados > 0 ? 'warning' : 'error');
        } else {
            if (detalleImportacionDiv) detalleImportacionDiv.innerHTML = 'No se encontraron errores.';
            showStatus('estado-importacion', mensaje, 'success');
        }
        textarea.value = '';
    } catch (error) {
        console.error('Error crítico en handleImport:', error);
        showFixedProgress(100, 'Error en importación');
        showStatus('estado-importacion', `Error crítico durante la importación: ${error.message}`, 'error');
        if (detalleImportacionDiv) detalleImportacionDiv.innerHTML = `Detalles técnicos: ${error.stack || error}`;
    } finally {
        showProcessingOverlay(false);
        showButtonLoading('#btn-procesar-importacion', false);
        setTimeout(hideFixedProgress, 3000);
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

    // Volver a aplicar permisos de UI al resetear
    if (currentUserData) aplicarPermisosUI(currentUserData.role);

    const curpInput = document.getElementById('curp_cliente');
    if (curpInput) {
        // La readonly se establece en aplicarPermisosUI
        validarCURP(curpInput);
    }

    const officeInput = document.getElementById('office_cliente');
    if (officeInput && !officeInput.disabled) {
        officeInput.value = 'GDL'; // Resetear a GDL si no está bloqueado por rol
    }

    handleOfficeChangeForClientForm.call(document.getElementById('office_cliente') || { value: 'GDL' });
    showStatus('status_cliente', '', 'info');
}


async function handleClientForm(e) {
    e.preventDefault();
    const curpInput = document.getElementById('curp_cliente');
    const curp = curpInput.value.trim().toUpperCase();
    const submitButton = e.target.querySelector('button[type="submit"]');

    if (!validarFormatoCURP(curp)) {
        showStatus('status_cliente', 'El formato del CURP es incorrecto (debe tener 18 caracteres y seguir el patrón).', 'error');
        curpInput.classList.add('input-error');
        return;
    } else {
        curpInput.classList.remove('input-error');
    }

    const clienteData = {
        office: document.getElementById('office_cliente').value,
        curp,
        nombre: document.getElementById('nombre_cliente').value.trim(),
        domicilio: document.getElementById('domicilio_cliente').value.trim(),
        cp: document.getElementById('cp_cliente').value.trim(),
        telefono: document.getElementById('telefono_cliente').value.trim(),
        poblacion_grupo: document.getElementById('poblacion_grupo_cliente').value,
        ruta: document.getElementById('ruta_cliente').value,
        isComisionista: document.getElementById('comisionista_cliente').checked
    };

    if (!clienteData.nombre || !clienteData.domicilio || !clienteData.poblacion_grupo || !clienteData.ruta) {
        showStatus('status_cliente', 'Los campos con * son obligatorios.', 'error');
        return;
    }

    showButtonLoading(submitButton, true, editingClientId ? 'Actualizando...' : 'Guardando...');
    showStatus('status_cliente', editingClientId ? 'Actualizando datos del cliente...' : 'Registrando nuevo cliente...', 'info');

    try {
        let resultado;
        if (editingClientId) {
            if (!curpInput.readOnly) {
                const clienteOriginal = await database.obtenerClientePorId(editingClientId);
                if (clienteOriginal && clienteOriginal.curp !== curp) {
                    const existeNuevoCURP = await database.buscarClientePorCURP(curp);
                    if (existeNuevoCURP) {
                        throw new Error(`La nueva CURP (${curp}) ya pertenece a otro cliente (${existeNuevoCURP.nombre}).`);
                    }
                }
            }
            resultado = await database.actualizarCliente(editingClientId, clienteData, currentUser.email);
        } else {
            resultado = await database.agregarCliente(clienteData, currentUser.email);
        }

        if (resultado.success) {
            let successMessage = editingClientId ? 'Cliente actualizado exitosamente.' : 'Cliente registrado exitosamente.';
            if (!isOnline) {
                successMessage += ' (Datos guardados localmente, se sincronizarán al conectar).';
            }
            showStatus('status_gestion_clientes', successMessage, 'success'); // Mostrar mensaje en la tabla
            resetClientForm(); // Limpiar el formulario
            showView('view-gestion-clientes'); // Volver a la tabla
            // loadClientesTable(); // No recargar automáticamente, dejar que el usuario filtre si lo necesita
        } else {
            throw new Error(resultado.message || 'Ocurrió un error desconocido.');
        }

    } catch (error) {
        console.error("Error en handleClientForm:", error);
        showStatus('status_cliente', `Error: ${error.message}`, 'error');
    } finally {
        showButtonLoading(submitButton, false);
    }
}

// =============================================
// GESTIÓN DE USUARIOS
// =============================================
async function mostrarFormularioUsuario(usuario = null) {
    const formContainer = document.getElementById('form-usuario-container');
    const formTitulo = document.getElementById('form-usuario-titulo');
    const form = document.getElementById('form-usuario');
    const passwordInput = document.getElementById('nuevo-password');
    const emailInput = document.getElementById('nuevo-email');
    const officeSelect = document.getElementById('nuevo-sucursal'); // <-- Mantener ID HTML, cambiar variable
    const rutaSelect = document.getElementById('nuevo-ruta');

    // Cambiar nombre de variable sucursalSelect a officeSelect para claridad
    if (!formContainer || !formTitulo || !form || !officeSelect || !rutaSelect) return;

    form.reset();
    let userOffice = ''; // <-- CAMBIO DE sucursalUsuario A userOffice

    if (usuario) {
        editingUserId = usuario.id;
        formTitulo.textContent = 'Editar Usuario';
        document.getElementById('nuevo-nombre').value = usuario.name || '';
        emailInput.value = usuario.email || '';
        emailInput.readOnly = true;
        document.getElementById('nuevo-rol').value = usuario.role || '';
        userOffice = usuario.office || ''; // <-- CAMBIO DE sucursal A office
        officeSelect.value = userOffice; // <-- CAMBIO DE sucursalUsuario A userOffice
        passwordInput.required = false;
        passwordInput.placeholder = "Dejar en blanco para no cambiar";
    } else {
        editingUserId = null;
        formTitulo.textContent = 'Nuevo Usuario';
        emailInput.readOnly = false;
        passwordInput.required = true;
        passwordInput.placeholder = "Mínimo 6 caracteres";
        userOffice = ''; // <-- CAMBIO DE sucursalUsuario A userOffice
        officeSelect.value = '';
    }

    // Cargar rutas DESPUÉS de establecer la oficina
    await _cargarRutasParaUsuario(userOffice); // <-- CAMBIO DE sucursalUsuario A userOffice

    // Si editamos, seleccionar ruta guardada
    if (usuario && usuario.ruta) {
         setTimeout(() => {
            rutaSelect.value = usuario.ruta;
            if(rutaSelect.value !== usuario.ruta) {
                console.warn(`La ruta guardada "${usuario.ruta}" no se encontró en la lista para la oficina ${userOffice}.`); // <-- Mensaje actualizado
            }
         }, 50);
    }

    formContainer.classList.remove('hidden');
}


function ocultarFormularioUsuario() {
    editingUserId = null;
    const formContainer = document.getElementById('form-usuario-container');
    if (formContainer) {
        formContainer.classList.add('hidden');
        document.getElementById('form-usuario').reset();
        showStatus('status_usuarios', '', 'info');
    }
}

/**
 * Deshabilita un usuario
 */
async function disableUsuario(userId, userName) {
    if (!confirm(`¿Estás seguro de que deseas deshabilitar al usuario "${userName}"?`)) {
        return;
    }

    showProcessingOverlay(true, 'Deshabilitando usuario...');
    try {
        const resultado = await database.disableUsuario(userId);
        if (resultado.success) {
            showStatus('status_usuarios', `Usuario "${userName}" deshabilitado correctamente.`, 'success');
            await loadUsersTable();
        } else {
            throw new Error(resultado.message);
        }
    } catch (error) {
        console.error("Error deshabilitando usuario:", error);
        showStatus('status_usuarios', `Error: ${error.message}`, 'error');
    } finally {
        showProcessingOverlay(false);
    }
}


async function handleUserForm(e) {
    e.preventDefault();
    const submitButton = e.target.querySelector('button[type="submit"]');
    const statusUsuarios = document.getElementById('status_usuarios');

    showButtonLoading(submitButton, true, editingUserId ? 'Actualizando...' : 'Creando...');
    statusUsuarios.textContent = editingUserId ? 'Actualizando usuario...' : 'Creando nuevo usuario...';
    statusUsuarios.className = 'status-message status-info';

    try {
        if (editingUserId) {
            const userData = {
                name: document.getElementById('nuevo-nombre').value.trim(),
                role: document.getElementById('nuevo-rol').value,
                office: document.getElementById('nuevo-sucursal').value, // <-- CAMBIO DE sucursal A office
                ruta: document.getElementById('nuevo-ruta').value || null
            };
            if (!userData.name || !userData.role || !userData.office) { // <-- CAMBIO DE sucursal A office
                throw new Error('Nombre, Rol y Oficina son obligatorios.'); // <-- Mensaje actualizado
            }
            // La llamada a database.actualizarUsuario ya espera 'office'
            const resultado = await database.actualizarUsuario(editingUserId, userData);
            if (!resultado.success) throw new Error(resultado.message);

            let message = resultado.message;
            if (!isOnline) message += ' (Guardado localmente, se sincronizará).';
            showStatus('status_usuarios', message, 'success');
            ocultarFormularioUsuario();
            await loadUsersTable();

        } else {
            const email = document.getElementById('nuevo-email').value.trim();
            const password = document.getElementById('nuevo-password').value;
            const nombre = document.getElementById('nuevo-nombre').value.trim();
            const rol = document.getElementById('nuevo-rol').value;
            const office = document.getElementById('nuevo-sucursal').value; // <-- CAMBIO DE sucursal A office
            const ruta = document.getElementById('nuevo-ruta').value || null;

            if (!email || !password || !nombre || !rol || !office) { // <-- CAMBIO DE sucursal A office
                throw new Error('Email, Contraseña, Nombre, Rol y Oficina son obligatorios...'); // <-- Mensaje actualizado
            }
            if (password.length < 6) {
                throw new Error('La contraseña debe tener al menos 6 caracteres.');
            }
            if (!isOnline) {
                throw new Error("La creación de nuevos usuarios requiere conexión a internet.");
            }

            let user;
            try {
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                user = userCredential.user;
            } catch (authError) {
                console.error("Error en Auth createUser:", authError);
                if (authError.code === 'auth/email-already-in-use') throw new Error('Error: El correo electrónico ya está registrado.');
                if (authError.code === 'auth/weak-password') throw new Error('Error: La contraseña es demasiado débil (mínimo 6 caracteres).');
                if (authError.code === 'auth/invalid-email') throw new Error('Error: El formato del correo electrónico no es válido.');
                throw new Error(`Error de autenticación: ${authError.message}`);
            }

            // Si la creación en Auth fue exitosa, crear el documento en Firestore
            await db.collection('users').doc(user.uid).set({
                id: user.uid, email, name: nombre, role: rol,
                office: office, // <-- CAMBIO DE sucursal A office
                ruta: ruta,
                createdAt: new Date().toISOString(), status: 'active'
            });

            showStatus('status_usuarios', 'Usuario creado exitosamente.', 'success');
            ocultarFormularioUsuario();
            await loadUsersTable();
        }
    } catch (error) {
        console.error("Error en handleUserForm:", error);
        showStatus('status_usuarios', error.message, 'error');
    } finally {
        showButtonLoading(submitButton, false);
    }
}


async function loadUsersTable() {
    if (cargaEnProgreso) { /* ... sin cambios ... */ return; }
    cargaEnProgreso = true;
    const tbody = document.getElementById('tabla-usuarios');
    tbody.innerHTML = '<tr><td colspan="7">...</td></tr>'; // Colspan 7
    showButtonLoading('#btn-aplicar-filtros-usuarios', true, 'Buscando...');
    showStatus('status_usuarios', '', 'info');

    try {
        const resultado = await database.obtenerUsuarios();
        if (!resultado.success) throw new Error(resultado.message);
        let usuarios = resultado.data || [];

        const filtroEmail = (document.getElementById('filtro-email-usuario')?.value || '').trim().toLowerCase();
        const filtroNombre = (document.getElementById('filtro-nombre-usuario')?.value || '').trim().toLowerCase();
        const filtroRol = document.getElementById('filtro-rol-usuario')?.value || '';
        const filtroOfficeUsuario = document.getElementById('filtro-sucursal-usuario')?.value || ''; // <-- Variable correcta definida aquí

        const usuariosFiltrados = usuarios.filter(usuario => {
            const emailMatch = !filtroEmail || (usuario.email && usuario.email.toLowerCase().includes(filtroEmail));
            const nombreMatch = !filtroNombre || (usuario.name && usuario.name.toLowerCase().includes(filtroNombre));
            const rolMatch = !filtroRol || usuario.role === filtroRol;

            // *** CORRECCIÓN AQUÍ ***
            // Usar la variable 'filtroOfficeUsuario' que definimos arriba
            const officeUiMatch = !filtroOfficeUsuario || usuario.office === filtroOfficeUsuario || (filtroOfficeUsuario === 'AMBAS' && usuario.office === 'AMBAS');

            const adminOffice = currentUserData?.office;
            const adminOfficeMatch = !adminOffice || adminOffice === 'AMBAS' || usuario.office === adminOffice || !usuario.office;

            return emailMatch && nombreMatch && rolMatch && officeUiMatch && adminOfficeMatch;
        });

        tbody.innerHTML = '';

        if (usuariosFiltrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">No se encontraron usuarios...</td></tr>'; // Colspan 7
            showStatus('status_usuarios', 'No se encontraron usuarios.', 'info');
        } else {
            usuariosFiltrados.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            usuariosFiltrados.forEach(usuario => {
                const tr = document.createElement('tr');
                if (usuario.status === 'disabled') {
                    tr.style.opacity = '0.5';
                    tr.title = 'Usuario deshabilitado';
                }
                const normalizedRole = (usuario.role || 'default')
                    .normalize("NFD") // Separa acentos de letras (ej: "á" -> "a" + "´")
                    .replace(/[\u0300-\u036f]/g, "");
                const roleBadgeClass = `role-${normalizedRole.toLowerCase().replace(/\s/g, '-')}`;
                const usuarioJsonString = JSON.stringify(usuario).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

                tr.innerHTML = `
                    <td>${usuario.email || 'N/A'}</td>
                    <td>${usuario.name || 'N/A'}</td>
                    <td><span class="role-badge ${roleBadgeClass}">${usuario.role || 'Sin Rol'}</span></td>
                    <td>${usuario.office || 'N/A'}</td>
                    <td>${usuario.ruta || '--'}</td>
                    <td>${usuario.status === 'disabled' ? 'Deshabilitado' : 'Activo'}</td>
                    <td class="action-buttons">
                        <button class="btn btn-sm btn-info" onclick='mostrarFormularioUsuario(${usuarioJsonString})' title="Editar"><i class="fas fa-edit"></i></button>
                        ${usuario.status !== 'disabled' ? `<button class="btn btn-sm btn-warning" onclick="disableUsuario('${usuario.id}', '${usuario.name || usuario.email}')" title="Deshabilitar"><i class="fas fa-user-slash"></i></button>` : ''}                       
                    </td>
                `;
                tbody.appendChild(tr);
            });
            showStatus('status_usuarios', `${usuariosFiltrados.length} usuarios encontrados.`, 'success');
        }
    } catch (error) {
        console.error("Error cargando tabla de usuarios:", error);
        tbody.innerHTML = `<tr><td colspan="7">Error al cargar usuarios: ${error.message}</td></tr>`;
        showStatus('status_usuarios', `Error: ${error.message}`, 'error');
    } finally {
        cargaEnProgreso = false;
        showButtonLoading('#btn-aplicar-filtros-usuarios', false);
    }
}

/**
 * Resetea la tabla de usuarios a su estado inicial
 */
function inicializarVistaUsuarios() {
    const tbody = document.getElementById('tabla-usuarios');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7">Usa los filtros para buscar usuarios.</td></tr>';
    }
    // Ocultar formulario si está visible
    ocultarFormularioUsuario();
    // Limpiar filtros de texto
    const filtroEmail = document.getElementById('filtro-email-usuario');
    if (filtroEmail) filtroEmail.value = '';
    
    const filtroNombre = document.getElementById('filtro-nombre-usuario');
    if (filtroNombre) filtroNombre.value = '';
    
    const filtroRol = document.getElementById('filtro-rol-usuario');
    if (filtroRol) filtroRol.value = '';

    // No resetear filtro de sucursal si está deshabilitado por permisos
    const filtroSucursal = document.getElementById('filtro-sucursal-usuario');
    if (filtroSucursal && !filtroSucursal.disabled) {
        filtroSucursal.value = '';
    }
}

function limpiarFiltrosUsuarios() {
    if (cargaEnProgreso) {
        console.warn("Intento de limpiar filtros mientras carga estaba en progreso. Cancelando carga.");
        cancelarCarga();
    }
    inicializarVistaUsuarios();
    showStatus('status_usuarios', 'Filtros limpiados. Ingresa nuevos criterios para buscar.', 'info');
}

/**
 * Carga los datos de un cliente en el formulario de edición.
 * @param {object} cliente El objeto cliente completo (incluyendo id).
 */
async function editCliente(cliente) {
    if (!cliente || !cliente.id) {
        console.error("editCliente: Datos de cliente inválidos o falta ID.", cliente);
        alert("Error al cargar datos del cliente para editar.");
        return;
    }
    console.log("Editando cliente:", cliente);
    editingClientId = cliente.id; // Marcar que estamos editando

    // Poblar formulario
    document.getElementById('office_cliente').value = cliente.office || 'GDL';
    document.getElementById('curp_cliente').value = cliente.curp || '';
    document.getElementById('nombre_cliente').value = cliente.nombre || '';
    document.getElementById('domicilio_cliente').value = cliente.domicilio || '';
    document.getElementById('cp_cliente').value = cliente.cp || '';
    document.getElementById('telefono_cliente').value = cliente.telefono || '';
    document.getElementById('comisionista_cliente').checked = cliente.isComisionista || false;

    // Actualizar y seleccionar grupo/ruta
    handleOfficeChangeForClientForm.call(document.getElementById('office_cliente'));

    // Esperar a que los dropdowns se pueblen (si son asíncronos, aunque aquí no lo son)
    // Usar setTimeout para asegurar que el DOM se actualice
    setTimeout(async () => {
        // Cargar y unificar listas de poblaciones y rutas
        const [poblacionesGdl, poblacionesLeon, rutasGdl, rutasLeon] = await Promise.all([
            database.obtenerPoblaciones('GDL'),
            database.obtenerPoblaciones('LEON'),
            database.obtenerRutas('GDL'),
            database.obtenerRutas('LEON')
        ]);

        const todasPoblaciones = [...new Set([...poblacionesGdl.map(p => p.nombre), ...poblacionesLeon.map(p => p.nombre)])].sort();
        const todasRutas = [...new Set([...rutasGdl.map(r => r.nombre), ...rutasLeon.map(r => r.nombre)])].sort();

        popularDropdown('poblacion_grupo_cliente', todasPoblaciones, 'Selecciona población/grupo');
        popularDropdown('ruta_cliente', todasRutas, 'Selecciona una ruta');

        document.getElementById('poblacion_grupo_cliente').value = cliente.poblacion_grupo || '';
        document.getElementById('ruta_cliente').value = cliente.ruta || '';
    }, 100);

    const curpInput = document.getElementById('curp_cliente');
    if (curpInput) {
        // ReadOnly se maneja ahora por aplicarPermisosUI
        aplicarPermisosUI(currentUserData.role);
        validarCURP(curpInput);
    }

    const titulo = document.querySelector('#view-cliente h2');
    if (titulo) titulo.textContent = 'Editar Cliente';
    const submitButton = document.querySelector('#form-cliente button[type="submit"]');
    if (submitButton) submitButton.innerHTML = '<i class="fas fa-save"></i> Actualizar Cliente';

    showStatus('status_cliente', 'Editando datos del cliente.', 'info');
    showView('view-cliente');
}

/**
 * Elimina un cliente después de confirmación.
 * @param {string} id ID del cliente a eliminar.
 * @param {string} nombre Nombre del cliente para confirmación.
 */
async function deleteCliente(id, nombre) {
    if (!id) return;
    if (confirm(`¿Estás seguro de que deseas eliminar al cliente "${nombre}"?\nEsta acción no se puede deshacer y podría afectar créditos/pagos asociados.`)) {
        showProcessingOverlay(true, 'Eliminando cliente...');
        try {
            const resultado = await database.eliminarCliente(id);
            if (resultado.success) {
                showStatus('status_gestion_clientes', `Cliente "${nombre}" eliminado exitosamente.`, 'success');
                inicializarVistaGestionClientes();
                showStatus('status_gestion_clientes', `Cliente "${nombre}" eliminado. Filtra de nuevo para actualizar la vista.`, 'success');
            } else {
                throw new Error(resultado.message);
            }
        } catch (error) {
            console.error("Error eliminando cliente:", error);
            alert(`Error al eliminar cliente: ${error.message}`);
            showStatus('status_gestion_clientes', `Error al eliminar: ${error.message}`, 'error');
        } finally {
            showProcessingOverlay(false);
        }
    }
}

/**
 * Carga las rutas en el dropdown del formulario de usuario, filtradas por oficina.
 * @param {string} office La oficina seleccionada ('GDL', 'LEON', 'AMBAS', o '').
 */
async function _cargarRutasParaUsuario(office) { // <-- CAMBIO DE sucursal A office
    const rutaSelect = document.getElementById('nuevo-ruta');
    if (!rutaSelect) return;
    console.log(`--- _cargarRutasParaUsuario llamada con office: '${office}'`);

    rutaSelect.innerHTML = '<option value="">Cargando rutas...</option>';
    rutaSelect.disabled = true;

    try {
        if (office === 'AMBAS' || !office) { // <-- CAMBIO DE sucursal A office
             console.log("   Oficina AMBAS o vacía, deshabilitando rutas.");
             popularDropdown('nuevo-ruta', [], '-- Sin asignar --');
             rutaSelect.disabled = true;
             return;
        }

        const rutas = await database.obtenerRutas(office); // <-- CAMBIO DE sucursal A office
        console.log(`   Rutas obtenidas de DB:`, rutas);
        const rutasNombres = rutas.map(r => r.nombre).sort();
        console.log(`   Nombres de rutas a popular:`, rutasNombres);
        popularDropdown('nuevo-ruta', rutasNombres, '-- Sin asignar --');
        rutaSelect.disabled = false;
        console.log(`   Dropdown #nuevo-ruta actualizado.`);
    } catch (error) {
        console.error("Error cargando rutas para usuario:", error);
        popularDropdown('nuevo-ruta', [], 'Error al cargar');
    }
}

/**
 * Actualiza un dropdown de Grupo/Población filtrando por oficina
 */
async function _actualizarDropdownGrupo(selectId, office, placeholder) {
    // Prevenir actualizaciones duplicadas
    if (dropdownUpdateInProgress) {
        console.log(`--- Dropdown ${selectId} update skipped (already in progress)`);
        return;
    }
    
    dropdownUpdateInProgress = true;
    
    const selectElement = document.getElementById(selectId);
    if (!selectElement) {
        console.error(`!!! Dropdown con ID "${selectId}" NO ENCONTRADO.`);
        dropdownUpdateInProgress = false;
        return;
    }
    
    console.log(`--- Actualizando Dropdown "${selectId}" ---`);
    console.log(`   Oficina recibida: '${office}'`);

    const currentValue = selectElement.value;
    selectElement.innerHTML = `<option value="">Cargando...</option>`;
    selectElement.disabled = true;

    try {
        const poblaciones = await database.obtenerPoblaciones(office || null);
        console.log(`   Poblaciones obtenidas para "${selectId}":`, poblaciones.length);
        
        const nombres = [...new Set(poblaciones.map(p => p.nombre))].sort();
        console.log(`   Nombres a popular en "${selectId}":`, nombres.length);

        popularDropdown(selectId, nombres, placeholder);

        if (nombres.includes(currentValue)) {
            selectElement.value = currentValue;
        } else {
            selectElement.value = "";
        }
        console.log(`   Dropdown "${selectId}" actualizado.`);

    } catch (error) {
        console.error(`Error actualizando dropdown ${selectId}:`, error);
        popularDropdown(selectId, [], 'Error al cargar');
    } finally {
        selectElement.disabled = false;
        dropdownUpdateInProgress = false;
    }
}

// =============================================
// SECCIÓN DE CRÉDITOS (COLOCACIÓN)
// =============================================

async function handleSearchClientForCredit() {
    const curpInput = document.getElementById('curp_colocacion');
    const curp = curpInput.value.trim().toUpperCase();
    const statusColocacion = document.getElementById('status_colocacion');
    const formColocacion = document.getElementById('form-colocacion');
    const btnBuscar = document.getElementById('btnBuscarCliente_colocacion');

    if (!validarFormatoCURP(curp)) {
        showStatus('status_colocacion', 'El CURP debe tener 18 caracteres y formato válido.', 'error');
        formColocacion.classList.add('hidden');
        return;
    }

    showButtonLoading(btnBuscar, true, 'Buscando...');
    showFixedProgress(30, 'Buscando cliente...');
    statusColocacion.innerHTML = 'Buscando cliente...';
    statusColocacion.className = 'status-message status-info';
    formColocacion.classList.add('hidden');

    try {
        const cliente = await database.buscarClientePorCURP(curp, currentUserData?.office);
        if (!cliente) {
            showFixedProgress(100, 'Cliente no encontrado');
            throw new Error('CURP aún no registrado. Hay que generar el registro del cliente primero.');
        }

        showFixedProgress(70, 'Verificando elegibilidad...');
        statusColocacion.innerHTML = 'Cliente encontrado. Verificando elegibilidad para crédito...';
        const elegibilidad = await database.verificarElegibilidadCliente(curp);

        if (!elegibilidad.elegible) {
            showFixedProgress(100, 'Cliente no elegible');
            throw new Error(elegibilidad.message);
        }

        showFixedProgress(100, 'Cliente elegible');

        const creditoActivo = await database.buscarCreditoActivoPorCliente(curp);
        const plazoSelect = document.getElementById('plazo_colocacion');
        const tipoCreditoSelect = document.getElementById('tipo_colocacion');

        let mensaje = '';
        if (creditoActivo) {
            // *** CORRECCIÓN: Lógica de Renovación ***
            mensaje = 'Cliente encontrado y elegible para RENOVACIÓN (solo 14 semanas).';
            popularDropdown('plazo_colocacion', [14].map(p => ({ value: p, text: `${p} semanas` })), 'Selecciona plazo', true);
            plazoSelect.value = 14;
            plazoSelect.disabled = true;
            tipoCreditoSelect.value = 'renovacion';
            tipoCreditoSelect.disabled = true;
        } else {
            // Lógica de Cliente Nuevo
            mensaje = 'Cliente encontrado y elegible para crédito NUEVO.';
            actualizarPlazosSegunCliente(cliente.isComisionista || false);
            plazoSelect.disabled = false;
            tipoCreditoSelect.value = 'nuevo';
            tipoCreditoSelect.disabled = false;
        }

        showStatus('status_colocacion', mensaje, 'success');

        document.getElementById('nombre_colocacion').value = cliente.nombre;
        document.getElementById('idCredito_colocacion').value = 'Se asignará automáticamente';
        document.getElementById('monto_colocacion').value = '';
        document.getElementById('montoTotal_colocacion').value = '';
        document.getElementById('curpAval_colocacion').value = '';
        document.getElementById('nombreAval_colocacion').value = '';
        validarCURP(document.getElementById('curpAval_colocacion'));

        calcularMontoTotalColocacion(); // Calcular monto (que será $0)
        formColocacion.classList.remove('hidden');

    } catch (error) {
        console.error("Error buscando cliente para crédito:", error);
        showStatus('status_colocacion', `Error: ${error.message}`, 'error');
        formColocacion.classList.add('hidden');
        hideFixedProgress();
    } finally {
        showButtonLoading(btnBuscar, false);
        if (!document.querySelector('#status_colocacion.status-error')) {
            setTimeout(hideFixedProgress, 1500);
        }
    }
}


async function handleCreditForm(e) {
    e.preventDefault();
    const submitButton = e.target.querySelector('button[type="submit"]');
    const statusColocacion = document.getElementById('status_colocacion');

    const curpAvalInput = document.getElementById('curpAval_colocacion');
    const curpAval = curpAvalInput.value.trim().toUpperCase();
    const creditoData = {
        curpCliente: document.getElementById('curp_colocacion').value.trim().toUpperCase(),
        tipo: document.getElementById('tipo_colocacion').value,
        monto: parseFloat(document.getElementById('monto_colocacion').value),
        plazo: parseInt(document.getElementById('plazo_colocacion').value),
        curpAval: curpAval,
        nombreAval: document.getElementById('nombreAval_colocacion').value.trim()
    };

    // *** CORRECCIÓN: Calcular monto total y saldo basado en reglas de interés ***
    let interesRate = 0;
    if (creditoData.plazo === 14) interesRate = 0.40;
    else if (creditoData.plazo === 13) interesRate = 0.30;
    else if (creditoData.plazo === 10) interesRate = 0.00;

    creditoData.montoTotal = parseFloat((creditoData.monto * (1 + interesRate)).toFixed(2));
    creditoData.saldo = creditoData.montoTotal;


    if (!creditoData.monto || creditoData.monto <= 0 || !creditoData.plazo || !creditoData.tipo || !creditoData.nombreAval) {
        showStatus('status_colocacion', 'Error: Todos los campos del crédito son obligatorios (Monto, Plazo, Tipo, Nombre Aval).', 'error');
        return;
    }
    // *** CORRECCIÓN: Validar regla de renovación ***
    if ((creditoData.tipo === 'renovacion' || creditoData.tipo === 'reingreso') && creditoData.plazo !== 14) {
        showStatus('status_colocacion', 'Error: Las renovaciones y reingresos solo pueden ser a 14 semanas.', 'error');
        return;
    }

    if (!validarFormatoCURP(creditoData.curpCliente)) {
        showStatus('status_colocacion', 'Error: CURP del cliente inválido.', 'error');
        return;
    }
    if (!validarFormatoCURP(curpAval)) {
        showStatus('status_colocacion', 'Error: El CURP del aval debe tener 18 caracteres y formato válido.', 'error');
        curpAvalInput.classList.add('input-error');
        return;
    } else {
        curpAvalInput.classList.remove('input-error');
    }

    showButtonLoading(submitButton, true, 'Generando...');
    showFixedProgress(50, 'Validando y generando crédito...');
    statusColocacion.innerHTML = 'Validando elegibilidad y generando crédito...';
    statusColocacion.className = 'status-message status-info';

    try {
        const resultado = await database.agregarCredito(creditoData, currentUser.email);

        if (resultado.success) {
            showFixedProgress(100, 'Crédito generado');
            let successMessage = `¡Crédito generado exitosamente! ID Firestore: ${resultado.data.id}.`;
            if (resultado.data.historicalIdCredito) successMessage += ` (ID Histórico: ${resultado.data.historicalIdCredito})`;

            if (!isOnline) {
                successMessage += ' (Datos guardados localmente, se sincronizarán al conectar).';
            }
            showStatus('status_colocacion', successMessage, 'success');

            e.target.reset();
            document.getElementById('form-colocacion').classList.add('hidden');
            document.getElementById('curp_colocacion').value = '';
            document.getElementById('nombre_colocacion').value = '';

        } else {
            throw new Error(resultado.message);
        }

    } catch (error) {
        console.error("Error en handleCreditForm:", error);
        showFixedProgress(100, 'Error al generar');
        showStatus('status_colocacion', `Error al generar crédito: ${error.message}`, 'error');
    } finally {
        showButtonLoading(submitButton, false);
        setTimeout(hideFixedProgress, 2000);
    }
}


// =============================================
// SECCIÓN DE PAGOS (COBRANZA)
// =============================================

async function handleSearchCreditForPayment() {
    const idCreditoInput = document.getElementById('idCredito_cobranza');
    const historicalIdCredito = idCreditoInput.value.trim();
    const statusCobranza = document.getElementById('status_cobranza');
    const formCobranza = document.getElementById('form-cobranza');
    const btnBuscar = document.getElementById('btnBuscarCredito_cobranza');

    creditoActual = null;

    if (!historicalIdCredito) {
        showStatus('status_cobranza', 'Por favor, ingresa un ID de crédito (histórico).', 'warning');
        formCobranza.classList.add('hidden');
        return;
    }

    showButtonLoading(btnBuscar, true, 'Buscando...');
    showFixedProgress(30, `Buscando crédito con ID ${historicalIdCredito}...`);
    statusCobranza.innerHTML = 'Buscando crédito...';
    statusCobranza.className = 'status-message status-info';
    formCobranza.classList.add('hidden');

    try {
        const creditosEncontrados = await database.buscarCreditosPorHistoricalId(historicalIdCredito, { userOffice: currentUserData?.office }); // Aplicar segregación

        if (creditosEncontrados.length === 0) {
            showFixedProgress(100, 'Crédito no encontrado');
            throw new Error(`No se encontró ningún crédito con el ID histórico: ${historicalIdCredito} (en tu sucursal).`);
        }

        if (creditosEncontrados.length > 1) {
            console.warn(`Se encontraron ${creditosEncontrados.length} créditos con el ID histórico ${historicalIdCredito}. Mostrando el más reciente.`);
            creditosEncontrados.sort((a, b) => (parsearFecha(b.fechaCreacion)?.getTime() || 0) - (parsearFecha(a.fechaCreacion)?.getTime() || 0));
            showStatus('status_cobranza', `Advertencia: Se encontraron ${creditosEncontrados.length} créditos con ID ${historicalIdCredito}. Se cargó el más reciente (${creditosEncontrados[0].curpCliente}).`, 'warning');
        }

        creditoActual = creditosEncontrados[0];

        showFixedProgress(60, 'Obteniendo datos del cliente...');
        const cliente = await database.buscarClientePorCURP(creditoActual.curpCliente, currentUserData?.office); // Aplicar segregación
        if (!cliente) {
            console.warn(`No se encontró cliente para CURP ${creditoActual.curpCliente} del crédito ${historicalIdCredito}`);
        }

        showFixedProgress(80, 'Calculando historial del crédito...');
        // *** CORRECCIÓN: Obtener pagos para cálculo de estado ***
        const pagos = await database.getPagosPorCredito(historicalIdCredito, creditoActual.office);
        pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0));

        const historial = _calcularEstadoCredito(creditoActual, pagos); // <-- Pasa los pagos

        if (!historial) {
            console.error("No se pudo calcular el historial para el crédito:", creditoActual);
            throw new Error(`No se pudo calcular el historial del crédito ${historicalIdCredito}. Verifica los datos del crédito (monto, plazo, fecha).`);
        }

        document.getElementById('nombre_cobranza').value = cliente ? cliente.nombre : (creditoActual.nombreCliente || 'Cliente Desconocido');
        document.getElementById('saldo_cobranza').value = `$${historial.saldoRestante.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('estado_cobranza').value = historial.estado.toUpperCase();
        document.getElementById('semanas_atraso_cobranza').value = historial.semanasAtraso || 0;
        document.getElementById('pago_semanal_cobranza').value = `$${historial.pagoSemanal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('fecha_proximo_pago_cobranza').value = historial.proximaFechaPago || 'N/A';
        const montoInput = document.getElementById('monto_cobranza');
        montoInput.value = historial.pagoSemanal > 0 ? historial.pagoSemanal.toFixed(2) : '';
        handleMontoPagoChange();

        showFixedProgress(100, 'Crédito encontrado');
        formCobranza.classList.remove('hidden');

        if (!statusCobranza.textContent.includes('Advertencia')) {
            showStatus('status_cobranza', `Crédito ${historicalIdCredito} encontrado (${creditoActual.curpCliente}). Listo para registrar pago.`, 'success');
        }

        montoInput.focus();
        montoInput.select();

    } catch (error) {
        console.error("Error buscando crédito para pago:", error);
        showStatus('status_cobranza', `Error: ${error.message}`, 'error');
        formCobranza.classList.add('hidden');
        creditoActual = null;
        hideFixedProgress();
    } finally {
        showButtonLoading(btnBuscar, false);
        if (!document.querySelector('#status_cobranza.status-error')) {
            setTimeout(hideFixedProgress, 1500);
        }
    }
}


async function handlePaymentForm(e) {
    e.preventDefault();
    const submitButton = e.target.querySelector('button[type="submit"]');
    const statusCobranza = document.getElementById('status_cobranza');

    if (!creditoActual || !creditoActual.id || !(creditoActual.historicalIdCredito || creditoActual.id)) {
        showStatus('status_cobranza', 'Error: No hay un crédito válido seleccionado. Por favor, busca el crédito de nuevo.', 'error');
        return;
    }
    const historicalId = creditoActual.historicalIdCredito || creditoActual.id;

    const montoInput = document.getElementById('monto_cobranza');
    const montoPago = parseFloat(montoInput.value);
    const tipoPago = document.getElementById('tipo_cobranza').value;

    if (isNaN(montoPago) || montoPago <= 0) {
        showStatus('status_cobranza', 'Error: El monto del pago debe ser un número positivo.', 'error');
        montoInput.classList.add('input-error');
        return;
    } else {
        montoInput.classList.remove('input-error');
    }

    // *** CORRECCIÓN: Usar el saldo RECALCULADO (si estuviera disponible) o el de la DB para la validación de sobrepago ***
    // Re-buscamos el estado para tener el saldo más fidedigno posible ANTES de pagar
    const pagos = await database.getPagosPorCredito(historicalId, creditoActual.office);
    pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0));
    const historial = _calcularEstadoCredito(creditoActual, pagos);
    
    const saldoActualParaValidar = historial ? historial.saldoRestante : (creditoActual.saldo !== undefined ? creditoActual.saldo : 0);

    const tolerancia = 0.015;
    if (montoPago > saldoActualParaValidar + tolerancia) {
        showStatus('status_cobranza', `Error: El monto del pago ($${montoPago.toFixed(2)}) excede el saldo restante ($${saldoActualParaValidar.toFixed(2)}).`, 'error');
        montoInput.classList.add('input-error');
        return;
    }

    showButtonLoading(submitButton, true, 'Registrando...');
    showFixedProgress(50, 'Procesando pago...');
    statusCobranza.innerHTML = 'Registrando pago...';
    statusCobranza.className = 'status-message status-info';

    try {
        const pagoData = {
            idCredito: historicalId,
            monto: montoPago,
            tipoPago: tipoPago
        };

        // database.agregarPago usa una transacción y valida contra el saldo actual en la DB
        // lo cual es la forma correcta de registrar el pago.
        const resultado = await database.agregarPago(pagoData, currentUser.email, creditoActual.id);

        if (resultado.success) {
            showFixedProgress(100, 'Pago registrado');
            let successMsg = '¡Pago registrado exitosamente!';
            if (!isOnline) successMsg += ' (Guardado localmente).';
            showStatus('status_cobranza', successMsg, 'success');

            document.getElementById('form-cobranza').classList.add('hidden');
            document.getElementById('idCredito_cobranza').value = '';
            creditoActual = null;

        } else {
            throw new Error(resultado.message);
        }

    } catch (error) {
        console.error("Error en handlePaymentForm:", error);
        showFixedProgress(100, 'Error al registrar');
        showStatus('status_cobranza', `Error al registrar pago: ${error.message}`, 'error');
    } finally {
        showButtonLoading(submitButton, false);
        setTimeout(hideFixedProgress, 2000);
    }
}


async function handleMontoPagoChange() {
    if (!creditoActual) return;

    const montoInput = document.getElementById('monto_cobranza');
    const saldoDespuesInput = document.getElementById('saldoDespues_cobranza');
    if (!montoInput || !saldoDespuesInput) return;

    // *** CORRECCIÓN: Usar el saldo RECALCULADO para la UI ***
    const historicalId = creditoActual.historicalIdCredito || creditoActual.id;
    const pagos = await database.getPagosPorCredito(historicalId, creditoActual.office);
    pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0));
    const historial = _calcularEstadoCredito(creditoActual, pagos);
    
    const saldoActualParaUI = historial ? historial.saldoRestante : (creditoActual.saldo !== undefined ? creditoActual.saldo : 0);

    const monto = parseFloat(montoInput.value) || 0;
    const saldoDespues = saldoActualParaUI - monto;

    saldoDespuesInput.value = `$${saldoDespues.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const tolerancia = 0.015;
    if (monto > saldoActualParaUI + tolerancia) {
        montoInput.classList.add('input-error');
        montoInput.title = "El monto excede el saldo actual";
        showStatus('status_cobranza', 'Advertencia: El monto ingresado excede el saldo restante.', 'warning');
    } else {
        montoInput.classList.remove('input-error');
        montoInput.title = "";
        const statusCobranza = document.getElementById('status_cobranza');
        if (statusCobranza.classList.contains('status-warning') && statusCobranza.textContent.includes('excede')) {
            showStatus('status_cobranza', `Crédito ${historicalId} encontrado (${creditoActual.curpCliente}). Listo para registrar pago.`, 'success');
        }
    }
}

// =============================================
// SECCIÓN DE PAGO GRUPAL
// =============================================
async function handleCalcularCobranzaRuta() {
    console.log('Temporizador de inactividad PAUSADO para cálculo de ruta.');
    clearTimeout(inactivityTimer);
    const statusPagoGrupo = document.getElementById('status_pago_grupo');
    const btnCalcular = document.getElementById('btn-calcular-cobranza-ruta');
    const btnGuardar = document.getElementById('btn-guardar-cobranza-offline');
    const btnRegistrar = document.getElementById('btn-registrar-pagos-offline');
    const container = document.getElementById('cobranza-ruta-container');
    const placeholder = document.getElementById('cobranza-ruta-placeholder');
    
    if (!currentUserData || !currentUserData.ruta || !currentUserData.office || currentUserData.office === 'AMBAS') {
        showStatus('status_pago_grupo', 'Error: Debes tener una ruta y oficina única asignada para usar esta función.', 'error');
        resetInactivityTimer();
        return;
    }
    if (!navigator.onLine) {
        showStatus('status_pago_grupo', 'Error: Se necesita conexión a internet para calcular la cobranza de la ruta.', 'error');
        resetInactivityTimer();
        return;
    }
    const userRuta = currentUserData.ruta;
    const userOffice = currentUserData.office;
    const esAdminConAccesoTotal = (currentUserData?.role === 'Super Admin' || currentUserData?.role === 'Gerencia');
    cargaEnProgreso = true;
    currentSearchOperation = Date.now();
    const operationId = currentSearchOperation;
    showButtonLoading(btnCalcular, true, 'Calculando...');
    showFixedProgress(5, `Calculando cobranza para ruta ${userRuta}...`);
    statusPagoGrupo.innerHTML = `Buscando poblaciones para la ruta ${userRuta}...`;
    statusPagoGrupo.className = 'status-message status-info';
    container.innerHTML = '';
    if (placeholder) placeholder.classList.add('hidden');
    cobranzaRutaData = {};
    if (btnGuardar) btnGuardar.classList.add('hidden');
    if (btnRegistrar) btnRegistrar.classList.add('hidden');
    try {
        statusPagoGrupo.textContent = `Buscando poblaciones asignadas a ruta ${userRuta}...`;
        let poblacionesQuery = db.collection('poblaciones')
                                    .where('ruta', '==', userRuta);        
        if (!esAdminConAccesoTotal) {
            poblacionesQuery = poblacionesQuery.where('office', '==', userOffice);
        }
        const poblacionesSnapshot = await poblacionesQuery.get();
        const nombresPoblacionesDeLaRuta = poblacionesSnapshot.docs.map(doc => doc.data().nombre);        
        if (nombresPoblacionesDeLaRuta.length === 0) { 
            throw new Error(`No se encontraron poblaciones asignadas a la ruta ${userRuta}` + (esAdminConAccesoTotal ? '.' : ` en tu oficina (${userOffice}).`)); 
        }
        console.log(`Poblaciones encontradas para la ruta ${userRuta}:`, nombresPoblacionesDeLaRuta);
        showFixedProgress(20, `Buscando clientes en ${nombresPoblacionesDeLaRuta.length} poblaciones...`);
        const clientesDeLasPoblaciones = [];
        const MAX_IN_VALUES = 10;
        for (let i = 0; i < nombresPoblacionesDeLaRuta.length; i += MAX_IN_VALUES) {
            const chunkPoblaciones = nombresPoblacionesDeLaRuta.slice(i, i + MAX_IN_VALUES);
            let clientesQuery = db.collection('clientes')
                                .where('poblacion_grupo', 'in', chunkPoblaciones);
            if (!esAdminConAccesoTotal) {
                clientesQuery = clientesQuery.where('office', '==', userOffice);
            }
            const clientesSnapshot = await clientesQuery.get();
            clientesSnapshot.docs.forEach(doc => {
                clientesDeLasPoblaciones.push({ id: doc.id, ...doc.data() });
            });
        }
        if (clientesDeLasPoblaciones.length === 0) { 
            throw new Error(`No se encontraron clientes en las poblaciones de la ruta ${userRuta}` + (esAdminConAccesoTotal ? '.' : ` asignados a tu oficina (${userOffice}).`)); 
        }
        showFixedProgress(40, `Procesando ${clientesDeLasPoblaciones.length} clientes...`);
        let creditosPendientes = [];
        let poblacionesEncontradasSet = new Set();
        let totalGeneralACobrar = 0;
        let clientesConErrores = 0;
        const totalClientes = clientesDeLasPoblaciones.length;
        for (const [index, cliente] of clientesDeLasPoblaciones.entries()) {
            if (operationId !== currentSearchOperation) throw new Error("Operación cancelada");            
            const progress = 40 + Math.round(((index + 1) / totalClientes) * 50);
            showFixedProgress(progress, `Procesando cliente ${index + 1} de ${totalClientes}...`);
            if (!nombresPoblacionesDeLaRuta.includes(cliente.poblacion_grupo)) { continue; }
            const clienteOffice = cliente.office; 
            if (!clienteOffice) {
                console.warn(`Cliente ${cliente.curp} omitido por no tener oficina asignada.`);
                continue;
            }
            const creditoActivo = await database.buscarCreditoActivoPorCliente(cliente.curp, clienteOffice);             
            if (creditoActivo) {
                const pagos = await database.getPagosPorCredito(creditoActivo.historicalIdCredito || creditoActivo.id, creditoActivo.office);
                pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0));
                const estadoCalc = _calcularEstadoCredito(creditoActivo, pagos);
                if (estadoCalc && estadoCalc.estado !== 'liquidado' && estadoCalc.pagoSemanal > 0.01) {
                    poblacionesEncontradasSet.add(cliente.poblacion_grupo);
                    totalGeneralACobrar += estadoCalc.pagoSemanal;
                    creditosPendientes.push({
                            firestoreId: creditoActivo.id,
                            historicalIdCredito: creditoActivo.historicalIdCredito || creditoActivo.id,
                            nombreCliente: cliente.nombre,
                            curpCliente: cliente.curp,
                            pagoSemanal: estadoCalc.pagoSemanal,
                            saldoRestante: estadoCalc.saldoRestante,
                            office: creditoActivo.office
                        });
                } else if (!estadoCalc) { 
                    console.warn(`Error al calcular estado para crédito ${creditoActivo.id}`);
                    clientesConErrores++;
                }
            }
        }
        if (creditosPendientes.length === 0) { 
            if (clientesConErrores > 0) {
                throw new Error(`Se encontraron ${clientesDeLasPoblaciones.length} clientes, pero ${clientesConErrores} créditos tienen datos inconsistentes.`);
            }
            throw new Error('No se encontraron créditos con cobranza pendiente para esta ruta y oficina.'); 
        }
        showFixedProgress(95, 'Agrupando y renderizando resultados...');
        cobranzaRutaData = {};
        creditosPendientes.forEach(cred => {
            const clienteDelCredito = clientesDeLasPoblaciones.find(c => c.curp === cred.curpCliente);
            const grupo = clienteDelCredito ? clienteDelCredito.poblacion_grupo : 'Desconocido';
            if (!cobranzaRutaData[grupo]) {
                cobranzaRutaData[grupo] = [];
            }
            cobranzaRutaData[grupo].push(cred);
        });
        creditosPendientes.forEach(cred => {
            const pob = cliente.poblacion_grupo;
            creditosPendientes.forEach(cred => {
                const cliente = clientesDeLasPoblaciones.find(c => c.curp === cred.curpCliente);
                const grupo = cliente ? cliente.poblacion_grupo : 'Desconocido';
                if (!cobranzaRutaData[grupo]) {
                    cobranzaRutaData[grupo] = [];
                }
                cobranzaRutaData[grupo].push(cred);
            });
        });

        renderizarCobranzaRuta(cobranzaRutaData, container);
        if (btnGuardar) btnGuardar.classList.remove('hidden');
        if (btnRegistrar) btnRegistrar.classList.remove('hidden');

        showFixedProgress(100, 'Cálculo completado');
        let msgExito = `Cálculo completado: ${creditosPendientes.length} créditos encontrados.`;
        if (clientesConErrores > 0) msgExito += ` (${clientesConErrores} créditos omitidos por errores).`;
        showStatus('status_pago_grupo', msgExito, 'success');        
    } catch (error) {
        console.error("Error al calcular cobranza de ruta:", error);
        if (error.message === "Operación cancelada") {
            showStatus('status_pago_grupo', 'Cálculo cancelado por el usuario.', 'warning');
        } else {
            showStatus('status_pago_grupo', `Error: ${error.message}`, 'error');
        }
        if (placeholder) {
            placeholder.textContent = `Error al calcular: ${error.message}`;
            placeholder.classList.remove('hidden');
        }        
        container.innerHTML = '';
        cobranzaRutaData = null;
        if (btnGuardar) btnGuardar.classList.add('hidden');
        if (btnRegistrar) btnRegistrar.classList.add('hidden');
    } finally {
        cargaEnProgreso = false;
        showButtonLoading(btnCalcular, false);
        setTimeout(hideFixedProgress, 2000);
        console.log('Cálculo de ruta finalizado. Temporizador de inactividad REACTIVADO.');
        resetInactivityTimer();
    }
}

/**
 * Registra los pagos individuales marcados en la lista de cobranza por ruta
 * (ya sea calculada online o cargada offline). Funciona offline.
 */
async function handleRegistroPagoGrupal() {
    const statusPagoGrupo = document.getElementById('status_pago_grupo');
    const container = document.getElementById('cobranza-ruta-container');
    const checkboxes = container.querySelectorAll('.pago-grupal-check:checked'); // Buscar checkboxes DENTRO del contenedor

    if (!cobranzaRutaData || Object.keys(cobranzaRutaData).length === 0) {
        showStatus('status_pago_grupo', 'Error: No hay datos de cobranza cargados (calculados o de offline) para registrar.', 'error');
        return;
    }
    if (!checkboxes || checkboxes.length === 0) {
        showStatus('status_pago_grupo', 'No hay pagos seleccionados para registrar.', 'warning');
        return;
    }

    showProcessingOverlay(true, `Registrando ${checkboxes.length} pagos...`);
    statusPagoGrupo.innerHTML = `Registrando ${checkboxes.length} pagos seleccionados...`;
    statusPagoGrupo.className = 'status-message status-info';

    let pagosRegistrados = 0;
    const erroresRegistro = [];
    const promesasPagos = [];

    checkboxes.forEach(checkbox => {
        const firestoreId = checkbox.getAttribute('data-firestore-id');
        const montoPago = parseFloat(checkbox.getAttribute('data-monto'));
        const histId = checkbox.getAttribute('data-hist-id'); // Necesario para database.agregarPago
        const nombreCliente = checkbox.getAttribute('data-nombre');

        // Encontrar la oficina (la necesitamos para agregarPago, aunque no esté directo en el checkbox)
        // Buscamos en la data guardada
        let office = null;
        for (const pob in cobranzaRutaData) {
            const cred = cobranzaRutaData[pob].find(c => c.firestoreId === firestoreId);
            if (cred) {
                office = cred.office;
                break;
            }
        }

        if (montoPago > 0 && firestoreId && histId && office) {
            const pagoData = {
                idCredito: histId, // Historical ID
                monto: montoPago,
                tipoPago: 'grupal' // O podrías poner 'ruta'
            };

            promesasPagos.push(
                database.agregarPago(pagoData, currentUser.email, firestoreId)
                    .then(resultado => {
                        if (resultado.success) {
                            pagosRegistrados++;
                            // Desmarcar y deshabilitar visualmente el checkbox/fila (opcional)
                             checkbox.checked = false;
                             checkbox.disabled = true;
                             checkbox.closest('tr')?.classList.add('pago-registrado-exito');
                        } else {
                             erroresRegistro.push(`Cliente ${nombreCliente}: ${resultado.message}`);
                             checkbox.closest('tr')?.classList.add('pago-registrado-error');
                        }
                    })
                    .catch(error => {
                        erroresRegistro.push(`Cliente ${nombreCliente}: ${error.message}`);
                         checkbox.closest('tr')?.classList.add('pago-registrado-error');
                    })
            );
        } else {
            erroresRegistro.push(`Datos incompletos para registrar pago del cliente ${nombreCliente || firestoreId}. Monto: ${montoPago}, ID: ${firestoreId}, HistID: ${histId}, Office: ${office}`);
             checkbox.closest('tr')?.classList.add('pago-registrado-error');
        }
    }); // Fin forEach

    try {
        await Promise.all(promesasPagos);

        let finalMessage = `Registro completado: ${pagosRegistrados} pagos registrados exitosamente.`;
        let finalStatusType = 'success';

        if (erroresRegistro.length > 0) {
            finalMessage += ` ${erroresRegistro.length} pagos fallaron. Revisa la lista y la consola para detalles.`;
            finalStatusType = (pagosRegistrados > 0) ? 'warning' : 'error';
            console.error("Errores durante registro de pagos:", erroresRegistro);
        }

         showStatus('status_pago_grupo', finalMessage, finalStatusType);
         // No limpiamos la vista aquí, solo actualizamos los checkboxes/filas

         // Añadir estilos CSS para filas registradas (puedes poner esto en styles.css)
         const style = document.createElement('style');
         style.textContent = `
            tr.pago-registrado-exito { opacity: 0.5; background-color: #d4edda !important; }
            tr.pago-registrado-error { background-color: #f8d7da !important; }
            tr.pago-registrado-exito td, tr.pago-registrado-error td { text-decoration: line-through; }
         `;
         document.head.appendChild(style);


    } catch (error) {
        console.error("Error crítico al procesar pagos:", error);
        showStatus('status_pago_grupo', `Error crítico durante el registro: ${error.message}`, 'error');
    } finally {
        showProcessingOverlay(false);
        // El botón sigue visible, solo lo rehabilitamos si es necesario
        // showButtonLoading('#btn-registrar-pagos-offline', false); // Podría ser necesario si lo deshabilitas al inicio
    }
}

/**
 * Carga y muestra las estadísticas básicas del sistema.
 * @param {string} userSucursal La sucursal del usuario (opcional).
 */
async function loadBasicReports(userOffice = null) {
    console.log(`Cargando reportes básicos para sucursal: ${userOffice || 'Todas'}...`);
    const btnActualizar = document.getElementById('btn-actualizar-reportes');
    showButtonLoading(btnActualizar, true, 'Actualizando...');
    showStatus('status_reportes', 'Calculando estadísticas...', 'info');

    document.getElementById('total-clientes').textContent = '...';
    document.getElementById('total-creditos').textContent = '...';
    document.getElementById('total-cartera').textContent = '$...';
    document.getElementById('total-vencidos').textContent = '...';
    document.getElementById('pagos-registrados').textContent = '...';
    document.getElementById('cobrado-mes').textContent = '$...';
    document.getElementById('tasa-recuperacion').textContent = '...%';
    document.getElementById('total-comisiones').textContent = '$...';

    try {
        const reportes = await database.generarReportes(userOffice); // Aplicar segregación

        document.getElementById('total-clientes').textContent = reportes.totalClientes?.toLocaleString() ?? 'Error';
        document.getElementById('total-creditos').textContent = reportes.totalCreditos?.toLocaleString() ?? 'Error';
        document.getElementById('total-cartera').textContent = `$${reportes.totalCartera?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? 'Error'}`;
        document.getElementById('total-vencidos').textContent = reportes.totalVencidos?.toLocaleString() ?? 'Error';
        document.getElementById('pagos-registrados').textContent = reportes.pagosRegistrados?.toLocaleString() ?? 'Error';
        document.getElementById('cobrado-mes').textContent = `$${reportes.cobradoMes?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? 'Error'}`;
        document.getElementById('tasa-recuperacion').textContent = `${reportes.tasaRecuperacion?.toFixed(1) ?? '0'}%`;
        document.getElementById('total-comisiones').textContent = `$${reportes.totalComisiones?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? 'Error'}`;

        showStatus('status_reportes', 'Reportes actualizados correctamente.', 'success');

    } catch (error) {
        console.error("Error al cargar reportes básicos:", error);
        showStatus('status_reportes', `Error al cargar reportes: ${error.message}`, 'error');
        document.getElementById('total-clientes').textContent = 'Error';
        document.getElementById('total-creditos').textContent = 'Error';
        document.getElementById('total-cartera').textContent = 'Error';
        document.getElementById('total-vencidos').textContent = 'Error';
        document.getElementById('pagos-registrados').textContent = 'Error';
        document.getElementById('cobrado-mes').textContent = 'Error';
        document.getElementById('tasa-recuperacion').textContent = 'Error';
        document.getElementById('total-comisiones').textContent = 'Error';
    } finally {
        showButtonLoading(btnActualizar, false);
    }
}

/**
 * Renderiza la lista de cobranza agrupada por población en el contenedor especificado.
 * @param {object} data Objeto con poblaciones como claves y arrays de créditos como valores.
 * @param {HTMLElement} container Elemento HTML donde se renderizará la lista.
 */
function renderizarCobranzaRuta(data, container) {
    if (!data || Object.keys(data).length === 0) {
        container.innerHTML = '<p>No hay datos de cobranza para mostrar.</p>';
        return;
    }

    let html = '';
    let totalGeneralCalculado = 0;

    // Ordenar poblaciones alfabéticamente
    const poblacionesOrdenadas = Object.keys(data).sort();

    poblacionesOrdenadas.forEach(poblacion => {
        const creditos = data[poblacion];
        let totalPoblacion = 0;

        html += `<div class="poblacion-group card">`;
        html += `<h3>Población: ${poblacion} (${creditos.length} clientes)</h3>`;
        html += `<table class="cobranza-ruta-table">
                    <thead>
                        <tr>
                            <th>Cliente</th>
                            <th>ID Crédito</th>
                            <th>Pago Sem.</th>
                            <th>Saldo Rest.</th>
                            <th>Registrar</th>
                        </tr>
                    </thead>
                    <tbody>`;

        creditos.forEach(cred => {
            totalPoblacion += cred.pagoSemanal;
            html += `<tr>
                        <td>${cred.nombreCliente}<br><small>${cred.curpCliente}</small></td>
                        <td>${cred.historicalIdCredito}</td>
                        <td class="monto-pago">$${cred.pagoSemanal.toFixed(2)}</td>
                        <td>$${cred.saldoRestante.toFixed(2)}</td>
                        <td><input type="checkbox" class="pago-grupal-check" data-firestore-id="${cred.firestoreId}" data-monto="${cred.pagoSemanal.toFixed(2)}" data-hist-id="${cred.historicalIdCredito}" data-nombre="${cred.nombreCliente}"></td>
                     </tr>`;
        });

        totalGeneralCalculado += totalPoblacion;
        html += `</tbody>
                 <tfoot>
                     <tr>
                         <td colspan="2"><b>Total Población:</b></td>
                         <td><b>$${totalPoblacion.toFixed(2)}</b></td>
                         <td colspan="2"></td>
                     </tr>
                 </tfoot>
                 </table>`;
        html += `</div>`; // Fin poblacion-group
    });

    // Añadir resumen general al principio
    const resumenGeneral = `
        <div class="info-grid card" style="background: #eef; padding: 15px; margin-bottom: 20px;">
            <div class="info-item">
                <span class="info-label">Ruta:</span>
                <span class="info-value">${currentUserData?.ruta || 'N/A'}</span>
            </div>
             <div class="info-item">
                <span class="info-label">Total Poblaciones:</span>
                <span class="info-value">${poblacionesOrdenadas.length}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Total Clientes Pendientes:</span>
                <span class="info-value">${poblacionesOrdenadas.reduce((sum, pob) => sum + data[pob].length, 0)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Total General Esperado:</span>
                <span class="info-value" style="font-size: 1.1em; font-weight: bold;">$${totalGeneralCalculado.toFixed(2)}</span>
            </div>
        </div>
    `;

    container.innerHTML = resumenGeneral + html;

    // Añadir estilo CSS para la tabla (puedes poner esto en styles.css)
    const style = document.createElement('style');
    style.textContent = `
        .poblacion-group { margin-bottom: 20px; padding: 15px; background: #fff; border: 1px solid #eee; }
        .poblacion-group h3 { margin-bottom: 10px; font-size: 1.1em; color: var(--primary); border-bottom: 1px solid #eee; padding-bottom: 5px;}
        .cobranza-ruta-table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
        .cobranza-ruta-table th, .cobranza-ruta-table td { padding: 6px 4px; border: 1px solid #ddd; text-align: left; vertical-align: middle; }
        .cobranza-ruta-table thead th { background: #f8f9fa; font-weight: bold; }
        .cobranza-ruta-table tbody tr:nth-child(even) { background: #f8f9fa; }
        .cobranza-ruta-table tfoot td { font-weight: bold; background: #e9ecef; }
        .cobranza-ruta-table td:nth-child(3), .cobranza-ruta-table td:nth-child(4), .cobranza-ruta-table th:nth-child(3), .cobranza-ruta-table th:nth-child(4) { text-align: right; }
        .cobranza-ruta-table td:last-child, .cobranza-ruta-table th:last-child { text-align: center; }
        .cobranza-ruta-table input[type="checkbox"] { width: 18px; height: 18px; }
    `;
    document.head.appendChild(style);
}


/**
 * Guarda la lista de cobranza calculada (cobranzaRutaData) en localStorage.
 */
function handleGuardarCobranzaOffline() {
    const statusPagoGrupo = document.getElementById('status_pago_grupo');
    const btnGuardar = document.getElementById('btn-guardar-cobranza-offline');

    if (!cobranzaRutaData || Object.keys(cobranzaRutaData).length === 0) {
        showStatus('status_pago_grupo', 'No hay datos de cobranza calculados para guardar.', 'warning');
        return;
    }
    if (!currentUserData || !currentUserData.ruta || !currentUserData.office) { // <-- CAMBIO DE sucursal A office
         showStatus('status_pago_grupo', 'Error: No se puede identificar la ruta u oficina del usuario...', 'error'); // <-- Mensaje actualizado
        return;
    }

    showButtonLoading(btnGuardar, true, 'Guardando...');
    try {
        const key = OFFLINE_STORAGE_KEY + currentUserData.ruta;
        const dataToSave = {
            ruta: currentUserData.ruta,
            office: currentUserData.office, // <-- CAMBIO DE sucursal A office
            timestamp: new Date().toISOString(),
            data: cobranzaRutaData
        };
        localStorage.setItem(key, JSON.stringify(dataToSave));
        showStatus('status_pago_grupo', `Lista de cobranza para ruta ${currentUserData.ruta} guardada localmente...`, 'success');
    } catch (error) {
        console.error("Error guardando cobranza offline:", error);
        // Podría ser error por JSON grande o localStorage lleno
        showStatus('status_pago_grupo', `Error al guardar localmente: ${error.message}. Es posible que no haya suficiente espacio.`, 'error');
    } finally {
        showButtonLoading(btnGuardar, false);
    }
}

// =============================================
// SECCIÓN DE REPORTES GRÁFICOS (MODIFICADA)
// =============================================

// EN app.js - REEMPLAZA ESTA FUNCIÓN COMPLETA

async function handleGenerarGrafico() {
    if (cargaEnProgreso) {
        showStatus('status_graficos', 'Ya hay una operación en progreso. Por favor, espera.', 'warning');
        return;
    }
    cargaEnProgreso = true;
    showProcessingOverlay(true, 'Generando datos para el gráfico...');
    showButtonLoading('#btn-generar-grafico', true, 'Generando...');
    const statusGraficos = document.getElementById('status_graficos');
    const chartContainer = document.getElementById('grafico-container');
    chartContainer.innerHTML = '';

    try {
        const tipoReporte = document.getElementById('grafico_tipo_reporte').value;
        const fechaInicio = document.getElementById('grafico_fecha_inicio').value;
        const fechaFin = document.getElementById('grafico_fecha_fin').value;

        const oficinaSeleccionada = document.getElementById('grafico_sucursal').value;
        const esAdminConAccesoTotal = (currentUserData?.role === 'Super Admin' || currentUserData?.role === 'Gerencia');

        const grupo = document.getElementById('grafico_grupo').value;
        const agruparPor = document.getElementById('grafico_agrupar_por').value;
        const tipoGrafico = document.getElementById('grafico_tipo_grafico').value;

        if (!tipoReporte || !fechaInicio || !fechaFin) {
            throw new Error("Por favor, selecciona el tipo de reporte y un rango de fechas.");
        }
        if (new Date(fechaInicio) > new Date(fechaFin)) {
            throw new Error("La fecha de inicio no puede ser posterior a la fecha de fin.");
        }

        statusGraficos.textContent = 'Obteniendo datos...';
        statusGraficos.className = 'status-message status-info';

        const { creditos, pagos } = await database.obtenerDatosParaGraficos({
            office: oficinaSeleccionada,
            grupo,
            fechaInicio,
            fechaFin,
            userOffice: esAdminConAccesoTotal ? null : currentUserData?.office
        });

        const coloresPersonalizadosInput = document.getElementById('grafico-colores').value;
            let coloresPersonalizados = [];
            if (coloresPersonalizadosInput) {
            coloresPersonalizados = coloresPersonalizadosInput.split(',').map(c => c.trim()).filter(c => c);
        }

        statusGraficos.textContent = 'Procesando datos para el gráfico...';

        let datasets = [];
        let labels = [];
        let labelPrefix = '';

        const colores = {
            GDL: coloresPersonalizados[0] || 'rgba(46, 139, 87, 0.7)',
            LEON: coloresPersonalizados[1] || 'rgba(30, 144, 255, 0.7)',
            GDL_border: coloresPersonalizados[0] || 'rgba(46, 139, 87, 1)',
            LEON_border: coloresPersonalizados[1] || 'rgba(30, 144, 255, 1)',
            RECUPERADO_GDL: coloresPersonalizados[2] || 'rgba(60, 179, 113, 0.7)',
            RECUPERADO_GDL_border: coloresPersonalizados[2] || 'rgba(60, 179, 113, 1)',
            RECUPERADO_LEON: coloresPersonalizados[3] || 'rgba(30, 144, 255, 0.5)',
            RECUPERADO_LEON_border: coloresPersonalizados[3] || 'rgba(30, 144, 255, 1)',
            default: coloresPersonalizados[0] || 'rgba(46, 139, 87, 0.7)',
            default_border: coloresPersonalizados[0] || 'rgba(46, 139, 87, 1)',
            default_recuperado: coloresPersonalizados[1] || 'rgba(60, 179, 113, 0.7)',
            default_recuperado_border: coloresPersonalizados[1] || 'rgba(60, 179, 113, 1)'
    };

        const agruparDatos = (data, campoFecha, campoValor, filtroOffice = null) => {
            const agrupados = {};
            const datosFiltrados = filtroOffice ? data.filter(item => item.office === filtroOffice) : data;

            datosFiltrados.forEach(item => {
                const fecha = parsearFecha(item[campoFecha]);
                if (!fecha || isNaN(fecha.getTime())) {
                    console.warn("Fecha inválida encontrada:", item[campoFecha], "en item:", item);
                    return;
                }
                let clave;
                const anio = fecha.getUTCFullYear();
                const mes = fecha.getUTCMonth();
                const dia = fecha.getUTCDate();

                if (agruparPor === 'anio') {
                    clave = `${anio}`;
                } else if (agruparPor === 'mes') {
                    clave = `${anio}-${String(mes + 1).padStart(2, '0')}`;
                } else { // semana
                    const fechaInicioSemana = new Date(Date.UTC(anio, mes, dia));
                    fechaInicioSemana.setUTCDate(fechaInicioSemana.getUTCDate() + 4 - (fechaInicioSemana.getUTCDay() || 7));
                    const inicioAnio = new Date(Date.UTC(anio, 0, 1));
                    const semana = Math.ceil((((fechaInicioSemana - inicioAnio) / 86400000) + 1) / 7);
                    clave = `${anio}-S${String(semana).padStart(2, '0')}`;
                }

                if (!agrupados[clave]) agrupados[clave] = 0;
                agrupados[clave] += parseFloat(item[campoValor] || 0);
            });
            return agrupados;
        };

        let dataToProcess = [];
        let campoFecha = '';
        let campoValor = '';
        let dataColocacion = [];
        let dataRecuperacion = [];
        if (tipoReporte === 'colocacion') {
            dataToProcess = creditos;
            campoFecha = 'fechaCreacion';
            campoValor = 'monto';
            labelPrefix = 'Monto Colocado';
        } else if (tipoReporte === 'recuperacion') {
            dataToProcess = pagos;
            campoFecha = 'fecha';
            campoValor = 'monto';
            labelPrefix = 'Monto Recuperado';
        } else if (tipoReporte === 'comportamiento') {
            labelPrefix = 'Monto por Tipo de Pago';
        } else if (tipoReporte === 'colocacion_vs_recuperacion') {
            dataColocacion = creditos;
            dataRecuperacion = pagos;
            labelPrefix = 'Monto';
        }

        if (tipoReporte === 'comportamiento') {
            const oficinasAProcesar = (oficinaSeleccionada === '') ? ['GDL', 'LEON'] : [oficinaSeleccionada];
            let datosAgrupados = {};
            oficinasAProcesar.forEach(suc => {
                const pagosSucursal = (oficinaSeleccionada === '') ? pagos.filter(p => p.office === suc) : pagos;
                pagosSucursal.forEach(pago => {
                    const tipo = (pago.tipoPago || 'normal').toLowerCase();
                    const clave = tipo.charAt(0).toUpperCase() + tipo.slice(1);
                    if (!datosAgrupados[clave]) datosAgrupados[clave] = {};
                    if (!datosAgrupados[clave][suc]) datosAgrupados[clave][suc] = 0;
                    datosAgrupados[clave][suc] += parseFloat(pago.monto || 0);
                });
            });
            labels = Object.keys(datosAgrupados).sort();
            datasets = oficinasAProcesar.map(suc => ({
                label: `${labelPrefix} (${suc})`,
                data: labels.map(label => datosAgrupados[label][suc] || 0),
                backgroundColor: colores[suc],
                borderColor: colores[`${suc}_border`],
                borderWidth: (tipoGrafico === 'line') ? 2 : 1,
                fill: (tipoGrafico === 'line') ? false : true,
                tension: (tipoGrafico === 'line') ? 0.1 : 0
            }));

        } else {
            if (oficinaSeleccionada === '') {
                
                if (tipoReporte === 'colocacion_vs_recuperacion') {
                    const colocadosGDL = agruparDatos(dataColocacion, 'fechaCreacion', 'monto', 'GDL');
                    const colocadosLEON = agruparDatos(dataColocacion, 'fechaCreacion', 'monto', 'LEON');
                    const recuperadosGDL = agruparDatos(dataRecuperacion, 'fecha', 'monto', 'GDL');
                    const recuperadosLEON = agruparDatos(dataRecuperacion, 'fecha', 'monto', 'LEON');
                    
                    labels = [...new Set([...Object.keys(colocadosGDL), ...Object.keys(colocadosLEON), ...Object.keys(recuperadosGDL), ...Object.keys(recuperadosLEON)])].sort();

                    datasets.push({
                        label: `Colocado (GDL)`,
                        data: labels.map(label => colocadosGDL[label] || 0),
                        backgroundColor: colores.GDL, borderColor: colores.GDL_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });
                    datasets.push({
                        label: `Recuperado (GDL)`,
                        data: labels.map(label => recuperadosGDL[label] || 0),
                        backgroundColor: colores.RECUPERADO_GDL, borderColor: colores.RECUPERADO_GDL_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });
                    datasets.push({
                        label: `Colocado (LEON)`,
                        data: labels.map(label => colocadosLEON[label] || 0),
                        backgroundColor: colores.LEON, borderColor: colores.LEON_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });
                    datasets.push({
                        label: `Recuperado (LEON)`,
                        data: labels.map(label => recuperadosLEON[label] || 0),
                        backgroundColor: colores.RECUPERADO_LEON, borderColor: colores.RECUPERADO_LEON_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });

                } else {
                    const datosGDL = agruparDatos(dataToProcess, campoFecha, campoValor, 'GDL');
                    const datosLEON = agruparDatos(dataToProcess, campoFecha, campoValor, 'LEON');
                    labels = [...new Set([...Object.keys(datosGDL), ...Object.keys(datosLEON)])].sort();

                    datasets.push({
                        label: `${labelPrefix} (GDL)`,
                        data: labels.map(label => datosGDL[label] || 0),
                        backgroundColor: colores.GDL, borderColor: colores.GDL_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });
                    datasets.push({
                        label: `${labelPrefix} (LEON)`,
                        data: labels.map(label => datosLEON[label] || 0),
                        backgroundColor: colores.LEON, borderColor: colores.LEON_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });
                }

            } else {
                
                if (tipoReporte === 'colocacion_vs_recuperacion') {
                    const colocados = agruparDatos(dataColocacion, 'fechaCreacion', 'monto');
                    const recuperados = agruparDatos(dataRecuperacion, 'fecha', 'monto');
                    labels = [...new Set([...Object.keys(colocados), ...Object.keys(recuperados)])].sort();

                    datasets.push({
                        label: `Colocado (${oficinaSeleccionada})`,
                        data: labels.map(label => colocados[label] || 0),
                        backgroundColor: colores.default, borderColor: colores.default_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });
                    datasets.push({
                        label: `Recuperado (${oficinaSeleccionada})`,
                        data: labels.map(label => recuperados[label] || 0),
                        backgroundColor: colores.default_recuperado, borderColor: colores.default_recuperado_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });

                } else {
                    const datosAgrupados = agruparDatos(dataToProcess, campoFecha, campoValor);
                    labels = Object.keys(datosAgrupados).sort();
                    datasets.push({
                        label: `${labelPrefix}${oficinaSeleccionada ? ` (${oficinaSeleccionada})` : ''}${grupo ? ` [${grupo}]` : ''}`,
                        data: labels.map(label => datosAgrupados[label]),
                        backgroundColor: colores.default, borderColor: colores.default_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });
                }
            }
        }
       
        if ((tipoGrafico === 'pie' || tipoGrafico === 'doughnut') && datasets.length === 1) {
            datasets[0].backgroundColor = labels.map((_, index) => `hsl(${index * (360 / labels.length)}, 70%, 60%)`);
            datasets[0].borderColor = '#fff';
        }

        if (labels.length === 0) {
            statusGraficos.textContent = 'No se encontraron datos para graficar con los filtros seleccionados.';
            statusGraficos.className = 'status-message status-info';
            return;
        }

        const datosParaGrafico = { labels, datasets };

        chartContainer.innerHTML = '<canvas id="myChart"></canvas>';
        const ctx = document.getElementById('myChart').getContext('2d');

        if (currentChart) {
            currentChart.destroy();
        }

        currentChart = new Chart(ctx, {
            type: tipoGrafico,
            data: datosParaGrafico,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: `Gráfico de ${labelPrefix}` },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                const value = (tipoGrafico === 'pie' || tipoGrafico === 'doughnut') ? context.parsed : context.parsed.y;
                                if (value !== null) {
                                    label += new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: !(tipoGrafico === 'pie' || tipoGrafico === 'doughnut'),
                        title: { display: true, text: (tipoReporte === 'comportamiento') ? 'Tipo de Pago' : (agruparPor.charAt(0).toUpperCase() + agruparPor.slice(1)) }
                    },
                    y: {
                        display: !(tipoGrafico === 'pie' || tipoGrafico === 'doughnut'),
                        beginAtZero: true,
                        title: { display: true, text: 'Monto ($)' },
                        ticks: {
                            callback: function (value) {
                                return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value);
                            }
                        }
                    }
                }
            }
        });

        statusGraficos.textContent = 'Gráfico generado exitosamente.';
        statusGraficos.className = 'status-message status-success';

    } catch (error) {
        console.error("Error al generar el gráfico:", error);
        statusGraficos.textContent = `Error al generar gráfico: ${error.message}`;
        statusGraficos.className = 'status-message status-error';
        if (currentChart) {
            currentChart.destroy();
            currentChart = null;
        }
        chartContainer.innerHTML = '<p style="text-align: center; color: var(--danger);">No se pudo generar el gráfico.</p>';
    } finally {
        cargaEnProgreso = false;
        showProcessingOverlay(false);
        showButtonLoading('#btn-generar-grafico', false);
    }
}

// EN app.js: REEMPLAZA TODA LA SECCIÓN DE "NUEVA INTERFAZ DE GESTIÓN - CONFIGURACIÓN" CON ESTO

// =============================================
// NUEVA INTERFAZ DE GESTIÓN - CONFIGURACIÓN (REHECHA)
// =============================================

/**
 * Carga la nueva interfaz de gestión de poblaciones y rutas (Entry Point)
 * Se llama cuando se muestra 'view-configuracion'.
*/
async function loadConfiguracion() {
    console.log("🚀 EJECUTANDO loadConfiguracion - INICIO");
    const statusEl = 'status_configuracion';
    
    // 1. Verificar permisos de acceso
    if (!currentUserData || !['Super Admin', 'Gerencia', 'Administrador'].includes(currentUserData.role)) {
        showStatus(statusEl, 'No tienes permisos para acceder a esta sección.', 'error');
        return;
    }

    // Determinar filtro de oficina
    let officeFiltro = null;
    if (currentUserData.role === 'Administrador' && currentUserData.office && currentUserData.office !== 'AMBAS') {
        officeFiltro = currentUserData.office;
    }
    
    console.log(`📍 Filtro oficina: ${officeFiltro || 'TODAS'}`);
    showStatus(statusEl, 'Cargando catálogos...', 'info');

    try {
        console.log("📋 Cargando interfaz de poblaciones...");
        await cargarInterfazPoblaciones(officeFiltro);
        
        console.log("🛣️ Cargando interfaz de rutas...");
        await cargarInterfazRutas(officeFiltro);
        
        console.log("🔧 Configurando tabs...");
        setupNuevosTabsConfiguracion();
        
        showStatus(statusEl, '✅ Catálogos cargados correctamente', 'success');
        console.log("🎉 loadConfiguracion - COMPLETADO EXITOSAMENTE");
        
    } catch (error) {
        console.error("❌ Error en loadConfiguracion:", error);
        showStatus(statusEl, `❌ Error al cargar: ${error.message}`, 'error');
    }
}

/**
 * Configura los botones de las pestañas "Poblaciones" y "Rutas"
 */
function setupNuevosTabsConfiguracion() {
    // Remover listeners antiguos para evitar duplicados
    const tabsContainer = document.querySelector('#view-configuracion .tabs');
    if (tabsContainer) {
        const newTabsContainer = tabsContainer.cloneNode(true);
        tabsContainer.parentNode.replaceChild(newTabsContainer, tabsContainer);
    }

    document.querySelectorAll('#view-configuracion .tab-button').forEach(button => {
        button.addEventListener('click', function() {
            // Remover active de todos los botones
            document.querySelectorAll('#view-configuracion .tab-button').forEach(btn => btn.classList.remove('active'));
            // Ocultar todos los contenidos
            document.querySelectorAll('#view-configuracion .tab-content').forEach(content => content.classList.remove('active'));
            
            // Activar el botón clickeado
            this.classList.add('active');
            // Mostrar el contenido correspondiente
            const tabId = this.getAttribute('data-tab');
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });
    console.log("Listeners de Tabs de Configuración aplicados.");
}

// =============================================
// LÓGICA DE POBLACIONES
// =============================================

/**
 * Carga la interfaz de la pestaña "Poblaciones"
 * @param {string | null} officeFiltro - 'GDL', 'LEON', o null (para todos)
*/
async function cargarInterfazPoblaciones(officeFiltro) {
    const container = document.getElementById('tabla-poblaciones-container');
    if (!container) {
        console.error("No se encontró el contenedor de poblaciones");
        return;
    }

    console.log("=== DEBUG CARGAR POBLACIONES ===");
    console.log("Office filtro:", officeFiltro);
    
    container.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner"></div><p>Cargando poblaciones...</p></div>`;

    try {
        console.log("Llamando a database.obtenerPoblaciones...");
        const poblaciones = await database.obtenerPoblaciones(officeFiltro);
        console.log("Poblaciones obtenidas:", poblaciones);
        
        if (!poblaciones || !Array.isArray(poblaciones)) {
            throw new Error("Datos de poblaciones inválidos: " + typeof poblaciones);
        }

        console.log(`Se obtuvieron ${poblaciones.length} poblaciones`);
        
        // 1. Construir el Header
        const headerHTML = `
            <div class="config-header">
                <h3>Poblaciones (${poblaciones.length})</h3>
                <div class="header-actions">
                    <div class="search-box">
                        <input type="text" id="search-poblaciones" placeholder="Buscar población..." class="form-control">
                        <i class="fas fa-search"></i>
                    </div>
                    <button class="btn btn-success" onclick="mostrarModalPoblacion()">
                        <i class="fas fa-plus"></i> Nueva Población
                    </button>
                </div>
            </div>
        `;

        // 2. Mostrar estado vacío si no hay datos
        if (poblaciones.length === 0) {
            container.innerHTML = headerHTML + `
                <div class="empty-state">
                    <i class="fas fa-map-marker-alt"></i>
                    <h3>No hay poblaciones registradas</h3>
                    <p>No se encontraron poblaciones ${officeFiltro ? `para tu oficina (${officeFiltro})` : 'en el sistema'}.</p>
                </div>
            `;
            configurarBusquedaPoblaciones();
            return;
        }

        // 3. Agrupar poblaciones por oficina
        const poblacionesPorOficina = {};
        const oficinasAMostrar = [];

        if (officeFiltro) {
            poblacionesPorOficina[officeFiltro] = poblaciones;
            oficinasAMostrar.push(officeFiltro);
        } else {
            poblacionesPorOficina['GDL'] = poblaciones.filter(p => p.office === 'GDL');
            poblacionesPorOficina['LEON'] = poblaciones.filter(p => p.office === 'LEON');
            poblacionesPorOficina['OTROS'] = poblaciones.filter(p => p.office !== 'GDL' && p.office !== 'LEON');
            oficinasAMostrar.push('GDL', 'LEON', 'OTROS');
        }

        // 4. Construir HTML de la lista
        let html = headerHTML;
        
        // Añadir pestañas de filtro GDL/LEON solo si es admin total
        if (!officeFiltro) {
            html += `
                <div class="filter-tabs">
                    <button class="filter-tab active" data-office="all">Todas</button>
                    <button class="filter-tab" data-office="GDL">Guadalajara</button>
                    <button class="filter-tab" data-office="LEON">León</button>
                    <button class="filter-tab" data-office="OTROS">Sin Asignar / Otros</button>
                </div>
            `;
        }
        
        html += `<div class="poblaciones-grid">`;

        for (const office of oficinasAMostrar) {
            const poblacionesOffice = poblacionesPorOficina[office];
            
            if (poblacionesOffice && poblacionesOffice.length > 0) {
                let officeTitle = office;
                if(office === 'OTROS') officeTitle = 'Sin Asignar / Otros';
                else if (office === 'GDL') officeTitle = 'Guadalajara';
                else if (office === 'LEON') officeTitle = 'León';

                html += `<div class="office-section" data-office="${office}">`;
                if (!officeFiltro) {
                    html += `<h4 class="office-title">${officeTitle} (${poblacionesOffice.length})</h4>`;
                }
                html += `<div class="poblaciones-list">`;
                
                // Ordenar alfabéticamente
                poblacionesOffice.sort((a,b) => (a.nombre || '').localeCompare(b.nombre || ''));
                
                poblacionesOffice.forEach(poblacion => {
                    html += crearTarjetaPoblacion(poblacion);
                });
                
                html += `</div></div>`;
            }
        }

        html += `</div>`;
        container.innerHTML = html;

        // 5. Activar listeners
        configurarBusquedaPoblaciones();
        if (!officeFiltro) {
            configurarFiltrosPoblaciones();
        }

    } catch (error) {
        console.error("ERROR en cargarInterfazPoblaciones:", error);
        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle fa-2x"></i>
                <h3>Error al cargar las poblaciones</h3>
                <p>${error.message}</p>
                <button class="btn btn-secondary" onclick="cargarInterfazPoblaciones('${officeFiltro}')">
                    <i class="fas fa-redo"></i> Reintentar
                </button>
            </div>
        `;
    }
}

/**
 * Helper: Crea el HTML para una tarjeta de población
 */
function crearTarjetaPoblacion(poblacion) {
    const id = poblacion.id || 'ID_DESCONOCIDO';
    const nombre = poblacion.nombre || 'SIN NOMBRE';
    const office = poblacion.office || 'OTROS';
    const ruta = poblacion.ruta || '';

    const displayOffice = (office === 'GDL' || office === 'LEON') ? office : 'OTROS';

    const rutaDisplay = ruta
        ? `<span class="ruta-tag" title="Ruta asignada">${ruta}</span>`
        : `<span class="no-ruta-tag" title="Sin ruta asignada">Sin ruta</span>`;

    return `
        <div class="poblacion-card" data-id="${id}" data-office="${displayOffice}" data-nombre="${nombre.toLowerCase()}">
            <div class="poblacion-header">
                <h5 class="poblacion-nombre">${nombre}</h5>
                <span class="office-badge ${displayOffice}">${displayOffice}</span>
            </div>
            <div class="poblacion-content">
                <div class="ruta-asignacion">
                    ${rutaDisplay}
                </div>
            </div>
            <div class="poblacion-actions">
                <button class="btn btn-sm btn-outline-primary btn-asignar-ruta" 
                        data-id="${id}" 
                        data-nombre="${nombre}" 
                        data-office="${office}"
                        title="Asignar/Cambiar Ruta">
                    <i class="fas fa-route"></i> Asignar Ruta
                </button>
                <button class="btn btn-sm btn-outline-danger btn-eliminar-poblacion" 
                        data-id="${id}" 
                        data-nombre="${nombre}"
                        title="Eliminar Población">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

/**
 * Configura la búsqueda en tiempo real para poblaciones
 */
function configurarBusquedaPoblaciones() {
    const searchInput = document.getElementById('search-poblaciones');
    if (!searchInput) return;

    // Prevenir listeners duplicados
    searchInput.replaceWith(searchInput.cloneNode(true));
    document.getElementById('search-poblaciones').addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        const cards = document.querySelectorAll('#tab-poblaciones .poblacion-card');
        const activeFilter = document.querySelector('#tab-poblaciones .filter-tab.active')?.getAttribute('data-office') || 'all';
        
        let visibleCount = 0;
        cards.forEach(card => {
            const nombre = card.getAttribute('data-nombre');
            const office = card.getAttribute('data-office');
            const matchesSearch = !searchTerm || nombre.includes(searchTerm);
            const matchesFilter = activeFilter === 'all' || office === activeFilter;
            
            if (matchesSearch && matchesFilter) {
                card.style.display = 'flex';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        // Ocultar secciones de oficina si quedan vacías (para Super Admin)
        document.querySelectorAll('#tab-poblaciones .office-section').forEach(section => {
            const visibleCardsInSection = section.querySelectorAll('.poblacion-card[style*="display: flex"]').length;
            section.style.display = visibleCardsInSection > 0 ? 'block' : 'none';
        });
    });
}

/**
 * Configura los filtros por oficina (GDL, LEON, etc.) para poblaciones
 */
function configurarFiltrosPoblaciones() {
    document.querySelectorAll('#tab-poblaciones .filter-tab').forEach(tab => {
        // Prevenir listeners duplicados
        const newTab = tab.cloneNode(true);
        tab.parentNode.replaceChild(newTab, tab);
        
        newTab.addEventListener('click', function() {
            document.querySelectorAll('#tab-poblaciones .filter-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Disparar el evento 'input' de la búsqueda para re-filtrar todo
            const searchInput = document.getElementById('search-poblaciones');
            searchInput.dispatchEvent(new Event('input'));
        });
    });
}

// =============================================
// LÓGICA DE RUTAS
// =============================================

/**
 * Carga la interfaz de la pestaña "Rutas"
 * @param {string | null} officeFiltro - 'GDL', 'LEON', o null (para todos)
*/
async function cargarInterfazRutas(officeFiltro) {
    const container = document.getElementById('tabla-rutas-container');
    if (!container) {
        console.error("No se encontró el contenedor de rutas");
        return;
    }

    console.log("=== DEBUG CARGAR RUTAS ===");
    console.log("Office filtro:", officeFiltro);
    
    container.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner"></div><p>Cargando rutas...</p></div>`;

    try {
        console.log("Llamando a database.obtenerRutas...");
        const rutas = await database.obtenerRutas(officeFiltro);
        console.log("Rutas obtenidas:", rutas);
        
        if (!rutas || !Array.isArray(rutas)) {
            throw new Error("Datos de rutas inválidos: " + typeof rutas);
        }

        console.log(`Se obtuvieron ${rutas.length} rutas`);
        
        // 1. Construir el Header
        const headerHTML = `
            <div class="config-header">
                <h3>Rutas (${rutas.length})</h3>
                <div class="header-actions">
                    <div class="search-box">
                        <input type="text" id="search-rutas" placeholder="Buscar ruta..." class="form-control">
                        <i class="fas fa-search"></i>
                    </div>
                    <button class="btn btn-success" onclick="mostrarModalRuta()">
                        <i class="fas fa-plus"></i> Nueva Ruta
                    </button>
                </div>
            </div>
        `;

        // 2. Mostrar estado vacío si no hay datos
        if (rutas.length === 0) {
            container.innerHTML = headerHTML + `
                <div class="empty-state">
                    <i class="fas fa-route"></i>
                    <h3>No hay rutas registradas</h3>
                    <p>No se encontraron rutas ${officeFiltro ? `para tu oficina (${officeFiltro})` : 'en el sistema'}.</p>
                </div>
            `;
            configurarBusquedaRutas();
            return;
        }

        // 3. Agrupar rutas por oficina
        const rutasPorOficina = {};
        const oficinasAMostrar = [];

        if (officeFiltro) {
            rutasPorOficina[officeFiltro] = rutas;
            oficinasAMostrar.push(officeFiltro);
        } else {
            rutasPorOficina['GDL'] = rutas.filter(r => r.office === 'GDL');
            rutasPorOficina['LEON'] = rutas.filter(r => r.office === 'LEON');
            rutasPorOficina['OTROS'] = rutas.filter(r => r.office !== 'GDL' && r.office !== 'LEON');
            oficinasAMostrar.push('GDL', 'LEON', 'OTROS');
        }

        // 4. Construir HTML de la lista
        let html = headerHTML + `<div class="rutas-grid">`;

        for (const office of oficinasAMostrar) {
            const rutasOffice = rutasPorOficina[office];
            
            if (rutasOffice && rutasOffice.length > 0) {
                let officeTitle = office;
                if(office === 'OTROS') officeTitle = 'Sin Asignar / Otros';
                else if (office === 'GDL') officeTitle = 'Guadalajara';
                else if (office === 'LEON') officeTitle = 'León';

                html += `<div class="office-section" data-office="${office}">`;
                if (!officeFiltro) {
                    html += `<h4 class="office-title">${officeTitle} (${rutasOffice.length})</h4>`;
                }
                html += `<div class="rutas-list">`;
                
                // Ordenar alfabéticamente
                rutasOffice.sort((a,b) => (a.nombre || '').localeCompare(b.nombre || ''));
                
                rutasOffice.forEach(ruta => {
                    html += crearTarjetaRuta(ruta);
                });
                
                html += `</div></div>`;
            }
        }

        html += `</div>`;
        container.innerHTML = html;

        // 5. Activar listeners
        configurarBusquedaRutas();
        configurarEdicionRutas();
    
    } catch (error) {
        console.error("ERROR en cargarInterfazRutas:", error);
        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle fa-2x"></i>
                <h3>Error al cargar las rutas</h3>
                <p>${error.message}</p>
                <button class="btn btn-secondary" onclick="cargarInterfazRutas('${officeFiltro}')">
                    <i class="fas fa-redo"></i> Reintentar
                </button>
            </div>
        `;
    }
}

/**
Listener a todos los botones de "Editar" de las rutas
*/
function configurarEdicionRutas() {
    document.querySelectorAll('#tab-rutas .btn-editar-ruta').forEach(btn => {
        // Prevenir listeners duplicados
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', function() {
            const card = this.closest('.ruta-card');
            const nombreElement = card.querySelector('.ruta-nombre-editable');
            const originalNombre = nombreElement.textContent.trim();
            
            // Guardar nombre original en el botón cancelar
            card.querySelector('.btn-cancelar-ruta').setAttribute('data-original-nombre', originalNombre);

            // Activar edición
            nombreElement.contentEditable = true;
            nombreElement.classList.add('editing');
            nombreElement.focus();
            document.execCommand('selectAll',false,null); // Seleccionar texto

            // Mostrar/ocultar botones
            this.classList.add('hidden');
            card.querySelector('.btn-guardar-ruta').classList.remove('hidden');
            card.querySelector('.btn-cancelar-ruta').classList.remove('hidden');
            card.querySelector('.btn-outline-danger').classList.add('hidden'); // Ocultar eliminar
        });
    });

    // Configurar botones de cancelar
    document.querySelectorAll('#tab-rutas .btn-cancelar-ruta').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', function() {
            const card = this.closest('.ruta-card');
            const nombreElement = card.querySelector('.ruta-nombre-editable');
            const originalNombre = this.getAttribute('data-original-nombre');
            
            nombreElement.textContent = originalNombre;
            nombreElement.contentEditable = false;
            nombreElement.classList.remove('editing');
            
            this.classList.add('hidden');
            card.querySelector('.btn-guardar-ruta').classList.add('hidden');
            card.querySelector('.btn-editar-ruta').classList.remove('hidden');
            card.querySelector('.btn-outline-danger').classList.remove('hidden');
        });
    });

    // Configurar botones de guardar
    document.querySelectorAll('#tab-rutas .btn-guardar-ruta').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', async function() {
            const card = this.closest('.ruta-card');
            const nombreElement = card.querySelector('.ruta-nombre-editable');
            const rutaId = card.getAttribute('data-id');
            const nuevoNombre = nombreElement.textContent.trim().toUpperCase();
            const originalNombre = card.querySelector('.btn-cancelar-ruta').getAttribute('data-original-nombre');

            if (!nuevoNombre) {
                showStatus('status_configuracion', 'El nombre de la ruta no puede estar vacío.', 'error');
                nombreElement.focus();
                return;
            }

            if (nuevoNombre === originalNombre.toUpperCase()) {
                // No hay cambios, solo cancelar
                card.querySelector('.btn-cancelar-ruta').click();
                return;
            }

            showProcessingOverlay(true, 'Actualizando ruta...');
            const resultado = await database.actualizarNombreRuta(rutaId, nuevoNombre);
            showProcessingOverlay(false);

            if (resultado.success) {
                showStatus('status_configuracion', 'Ruta actualizada. Se recargarán ambas listas.', 'success');
                // Recargar todo para reflejar el cambio en las poblaciones
                await loadConfiguracion(); 
            } else {
                showStatus('status_configuracion', `Error: ${resultado.message}`, 'error');
                card.querySelector('.btn-cancelar-ruta').click(); // Revertir
            }
        });
    });
}

/**
 * Helper: Crea el HTML para una tarjeta de ruta
 */
function crearTarjetaRuta(ruta) {
    const id = ruta.id || 'ID_DESCONOCIDO';
    const nombre = ruta.nombre || 'SIN NOMBRE';
    const office = ruta.office || 'OTROS';
    const displayOffice = (office === 'GDL' || office === 'LEON') ? office : 'OTROS';
    const nombreEscapado = String(nombre).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

    return `
        <div class="ruta-card" data-id="${id}" data-office="${displayOffice}" data-nombre="${nombre.toLowerCase()}">
            <div class="ruta-header">
                <div class="ruta-nombre-editable" contenteditable="false">${nombre}</div>
                <span class="office-badge ${displayOffice}">${displayOffice}</span>
            </div>
            <div class="ruta-actions">
                <button class="btn btn-sm btn-outline-info btn-editar-ruta" title="Editar Nombre">
                    <i class="fas fa-edit"></i> Editar
                </button>
                                <button class="btn btn-sm btn-outline-success btn-guardar-ruta hidden" title="Guardar">
                    <i class="fas fa-check"></i> Guardar
                </button>
                <button class="btn btn-sm btn-outline-secondary btn-cancelar-ruta hidden" title="Cancelar" data-original-nombre="${nombreEscapado}">
                    <i class="fas fa-times"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarRuta('${id}', '${nombreEscapado}', '${office}')" title="Eliminar Ruta">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

/**
 * Configura la búsqueda en tiempo real para rutas
 */
function configurarBusquedaRutas() {
    const searchInput = document.getElementById('search-rutas');
    if (!searchInput) return;
    
    // Prevenir listeners duplicados
    searchInput.replaceWith(searchInput.cloneNode(true));
    document.getElementById('search-rutas').addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        const cards = document.querySelectorAll('#tab-rutas .ruta-card');
        
        cards.forEach(card => {
            const nombre = card.getAttribute('data-nombre');
            const matchesSearch = !searchTerm || nombre.includes(searchTerm);
            card.style.display = matchesSearch ? 'flex' : 'none';
        });

        // Ocultar secciones de oficina si quedan vacías
        document.querySelectorAll('#tab-rutas .office-section').forEach(section => {
            const visibleCardsInSection = section.querySelectorAll('.ruta-card[style*="display: flex"]').length;
            section.style.display = visibleCardsInSection > 0 ? 'block' : 'none';
        });
    });
}

// =============================================
// LÓGICA DE MODALES Y ACCIONES (CRUD)
// =============================================

/**
 * Muestra modal para agregar nueva población
 */
function mostrarModalPoblacion() {
    const userRole = currentUserData?.role;
    const userOffice = currentUserData?.office;
    const isAdminRestringido = (userRole === 'Administrador' && userOffice && userOffice !== 'AMBAS');
    
    let officeOptionsHTML = '';
    if (isAdminRestringido) {
        // Opción única, bloqueada
        officeOptionsHTML = `<option value="${userOffice}" selected>${userOffice}</option>`;
    } else {
        // Opciones para Super Admin/Gerencia
        officeOptionsHTML = `
            <option value="" selected disabled>Selecciona una oficina...</option>
            <option value="GDL">Guadalajara</option>
            <option value="LEON">León</option>
        `;
    }

    document.getElementById('modal-title').textContent = 'Nueva Población';
    document.getElementById('modal-body').innerHTML = `
        <form id="form-nueva-poblacion">
            <div class="form-group">
                <label for="modal-poblacion-nombre">Nombre de la Población:</label>
                <input type="text" id="modal-poblacion-nombre" class="form-control" required 
                       placeholder="Ej: Colonia Centro, Villa Jardín...">
            </div>
            <div class="form-group">
                <label for="modal-poblacion-office">Sucursal:</label>
                <select id="modal-poblacion-office" class="form-control" required ${isAdminRestringido ? 'disabled' : ''}>
                    ${officeOptionsHTML}
                </select>
            </div>
            <div class="modal-actions">
                <button type="submit" class="btn btn-success"><i class="fas fa-save"></i> Guardar</button>
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('generic-modal').classList.add('hidden')">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            </div>
        </form>
    `;
    
    const form = document.getElementById('form-nueva-poblacion');
    form.onsubmit = (e) => {
        e.preventDefault();
        agregarPoblacionDesdeModal();
    };
    
    document.getElementById('generic-modal').classList.remove('hidden');
    document.getElementById('modal-poblacion-nombre').focus();
}

/**
 * Muestra modal para agregar nueva ruta
 */
function mostrarModalRuta() {
    const userRole = currentUserData?.role;
    const userOffice = currentUserData?.office;
    const isAdminRestringido = (userRole === 'Administrador' && userOffice && userOffice !== 'AMBAS');
    
    let officeOptionsHTML = '';
    if (isAdminRestringido) {
        officeOptionsHTML = `<option value="${userOffice}" selected>${userOffice}</option>`;
    } else {
        officeOptionsHTML = `
            <option value="" selected disabled>Selecciona una oficina...</option>
            <option value="GDL">Guadalajara</option>
            <option value="LEON">León</option>
        `;
    }

    document.getElementById('modal-title').textContent = 'Nueva Ruta';
    document.getElementById('modal-body').innerHTML = `
        <form id="form-nueva-ruta">
            <div class="form-group">
                <label for="modal-ruta-nombre">Nombre de la Ruta:</label>
                <input type="text" id="modal-ruta-nombre" class="form-control" required 
                       placeholder="Ej: Ruta Norte, Ruta Centro...">
            </div>
            <div class="form-group">
                <label for="modal-ruta-office">Sucursal:</label>
                <select id="modal-ruta-office" class="form-control" required ${isAdminRestringido ? 'disabled' : ''}>
                    ${officeOptionsHTML}
                </select>
            </div>
            <div class="modal-actions">
                <button type="submit" class="btn btn-success"><i class="fas fa-save"></i> Guardar</button>
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('generic-modal').classList.add('hidden')">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            </div>
        </form>
    `;
    
    const form = document.getElementById('form-nueva-ruta');
    form.onsubmit = (e) => {
        e.preventDefault();
        agregarRutaDesdeModal();
    };
    
    document.getElementById('generic-modal').classList.remove('hidden');
    document.getElementById('modal-ruta-nombre').focus();
}

/**
 * Procesa el guardado de la nueva población desde el modal
 */
async function agregarPoblacionDesdeModal() {
    const nombreInput = document.getElementById('modal-poblacion-nombre');
    const officeInput = document.getElementById('modal-poblacion-office');
    const nombre = nombreInput.value.trim();
    const office = officeInput.value;

    if (!nombre || !office) {
        alert('Por favor completa todos los campos');
        return;
    }

    showProcessingOverlay(true, 'Agregando población...');
    try {
        const resultado = await database.agregarPoblacion(nombre, office);
        
        if (resultado.success) {
            document.getElementById('generic-modal').classList.add('hidden');
            showStatus('status_configuracion', 'Población agregada correctamente', 'success');
            // Recargar solo la pestaña de poblaciones
            const officeFiltro = (currentUserData.role === 'Administrador' && currentUserData.office !== 'AMBAS') ? currentUserData.office : null;
            await cargarInterfazPoblaciones(officeFiltro);
        } else {
            throw new Error(resultado.message);
        }
    } catch (error) {
        console.error("Error agregando población:", error);
        alert(`Error: ${error.message}`); // Mostrar error en el modal
    } finally {
        showProcessingOverlay(false);
    }
}

/**
 * Procesa el guardado de la nueva ruta desde el modal
 */
async function agregarRutaDesdeModal() {
    const nombreInput = document.getElementById('modal-ruta-nombre');
    const officeInput = document.getElementById('modal-ruta-office');
    const nombre = nombreInput.value.trim();
    const office = officeInput.value;

    if (!nombre || !office) {
        alert('Por favor completa todos los campos');
        return;
    }

    showProcessingOverlay(true, 'Agregando ruta...');
    try {
        const resultado = await database.agregarRuta(nombre, office);
        
        if (resultado.success) {
            document.getElementById('generic-modal').classList.add('hidden');
            showStatus('status_configuracion', 'Ruta agregada correctamente', 'success');
            // Recargar solo la pestaña de rutas
            const officeFiltro = (currentUserData.role === 'Administrador' && currentUserData.office !== 'AMBAS') ? currentUserData.office : null;
            await cargarInterfazRutas(officeFiltro);
        } else {
            throw new Error(resultado.message);
        }
    } catch (error) {
        console.error("Error agregando ruta:", error);
        alert(`Error: ${error.message}`);
    } finally {
        showProcessingOverlay(false);
    }
}

/**
 * Muestra modal para ASIGNAR una ruta a una población
 */
async function asignarRutaPoblacion(poblacionId, poblacionNombre, poblacionOffice) {
    console.log("=== ASIGNAR RUTA POBLACIÓN ===");
    console.log("Población ID:", poblacionId);
    console.log("Población Nombre:", poblacionNombre);
    console.log("Población Office:", poblacionOffice);
    
    showProcessingOverlay(true, 'Cargando rutas disponibles...');
    try {
        // Obtener rutas disponibles SOLO para esta oficina
        const rutasDisponibles = await database.obtenerRutas(poblacionOffice);
        const opcionesRutas = rutasDisponibles.map(r => r.nombre).sort();

        let selectHTML = `
            <div class="asignacion-ruta-modal">
                <p>Asignar ruta a: <strong>${poblacionNombre}</strong> (${poblacionOffice})</p>
                
                <div class="form-group" style="text-align: left;">
                    <label for="ruta-poblacion-select">Selecciona la ruta:</label>
                    <select id="ruta-poblacion-select" class="form-control">
                        <option value="">-- Sin asignar --</option>
        `;

        opcionesRutas.forEach(rutaNombre => {
            selectHTML += `<option value="${rutaNombre}">${rutaNombre}</option>`;
        });

        selectHTML += `
                    </select>
                </div>
                
                <div class="modal-actions">
                    <button id="btn-confirmar-ruta-poblacion" class="btn btn-success">
                        <i class="fas fa-save"></i> Guardar
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('generic-modal').classList.add('hidden')">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>
            </div>
        `;

        showProcessingOverlay(false);
        document.getElementById('modal-title').textContent = 'Asignar Ruta';
        document.getElementById('modal-body').innerHTML = selectHTML;
        document.getElementById('generic-modal').classList.remove('hidden');
        const btnConfirmar = document.getElementById('btn-confirmar-ruta-poblacion');
        btnConfirmar.replaceWith(btnConfirmar.cloneNode(true));
        const nuevoBtnConfirmar = document.getElementById('btn-confirmar-ruta-poblacion');
        nuevoBtnConfirmar.onclick = async () => {
            const nuevaRuta = document.getElementById('ruta-poblacion-select').value || null;
            showProcessingOverlay(true, 'Asignando ruta...');
            try {
                const resultado = await database.asignarRutaAPoblacion(poblacionId, nuevaRuta);
                if (resultado.success) {
                    document.getElementById('generic-modal').classList.add('hidden');
                    showStatus('status_configuracion', resultado.message, 'success');
                    const officeFiltro = (currentUserData.role === 'Administrador' && currentUserData.office !== 'AMBAS') ? currentUserData.office : null;
                    await cargarInterfazPoblaciones(officeFiltro);
                } else {
                    throw new Error(resultado.message);
                }
            } catch (error) {
                console.error("Error asignando ruta:", error);
                alert(`Error: ${error.message}`);
            } finally {
                showProcessingOverlay(false);
            }
        };
    } catch (error) {
        console.error("Error en asignarRutaPoblacion:", error);
        showProcessingOverlay(false);
        alert(`Error al cargar rutas: ${error.message}`);
    }
}

/**
 * Elimina una población
 */
async function eliminarPoblacion(id, nombre) {
    if (!confirm(`¿Estás seguro de que deseas eliminar la población "${nombre}"?\nEsta acción no se puede deshacer.`)) {
        return;
    }

    showProcessingOverlay(true, 'Eliminando población...');
    try {
        const resultado = await database.eliminarPoblacion(id);
        
        if (resultado.success) {
            showStatus('status_configuracion', `Población "${nombre}" eliminada correctamente`, 'success');
            const officeFiltro = (currentUserData.role === 'Administrador' && currentUserData.office !== 'AMBAS') ? currentUserData.office : null;
            await cargarInterfazPoblaciones(officeFiltro);
        } else {
            throw new Error(resultado.message);
        }
    } catch (error) {
        console.error("Error eliminando población:", error);
        showStatus('status_configuracion', `Error: ${error.message}`, 'error');
    } finally {
        showProcessingOverlay(false);
    }
}

/**
 * Elimina una ruta
 */
async function eliminarRuta(id, nombre, office) {
    if (!confirm(`¿Estás seguro de que deseas eliminar la ruta "${nombre}"?\nEsta acción también la quitará de todas las poblaciones asignadas.`)) {
        return;
    }

    showProcessingOverlay(true, 'Eliminando ruta...');
    try {
        // La nueva función de DB ya se encarga de des-asignar
        const resultado = await database.eliminarRuta(id, nombre, office);
        
        if (resultado.success) {
            showStatus('status_configuracion', `Ruta "${nombre}" eliminada y des-asignada.`, 'success');
            // Recargar AMBAS pestañas
            await loadConfiguracion(); 
        } else {
            throw new Error(resultado.message);
        }
    } catch (error) {
        console.error("Error eliminando ruta:", error);
        showStatus('status_configuracion', `Error: ${error.message}`, 'error');
    } finally {
        showProcessingOverlay(false);
    }
}


// =============================================
// FUNCIONES DE VISTA Y AUXILIARES GENERALES
// =============================================

function showView(viewId) {
    console.log(`Navegando a vista: ${viewId}`);
    
    // Ocultar todas las vistas
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
        console.log(`Vista ${viewId} mostrada.`);
        
        // EJECUTAR CÓDIGO ESPECÍFICO PARA CADA VISTA
        switch(viewId) {
            case 'view-configuracion':
                console.log('🚀 EJECUTANDO loadConfiguracion AUTOMÁTICAMENTE');
                // Pequeño delay para asegurar que el DOM esté listo
                setTimeout(() => {
                    loadConfiguracion();
                }, 100);
                break;
                
            case 'view-reportes':
                loadBasicReports(currentUserData?.office);
                break;
                
            case 'view-reportes-avanzados':
                inicializarVistaReportesAvanzados();
                break;
                
            case 'view-gestion-clientes':
                inicializarVistaGestionClientes();
                break;
                
            case 'view-cliente':
                if (!editingClientId) { resetClientForm(); }
                break;
                
            case 'view-colocacion':
                document.getElementById('curp_colocacion').value = '';
                document.getElementById('form-colocacion').classList.add('hidden');
                showStatus('status_colocacion', 'Ingresa la CURP del cliente para buscar.', 'info');
                document.getElementById('plazo_colocacion').disabled = false;
                document.getElementById('tipo_colocacion').disabled = false;
                break;
                
            case 'view-cobranza':
                document.getElementById('idCredito_cobranza').value = '';
                document.getElementById('form-cobranza').classList.add('hidden');
                showStatus('status_cobranza', 'Ingresa el ID del crédito (histórico) para buscar.', 'info');
                creditoActual = null;
                break;
                
            case 'view-pago-grupo':
                // Tu código existente para pago grupal
                const statusPagoGrupo = document.getElementById('status_pago_grupo');
                const btnCalcular = document.getElementById('btn-calcular-cobranza-ruta');
                const btnGuardar = document.getElementById('btn-guardar-cobranza-offline');
                const btnRegistrar = document.getElementById('btn-registrar-pagos-offline');
                const container = document.getElementById('cobranza-ruta-container');
                const placeholder = document.getElementById('cobranza-ruta-placeholder');

                container.innerHTML = '';
                placeholder.classList.remove('hidden');
                placeholder.textContent = 'Presiona "Calcular Cobranza" (requiere conexión) o carga una lista guardada si estás offline.';
                btnGuardar.classList.add('hidden');
                btnRegistrar.classList.add('hidden');
                cobranzaRutaData = null;

                if (!currentUserData || !currentUserData.ruta || !currentUserData.office || currentUserData.office === 'AMBAS') {
                    showStatus('status_pago_grupo', 'Debes tener una ruta y oficina única asignada.', 'warning');
                    btnCalcular.disabled = true;
                    placeholder.textContent = 'Función no disponible: Ruta/Oficina no asignada.';
                    break;
                }

                if (navigator.onLine) {
                    showStatus('status_pago_grupo', `Listo para calcular cobranza de ruta ${currentUserData.ruta}.`, 'info');
                    btnCalcular.disabled = false;
                } else {
                    showStatus('status_pago_grupo', `Modo Offline. Buscando lista guardada para ruta ${currentUserData.ruta}...`, 'info');
                    btnCalcular.disabled = true;
                    const key = OFFLINE_STORAGE_KEY + currentUserData.ruta;
                    const savedDataString = localStorage.getItem(key);

                    if (savedDataString) {
                        try {
                            const savedData = JSON.parse(savedDataString);
                            if (savedData.ruta === currentUserData.ruta && savedData.office === currentUserData.office && savedData.data) {
                                cobranzaRutaData = savedData.data;
                                renderizarCobranzaRuta(cobranzaRutaData, container);
                                btnRegistrar.classList.remove('hidden');
                                placeholder.classList.add('hidden');
                                const timestamp = savedData.timestamp ? new Date(savedData.timestamp).toLocaleString() : 'desconocida';
                                showStatus('status_pago_grupo', `Lista offline cargada (guardada el ${timestamp})...`, 'success');
                            } else {
                                throw new Error("Datos guardados inválidos o de otra oficina.");
                            }
                        } catch (error) {
                            console.error("Error cargando datos offline:", error);
                            showStatus('status_pago_grupo', `Error al cargar datos guardados: ${error.message}. Intenta conectarte y generar una nueva lista.`, 'error');
                            placeholder.textContent = 'Error al cargar lista guardada.';
                        }
                    } else {
                        showStatus('status_pago_grupo', `No se encontró lista guardada para ruta ${currentUserData.ruta}. Conéctate para generar una.`, 'warning');
                        placeholder.textContent = 'No hay lista guardada para uso offline.';
                    }
                }
                break;
                
            case 'view-reportes-graficos':
                const hoyGraf = new Date();
                const haceUnAnio = new Date(hoyGraf.getFullYear() - 1, hoyGraf.getMonth(), hoyGraf.getDate() + 1);
                document.getElementById('grafico_fecha_inicio').value = haceUnAnio.toISOString().split('T')[0];
                document.getElementById('grafico_fecha_fin').value = hoyGraf.toISOString().split('T')[0];
                handleSucursalGraficoChange.call(document.getElementById('grafico_sucursal') || { value: '' });
                if (currentChart) {
                    currentChart.destroy();
                    currentChart = null;
                }
                document.getElementById('grafico-container').innerHTML = '';
                showStatus('status_graficos', 'Selecciona los filtros y genera un gráfico.', 'info');
                break;
                
            case 'view-importar':
                document.getElementById('office-select').value = 'GDL';
                handleOfficeChange.call(document.getElementById('office-select'));
                break;
                
            case 'view-registrar-gasto':
                const fechaGastoInput = document.getElementById('gasto-fecha');
                if (fechaGastoInput) {
                    fechaGastoInput.value = new Date().toISOString().split('T')[0];
                }
                showStatus('status_registrar_gasto', '', 'info');
                document.getElementById('form-registrar-gasto').reset();
                if (fechaGastoInput) {
                    fechaGastoInput.value = new Date().toISOString().split('T')[0];
                }
                break;
                
            case 'view-gestion-efectivo':
                loadGestionEfectivo();
                break;
                
            case 'view-reporte-contable':
                inicializarVistaReporteContable();
                break;
                
            case 'view-usuarios':
                inicializarVistaUsuarios();
                break;
        }
        
    } else {
        console.error(`Error: No se encontró la vista con ID ${viewId}`);
        const fallbackView = document.getElementById('view-main-menu');
        if (fallbackView) fallbackView.classList.remove('hidden');
    }
}

function showStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = message;
        element.classList.remove('status-success', 'status-error', 'status-info', 'status-warning', 'hidden');
        if (type === 'success') element.classList.add('status-success');
        else if (type === 'error') element.classList.add('status-error');
        else if (type === 'warning') element.classList.add('status-warning');
        else element.classList.add('status-info');

        if (type === 'success') {
            setTimeout(() => {
                if (element.innerHTML === message && element.classList.contains('status-success')) {
                    element.classList.add('hidden');
                }
            }, 5000);
        }
    } else {
        console.warn(`Elemento de estado con ID "${elementId}" no encontrado.`);
    }
}


function showProcessingOverlay(show, message = 'Procesando...') {
    if (show && typeof resetInactivityTimer === 'function') {
        resetInactivityTimer();
    }
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

function showButtonLoading(selector, show, loadingText = '') {
    const button = (typeof selector === 'string') ? document.querySelector(selector) : selector;
    if (!button || button.tagName !== 'BUTTON') {
        console.warn("showButtonLoading: Selector no es un botón:", selector);
        return;
    }

    if (show) {
        if (!button.hasAttribute('data-original-text')) {
            button.setAttribute('data-original-text', button.innerHTML);
        }
        button.innerHTML = `<span class="btn-spinner"></span> ${loadingText}`;
        button.classList.add('btn-loading');
        button.disabled = true;
    } else {
        const originalText = button.getAttribute('data-original-text');
        if (originalText !== null) {
            button.innerHTML = originalText;
            button.removeAttribute('data-original-text');
        }
        button.classList.remove('btn-loading');
        button.disabled = false;
    }
}

// =============================================
// FUNCIONES DE BARRA DE PROGRESO Y UTILIDADES
// =============================================

function showFixedProgress(percentage, message = '') {
    if (typeof resetInactivityTimer === 'function') {
        resetInactivityTimer();
    }
    let progressContainer = document.getElementById('progress-container-fixed');
    if (!progressContainer) {
        progressContainer = document.createElement('div');
        progressContainer.id = 'progress-container-fixed';
        progressContainer.className = 'progress-container-fixed hidden';
        progressContainer.innerHTML = `
            <div id="progress-text-fixed" class="progress-text-fixed"></div>
            <div id="progress-bar-fixed" class="progress-bar-fixed" style="width: 0%;"></div>
            <button id="btn-cancelar-carga-fixed" class="btn-cancelar-carga-fixed" title="Cancelar operación">
                <i class="fas fa-times"></i>
            </button>
        `;
        document.body.insertBefore(progressContainer, document.body.firstChild);
        const cancelButton = document.getElementById('btn-cancelar-carga-fixed');
        if (cancelButton) cancelButton.addEventListener('click', cancelarCarga);
    }
    const statusDiv = document.getElementById('connection-status');
    if (statusDiv) statusDiv.classList.add('hidden');
    document.body.classList.remove('has-connection-status');
    const progressBar = document.getElementById('progress-bar-fixed');
    const progressText = document.getElementById('progress-text-fixed');
    const validPercentage = Math.max(0, Math.min(100, percentage));
    if (progressBar) progressBar.style.width = validPercentage + '%';
    if (progressText) progressText.textContent = `${message} (${validPercentage.toFixed(0)}%)`;
    progressContainer.classList.remove('hidden');
    progressContainer.classList.add('visible');
    progressContainer.style.display = 'block';
    document.body.classList.add('has-progress');
}

function hideFixedProgress() {
    const progressContainer = document.getElementById('progress-container-fixed');
    if (progressContainer) {
        progressContainer.classList.add('hidden');
        progressContainer.classList.remove('visible');
        progressContainer.style.display = 'none';
        const progressBar = document.getElementById('progress-bar-fixed');
        if (progressBar) progressBar.style.width = '0%';
        const progressText = document.getElementById('progress-text-fixed');
        if (progressText) progressText.textContent = '';
    }
    document.body.classList.remove('has-progress');
}

function cancelarCarga() {
    console.warn("Operación cancelada por el usuario.");
    currentSearchOperation = null;
    cargaEnProgreso = false;

    hideFixedProgress();
    showProcessingOverlay(false);

    document.querySelectorAll('.btn-loading').forEach(button => {
        showButtonLoading(button, false);
    });

    const activeView = document.querySelector('.view:not(.hidden)');
    if (activeView) {
        const statusElement = activeView.querySelector('.status-message');
        const statusElementId = statusElement?.id || (activeView.id ? `status_${activeView.id.replace('view-', '')}` : null);

        if (statusElementId) {
            showStatus(statusElementId, 'Operación cancelada por el usuario.', 'warning');
        }
        if (activeView.id === 'view-gestion-clientes') {
            const tabla = document.getElementById('tabla-clientes');
            if (tabla) tabla.innerHTML = '<tr><td colspan="6">Búsqueda cancelada. Utiliza los filtros para buscar de nuevo.</td></tr>';
        }
        if (activeView.id === 'view-reportes-avanzados') {
            const tablaReporte = document.getElementById('tabla-reportes_avanzados');
            if (tablaReporte) tablaReporte.innerHTML = '<tr><td colspan="10">Generación de reporte cancelada.</td></tr>';
            document.getElementById('estadisticas-reporte').innerHTML = '';
        }
    }
}


/**
 * CORRECCIÓN: Calcula el monto total basado en plazo (0%, 30%, 40%).
 */
function calcularMontoTotalColocacion() {
    const montoInput = document.getElementById('monto_colocacion');
    const plazoInput = document.getElementById('plazo_colocacion');
    const montoTotalInput = document.getElementById('montoTotal_colocacion');
    if (!montoInput || !montoTotalInput || !plazoInput) return;

    const monto = parseFloat(montoInput.value) || 0;
    const plazo = parseInt(plazoInput.value) || 0;

    let interesRate = 0;
    if (plazo === 14) interesRate = 0.40;
    else if (plazo === 13) interesRate = 0.30;
    else if (plazo === 10) interesRate = 0.00;
    // Si el plazo no es 10, 13 o 14, el interés es 0 (o podría ser un error, pero 0 es más seguro)

    const montoTotal = monto * (1 + interesRate);

    montoTotalInput.value = (monto > 0 && plazo > 0)
        ? `$${montoTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '';

    // Actualizar nota de interés
    const fieldNote = montoTotalInput.nextElementSibling;
    if (fieldNote && fieldNote.classList.contains('field-note')) {
        fieldNote.textContent = `Incluye ${interesRate * 100}% de interés`;
    }
}


function validarCURP(inputElement) {
    if (!inputElement) return;
    inputElement.value = inputElement.value.toUpperCase().substring(0, 18);

    if (inputElement.value.length === 0) {
        inputElement.classList.remove('input-error', 'input-success');
    } else if (validarFormatoCURP(inputElement.value)) {
        inputElement.classList.remove('input-error');
        inputElement.classList.add('input-success');
    } else {
        inputElement.classList.remove('input-success');
        inputElement.classList.add('input-error');
    }
}


function validarFormatoCURP(curp) {
    const curpRegex = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
    return typeof curp === 'string' && curp.length === 18 && curpRegex.test(curp.toUpperCase());
}


const popularDropdown = (elementId, options, placeholder, isObjectValueKey = false) => {
    const select = document.getElementById(elementId);
    if (!select) {
        console.warn(`Dropdown con ID "${elementId}" no encontrado.`);
        return;
    }
    const selectedValue = select.value;
    select.innerHTML = `<option value="">${placeholder}</option>`;
    options.forEach(option => {
        const optionElement = document.createElement('option');
        if (isObjectValueKey) {
            optionElement.value = option.value;
            optionElement.textContent = option.text;
        } else {
            optionElement.value = option;
            optionElement.textContent = option;
        }
        select.appendChild(optionElement);
    });
    if (Array.from(select.options).some(opt => opt.value === selectedValue)) {
        select.value = selectedValue;
    } else {
        select.value = "";
    }

    console.log(`Dropdown ${elementId} actualizado con ${options?.length || 0} opciones`);
};

//** Manejaer el cambio de oficina ** //
async function handleOfficeChangeForClientForm() {
    const office = this.value || document.getElementById('office_cliente')?.value;
    console.log(`handleOfficeChangeForClientForm: Office = ${office}`);

    try {
        const [poblaciones, rutas] = await Promise.all([
            database.obtenerPoblaciones(office),
            database.obtenerRutas(office)
        ]);

        const poblacionesNombres = poblaciones.map(p => p.nombre).sort();
        const rutasNombres = rutas.map(r => r.nombre).sort();

        console.log(`Poblaciones para ${office}:`, poblacionesNombres.length);
        console.log(`Rutas para ${office}:`, rutasNombres.length);

        // Si estamos editando, cargar todas las opciones disponibles
        if (editingClientId) {
            const [todasPoblacionesDB, todasRutasDB] = await Promise.all([
                database.obtenerPoblaciones(),
                database.obtenerRutas()
            ]);
            const todasPoblacionesNombres = [...new Set(todasPoblacionesDB.map(p => p.nombre))].sort();
            const todasRutasNombres = [...new Set(todasRutasDB.map(r => r.nombre))].sort();

            popularDropdown('poblacion_grupo_cliente', todasPoblacionesNombres, 'Selecciona población/grupo');
            popularDropdown('ruta_cliente', todasRutasNombres, 'Selecciona una ruta');
        } else {
            popularDropdown('poblacion_grupo_cliente', poblacionesNombres, 'Selecciona población/grupo');
            popularDropdown('ruta_cliente', rutasNombres, 'Selecciona una ruta');
        }
    } catch (error) {
        console.error('Error en handleOfficeChangeForClientForm:', error);
        // En caso de error, cargar listas vacías
        popularDropdown('poblacion_grupo_cliente', [], 'Error al cargar');
        popularDropdown('ruta_cliente', [], 'Error al cargar');
    }
}

//** Manejar el cambio de oficina en reportes gráficos **//

async function handleSucursalGraficoChange() {
    const office = this.value;

    const poblaciones = await database.obtenerPoblaciones(office || null);
    const poblacionesNombres = [...new Set(poblaciones.map(p => p.nombre))].sort();

    popularDropdown('grafico_grupo', poblacionesNombres, 'Todos');
}

//** Carga las rutas en el dropdown del formulario de usuario, filtradas por oficina **//
async function _cargarRutasParaUsuario(office) {
    const rutaSelect = document.getElementById('nuevo-ruta');
    if (!rutaSelect) return;

    rutaSelect.innerHTML = '<option value="">Cargando rutas...</option>';
    rutaSelect.disabled = true;

    try {
        if (office === 'AMBAS' || !office) {
            popularDropdown('nuevo-ruta', [], '-- Sin asignar --');
            rutaSelect.disabled = true;
            return;
        }

        const rutas = await database.obtenerRutas(office);
        const rutasNombres = rutas.map(r => r.nombre).sort();
        popularDropdown('nuevo-ruta', rutasNombres, '-- Sin asignar --');
        rutaSelect.disabled = false;

    } catch (error) {
        console.error("Error cargando rutas para usuario:", error);
        popularDropdown('nuevo-ruta', [], 'Error al cargar');
    }
}

/**
 * Inicializa todos los dropdowns estáticos y dinámicos al cargar la app.
 */
async function inicializarDropdowns() {
    console.log('===> Inicializando dropdowns...');
    const userOffice = currentUserData?.office;
    console.log(`===> Oficina del usuario actual: ${userOffice}`);

    try {
        // Cargar poblaciones y rutas
        const [poblaciones, rutas] = await Promise.all([
            database.obtenerPoblaciones(userOffice),
            database.obtenerRutas(userOffice)
        ]);
        
        const todasLasRutas = [...new Set(rutas.map(r => r.nombre))].sort();
        console.log(`===> Rutas encontradas: ${todasLasRutas.length}`, todasLasRutas);

        const tiposCredito = ['NUEVO', 'RENOVACION', 'REINGRESO'];
        const montos = [3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000, 9000, 10000];
        const plazosCredito = [10, 13, 14].sort((a, b) => a - b);
        const estadosCredito = ['al corriente', 'atrasado', 'cobranza', 'juridico', 'liquidado'];
        const tiposPago = ['normal', 'extraordinario', 'actualizado', 'grupal'];
        const roles = [
            { value: 'Super Admin', text: 'Super Admin' },
            { value: 'Gerencia', text: 'Gerencia' },
            { value: 'Administrador', text: 'Administrador' },
            { value: 'Área comercial', text: 'Área comercial' }
        ];
        const tiposReporteGrafico = [
            { value: 'colocacion', text: 'Colocación (Monto)' },
            { value: 'recuperacion', text: 'Recuperación (Pagos)' },
            { value: 'comportamiento', text: 'Comportamiento de Pago (Tipos)' },
            { value: 'colocacion_vs_recuperacion', text: 'Colocación vs. Recuperación' }
        ];

        // --- Dropdowns de Grupo/Población ---
        const filtroOfficeInicial = (userOffice && userOffice !== 'AMBAS') ? userOffice : '';
        console.log(`===> Filtro oficina inicial para grupos: '${filtroOfficeInicial}'`);

        // Inicializar dropdowns de grupos
        await _actualizarDropdownGrupo('grupo_filtro', filtroOfficeInicial, 'Todos');
        await _actualizarDropdownGrupo('grupo_filtro_reporte', filtroOfficeInicial, 'Todos');
        await _actualizarDropdownGrupo('grafico_grupo', filtroOfficeInicial, 'Todos');

        // --- Dropdowns Rutas ---
        // CORRECCIÓN: Usar todasLasRutas en lugar de arrays vacíos
        popularDropdown('ruta_filtro_reporte', todasLasRutas, 'Todas');
        popularDropdown('ruta_cliente', todasLasRutas, 'Selecciona una ruta'); // CORREGIDO
        popularDropdown('nuevo-ruta', todasLasRutas, '-- Sin asignar --'); // CORREGIDO

        // --- Dropdowns estáticos ---
        popularDropdown('tipo_colocacion', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Selecciona tipo', true);
        popularDropdown('monto_colocacion', montos.map(m => ({ value: m, text: `$${m.toLocaleString()}` })), 'Selecciona monto', true);
        popularDropdown('plazo_colocacion', plazosCredito.map(p => ({ value: p, text: `${p} semanas` })), 'Selecciona plazo', true);
        popularDropdown('tipo_colocacion_filtro', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Todos', true);
        popularDropdown('plazo_filtro', plazosCredito.map(p => ({ value: p, text: `${p} semanas` })), 'Todos', true);
        popularDropdown('estado_credito_filtro', estadosCredito.map(e => ({ value: e, text: e.charAt(0).toUpperCase() + e.slice(1) })), 'Todos', true);
        popularDropdown('filtro-rol-usuario', roles, 'Todos los roles', true);
        popularDropdown('nuevo-rol', roles, 'Seleccione un rol', true);
        popularDropdown('tipo_credito_filtro_reporte', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Todos', true);
        popularDropdown('estado_credito_filtro_reporte', estadosCredito.map(e => ({ value: e, text: e.toUpperCase() })), 'Todos', true);
        popularDropdown('tipo_pago_filtro_reporte', tiposPago.map(t => ({ value: t, text: t.toUpperCase() })), 'Todos', true);
        popularDropdown('grafico_tipo_reporte', tiposReporteGrafico, 'Selecciona un reporte', true);

        // Dropdowns de Cliente (se cargarán dinámicamente cuando cambie la oficina)
        const poblacionesNombres = [...new Set(poblaciones.map(p => p.nombre))].sort();
        popularDropdown('poblacion_grupo_cliente', poblacionesNombres, 'Selecciona población/grupo');
        popularDropdown('ruta_cliente', todasLasRutas, 'Selecciona una ruta');

        console.log('===> Dropdowns inicializados correctamente');

    } catch (error) {
        console.error('Error inicializando dropdowns:', error);
    }
}


function actualizarPlazosSegunCliente(esComisionista) {
    // CORRECCIÓN: Un comisionista puede elegir 10, 13 o 14.
    const plazosDisponibles = esComisionista ? [10, 13, 14] : [13, 14];
    popularDropdown('plazo_colocacion', plazosDisponibles.map(p => ({ value: p, text: `${p} semanas` })), 'Selecciona plazo', true);
}

function showView(viewId) {
    console.log(`Navegando a vista: ${viewId}`);
    
    // Ocultar todas las vistas
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
        console.log(`Vista ${viewId} mostrada.`);
        
        // Ejecutar código específico para cada vista usando IIFE async
        (async () => {
            switch(viewId) {
                case 'view-configuracion':
                    console.log('🚀 EJECUTANDO loadConfiguracion AUTOMÁTICAMENTE');
                    await loadConfiguracion();
                    break;
                    
                case 'view-reportes':
                    await loadBasicReports(currentUserData?.office);
                    break;
                    
                case 'view-reportes-avanzados':
                    inicializarVistaReportesAvanzados();
                    break;
                    
                case 'view-gestion-clientes':
                    inicializarVistaGestionClientes();
                    break;
                    
                case 'view-cliente':
                    if (!editingClientId) { resetClientForm(); }
                    break;
                    
                case 'view-colocacion':
                    document.getElementById('curp_colocacion').value = '';
                    document.getElementById('form-colocacion').classList.add('hidden');
                    showStatus('status_colocacion', 'Ingresa la CURP del cliente para buscar.', 'info');
                    document.getElementById('plazo_colocacion').disabled = false;
                    document.getElementById('tipo_colocacion').disabled = false;
                    break;
                    
                case 'view-cobranza':
                    document.getElementById('idCredito_cobranza').value = '';
                    document.getElementById('form-cobranza').classList.add('hidden');
                    showStatus('status_cobranza', 'Ingresa el ID del crédito (histórico) para buscar.', 'info');
                    creditoActual = null;
                    break;
                    
                case 'view-pago-grupo':
                    // Tu código existente para pago grupal (sin await)
                    const statusPagoGrupo = document.getElementById('status_pago_grupo');
                    const btnCalcular = document.getElementById('btn-calcular-cobranza-ruta');
                    const btnGuardar = document.getElementById('btn-guardar-cobranza-offline');
                    const btnRegistrar = document.getElementById('btn-registrar-pagos-offline');
                    const container = document.getElementById('cobranza-ruta-container');
                    const placeholder = document.getElementById('cobranza-ruta-placeholder');

                    container.innerHTML = '';
                    placeholder.classList.remove('hidden');
                    placeholder.textContent = 'Presiona "Calcular Cobranza" (requiere conexión) o carga una lista guardada si estás offline.';
                    btnGuardar.classList.add('hidden');
                    btnRegistrar.classList.add('hidden');
                    cobranzaRutaData = null;

                    if (!currentUserData || !currentUserData.ruta || !currentUserData.office || currentUserData.office === 'AMBAS') {
                        showStatus('status_pago_grupo', 'Debes tener una ruta y oficina única asignada.', 'warning');
                        btnCalcular.disabled = true;
                        placeholder.textContent = 'Función no disponible: Ruta/Oficina no asignada.';
                        break;
                    }

                    if (navigator.onLine) {
                        showStatus('status_pago_grupo', `Listo para calcular cobranza de ruta ${currentUserData.ruta}.`, 'info');
                        btnCalcular.disabled = false;
                    } else {
                        showStatus('status_pago_grupo', `Modo Offline. Buscando lista guardada para ruta ${currentUserData.ruta}...`, 'info');
                        btnCalcular.disabled = true;
                        const key = OFFLINE_STORAGE_KEY + currentUserData.ruta;
                        const savedDataString = localStorage.getItem(key);

                        if (savedDataString) {
                            try {
                                const savedData = JSON.parse(savedDataString);
                                if (savedData.ruta === currentUserData.ruta && savedData.office === currentUserData.office && savedData.data) {
                                    cobranzaRutaData = savedData.data;
                                    renderizarCobranzaRuta(cobranzaRutaData, container);
                                    btnRegistrar.classList.remove('hidden');
                                    placeholder.classList.add('hidden');
                                    const timestamp = savedData.timestamp ? new Date(savedData.timestamp).toLocaleString() : 'desconocida';
                                    showStatus('status_pago_grupo', `Lista offline cargada (guardada el ${timestamp})...`, 'success');
                                } else {
                                    throw new Error("Datos guardados inválidos o de otra oficina.");
                                }
                            } catch (error) {
                                console.error("Error cargando datos offline:", error);
                                showStatus('status_pago_grupo', `Error al cargar datos guardados: ${error.message}. Intenta conectarte y generar una nueva lista.`, 'error');
                                placeholder.textContent = 'Error al cargar lista guardada.';
                            }
                        } else {
                            showStatus('status_pago_grupo', `No se encontró lista guardada para ruta ${currentUserData.ruta}. Conéctate para generar una.`, 'warning');
                            placeholder.textContent = 'No hay lista guardada para uso offline.';
                        }
                    }
                    break;
                    
                case 'view-reportes-graficos':
                    const hoyGraf = new Date();
                    const haceUnAnio = new Date(hoyGraf.getFullYear() - 1, hoyGraf.getMonth(), hoyGraf.getDate() + 1);
                    document.getElementById('grafico_fecha_inicio').value = haceUnAnio.toISOString().split('T')[0];
                    document.getElementById('grafico_fecha_fin').value = hoyGraf.toISOString().split('T')[0];
                    handleSucursalGraficoChange.call(document.getElementById('grafico_sucursal') || { value: '' });
                    if (currentChart) {
                        currentChart.destroy();
                        currentChart = null;
                    }
                    document.getElementById('grafico-container').innerHTML = '';
                    showStatus('status_graficos', 'Selecciona los filtros y genera un gráfico.', 'info');
                    break;
                    
                case 'view-importar':
                    document.getElementById('office-select').value = 'GDL';
                    handleOfficeChange.call(document.getElementById('office-select'));
                    break;
                    
                case 'view-registrar-gasto':
                    const fechaGastoInput = document.getElementById('gasto-fecha');
                    if (fechaGastoInput) {
                        fechaGastoInput.value = new Date().toISOString().split('T')[0];
                    }
                    showStatus('status_registrar_gasto', '', 'info');
                    document.getElementById('form-registrar-gasto').reset();
                    if (fechaGastoInput) {
                        fechaGastoInput.value = new Date().toISOString().split('T')[0];
                    }
                    break;
                    
                case 'view-gestion-efectivo':
                    await loadGestionEfectivo();
                    break;
                    
                case 'view-reporte-contable':
                    await inicializarVistaReporteContable();
                    break;
                    
                case 'view-usuarios':
                    inicializarVistaUsuarios();
                    break;
            }
        })();
        
    } else {
        console.error(`Error: No se encontró la vista con ID ${viewId}`);
        const fallbackView = document.getElementById('view-main-menu');
        if (fallbackView) fallbackView.classList.remove('hidden');
    }
}

// *** MANEJO DE DUPLICADOS ***
async function handleVerificarDuplicados() {
    showProcessingOverlay(true, 'Buscando clientes duplicados (por CURP + Oficina)...');
    showButtonLoading('#btn-verificar-duplicados', true);
    const statusUsuarios = document.getElementById('status_usuarios');
    statusUsuarios.textContent = 'Buscando duplicados...';
    statusUsuarios.className = 'status-message status-info';

    try {
        const resultado = await database.encontrarClientesDuplicados();
        if (!resultado.success) throw new Error(resultado.message);

        const { idsParaEliminar, duplicadosEncontrados, curpsAfectadas } = resultado;

        if (idsParaEliminar.length === 0) {
            showStatus('status_usuarios', '¡Verificación completa! No se encontraron clientes duplicados (misma CURP y Oficina).', 'success');
        } else {
            const confirmacion = confirm(
                `Se encontraron ${duplicadosEncontrados} registros duplicados (clientes con misma CURP y Oficina).\n` +
                `CURPs afectadas: ${curpsAfectadas.join(', ')}\n\n` +
                `Se conservará el registro más reciente de cada grupo duplicado y se eliminarán los ${idsParaEliminar.length} registros más antiguos.\n\n` +
                `¿Deseas proceder con la limpieza? Esta acción no se puede deshacer.`
            );

            if (confirmacion) {
                showProcessingOverlay(true, `Eliminando ${idsParaEliminar.length} registros duplicados...`);
                statusUsuarios.textContent = 'Eliminando duplicados...';
                const resEliminacion = await database.ejecutarEliminacionDuplicados(idsParaEliminar);
                if (resEliminacion.success) {
                    showStatus('status_usuarios', resEliminacion.message, 'success');
                    await loadUsersTable();
                } else {
                    throw new Error(resEliminacion.message);
                }
            } else {
                showStatus('status_usuarios', 'Operación de limpieza de duplicados cancelada por el usuario.', 'info');
            }
        }
    } catch (error) {
        console.error("Error al verificar/eliminar duplicados:", error);
        showStatus('status_usuarios', `Error durante la verificación/eliminación de duplicados: ${error.message}`, 'error');
    } finally {
        showProcessingOverlay(false);
        showButtonLoading('#btn-verificar-duplicados', false);
    }
}

// ====================================================================
// ** FUNCIÓN PARA MOSTRAR HISTORIAL DE PAGOS **
// ====================================================================
async function mostrarHistorialPagos(historicalIdCredito, office) { // <-- PARÁMETRO CAMBIADO
    const modal = document.getElementById('generic-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    if (!modal || !modalTitle || !modalBody) {
        console.error("Elementos del modal no encontrados.");
        alert("Error al intentar mostrar el historial. Faltan elementos en la página.");
        return;
    }

    modalTitle.textContent = `Historial de Pagos (Crédito: ${historicalIdCredito} - Suc: ${office})`;
    modalBody.innerHTML = '<div class="spinner" style="margin: 20px auto; border-top-color: var(--primary);"></div><p style="text-align: center;">Cargando historial...</p>';
    modal.classList.remove('hidden');

    try {
        // Buscar el crédito usando el ID y el OFFICE
        const creditos = await database.buscarCreditosPorHistoricalId(historicalIdCredito, { office: office });
        if (creditos.length === 0) {
            throw new Error(`No se encontró el crédito con ID histórico ${historicalIdCredito} en la sucursal ${office}.`);
        }
        creditos.sort((a, b) => (parsearFecha(b.fechaCreacion)?.getTime() || 0) - (parsearFecha(a.fechaCreacion)?.getTime() || 0));
        const credito = creditos[0];
        
        // Buscar al cliente
        const cliente = await database.buscarClientePorCURP(credito.curpCliente);
        
        // Buscar los pagos usando el ID y el OFFICE
        const pagos = await database.getPagosPorCredito(historicalIdCredito, office);

        // *** Calcular estado y saldo REAL aquí también para mostrarlo ***
        pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0)); // Ordenar DESC para cálculo
        const estadoCalculado = _calcularEstadoCredito(credito, pagos);
        const saldoReal = estadoCalculado ? estadoCalculado.saldoRestante : (credito.saldo || 0); // Usar calculado si es posible
        const estadoReal = estadoCalculado ? estadoCalculado.estado : (credito.estado || 'desconocido');

        let resumenHTML = `
            <div class="info-grid" style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <div class="info-item"><span class="info-label">Cliente:</span><span class="info-value">${cliente ? cliente.nombre : 'N/A'} (${credito.curpCliente})</span></div>
                 <div class="info-item"><span class="info-label">ID Crédito (Hist.):</span><span class="info-value">${credito.historicalIdCredito || 'N/A'}</span></div>
                 <div class="info-item"><span class="info-label">Oficina:</span><span class="info-value">${credito.office || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Monto Total:</span><span class="info-value">$${(credito.montoTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                 <div class="info-item"><span class="info-label">Saldo Calculado:</span><span class="info-value" style="color: ${saldoReal === 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: bold;">$${saldoReal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                 <div class="info-item"><span class="info-label">Estado Calculado:</span><span class="info-value status-${estadoReal.replace(/\s/g, '-')}">${estadoReal.toUpperCase()}</span></div>
                 <div class="info-item"><span class="info-label">Fecha Inicio:</span><span class="info-value">${formatDateForDisplay(parsearFecha(credito.fechaCreacion))}</span></div>
            </div>
         `;

        let tablaHTML = '';
        if (pagos.length === 0) {
            tablaHTML = '<p class="status-message status-info">Este crédito no tiene pagos registrados.</p>';
        } else {
            // Reordenar ASC (más antiguo primero) para calcular el saldo secuencialmente
            pagos.sort((a, b) => (parsearFecha(a.fecha)?.getTime() || 0) - (parsearFecha(b.fecha)?.getTime() || 0));

            let saldoActual = credito.montoTotal || 0; // Empezar con el monto total del crédito
            let totalPagado = 0;
            const tableRows = pagos.map(pago => {
                const montoPago = pago.monto || 0;
                totalPagado += montoPago;
                saldoActual -= montoPago; // Restar el pago al saldo actual

                // Asegurar que el saldo no sea negativo (podría pasar por redondeos mínimos)
                if (saldoActual < 0.005) {
                    saldoActual = 0;
                }

                const saldoDespuesCalculado = `$${saldoActual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                // Intentar obtener el saldo guardado para comparación (opcional, para debug)
                const saldoGuardadoRaw = pago.saldoDespues;
                let saldoGuardadoFormateado = 'N/A';
                let discrepanciaClass = '';
                if (typeof saldoGuardadoRaw === 'number' && !isNaN(saldoGuardadoRaw)) {
                     saldoGuardadoFormateado = `$${saldoGuardadoRaw.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                     // Comparar calculado vs guardado (con tolerancia)
                     if (Math.abs(saldoActual - saldoGuardadoRaw) > 0.02) { // Tolerancia de 2 centavos
                         discrepanciaClass = 'saldo-discrepancy'; // Clase CSS para resaltar
                     }
                }


                return `
                    <tr class="${discrepanciaClass}">
                        <td>${formatDateForDisplay(parsearFecha(pago.fecha))}</td>
                        <td>$${montoPago.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td>${pago.tipoPago || 'normal'}</td>
                        <td>
                            ${saldoDespuesCalculado}
                            ${saldoGuardadoFormateado !== 'N/A' && discrepanciaClass ? `<br><small class="saldo-guardado">(DB: ${saldoGuardadoFormateado})</small>` : ''}
                        </td>
                        <td>${pago.registradoPor || 'N/A'}</td>
                    </tr>
                `;
            }).join('');

            tablaHTML = `
                 <p style="text-align: right; font-size: 14px; color: var(--gray);">Total Pagado (suma historial): <strong style="color: var(--success);">$${totalPagado.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
                <table class="payment-history-table">
                    <thead>
                        <tr>
                            <th>Fecha Pago</th>
                            <th>Monto</th>
                            <th>Tipo</th>
                            <th>Saldo Después (Calculado)</th>
                            <th>Registrado Por</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                 </table>
                 ${document.querySelector('.saldo-discrepancy') ? '<p style="font-size: 11px; color: var(--danger); margin-top: 10px;">* Filas resaltadas indican discrepancia entre saldo calculado y saldo guardado en el pago (posiblemente por importación o edición manual).</p>' : ''}
            `;
        }
        modalBody.innerHTML = resumenHTML + tablaHTML;

    } catch (error) {
        console.error("Error al mostrar historial de pagos:", error);
        modalBody.innerHTML = `<p class="status-message status-error">Error al cargar el historial: ${error.message}</p>`;
    }
}

// ====================================================================
// ** FUNCIÓN PARA LA HERRAMIENTA DE DIAGNÓSTICO **
// ====================================================================
async function handleDiagnosticarPagos() {
    const historicalIdCredito = document.getElementById('diagnostico-id-credito').value.trim();
    const statusEl = document.getElementById('status-diagnostico');
    const resultEl = document.getElementById('resultado-diagnostico');
    const outputEl = document.getElementById('diagnostico-json-output');
    const button = document.getElementById('btn-diagnosticar-pagos');

    if (!historicalIdCredito) {
        statusEl.textContent = 'Por favor, ingresa un ID de crédito (histórico).';
        statusEl.className = 'status-message status-warning';
        statusEl.classList.remove('hidden');
        resultEl.classList.add('hidden');
        return;
    }

    showButtonLoading(button, true, 'Verificando...');
    statusEl.textContent = 'Buscando créditos asociados al ID...';
    statusEl.className = 'status-message status-info';
    statusEl.classList.remove('hidden');
    resultEl.classList.add('hidden');

    try {
        // 1. Buscar TODOS los créditos con ese ID (sin filtro de sucursal/curp)
        const creditosAsociados = await database.buscarCreditosPorHistoricalId(historicalIdCredito, { userOffice: null }); // Buscar en todas las sucursales

        if (creditosAsociados.length === 0) {
            statusEl.textContent = `Diagnóstico: No se encontró NINGÚN crédito con el ID Histórico ${historicalIdCredito}.`;
            statusEl.className = 'status-message status-warning';
            outputEl.textContent = '[]';
            resultEl.classList.remove('hidden');
            showButtonLoading(button, false);
            return;
        }

        statusEl.textContent = `Se encontraron ${creditosAsociados.length} créditos. Buscando pagos para cada uno...`;
        const diagnosticoCompleto = {};
        let totalPagosEncontrados = 0;

        for (const credito of creditosAsociados) {
            const curp = credito.curpCliente;
            const office = credito.office;
            const clave = `Cliente: ${curp} (Sucursal: ${office})`;
            
            // 2. Buscar pagos CON el CURP
            const pagos = await database.getPagosPorCredito(historicalIdCredito, curp);
            totalPagosEncontrados += pagos.length;
            
            pagos.sort((a, b) => (parsearFecha(a.fecha)?.getTime() || 0) - (parsearFecha(b.fecha)?.getTime() || 0));
            
            diagnosticoCompleto[clave] = {
                firestoreCreditoId: credito.id,
                totalPagos: pagos.length,
                pagos: pagos.map(p => ({
                    ...p,
                    fecha_formateada: formatDateForDisplay(parsearFecha(p.fecha)),
                    monto: p.monto?.toFixed(2),
                    saldoDespues: typeof p.saldoDespues === 'number' ? p.saldoDespues.toFixed(2) : p.saldoDespues
                }))
            };
        }

        if (totalPagosEncontrados === 0) {
             statusEl.textContent = `Diagnóstico completo: Se encontraron ${creditosAsociados.length} créditos, pero 0 pagos asociados (usando el filtro de CURP).`;
            statusEl.className = 'status-message status-warning';
        } else {
            statusEl.textContent = `Diagnóstico completo: ¡Éxito! Se encontraron ${totalPagosEncontrados} pagos distribuidos en ${creditosAsociados.length} créditos.`;
            statusEl.className = 'status-message status-success';
        }
        
        outputEl.textContent = JSON.stringify(diagnosticoCompleto, null, 2);
        resultEl.classList.remove('hidden');

    } catch (error) {
        console.error("Error en diagnóstico:", error);
        statusEl.textContent = `Error al consultar la base de datos: ${error.message}`;
        statusEl.className = 'status-message status-error';
        resultEl.classList.add('hidden');
    } finally {
        showButtonLoading(button, false);
    }
}

// EN app.js - AÑADIR NUEVAS FUNCIONES AL FINAL DEL ARCHIVO

/**
 * Inicializa la vista de reporte contable, aplicando filtros de oficina y cargando agentes.
 */
async function inicializarVistaReporteContable() {
    const statusEl = 'status_reporte_contable';
    const selectSucursal = document.getElementById('reporte-contable-sucursal');
    const selectAgente = document.getElementById('reporte-contable-agente');
    const btnGenerar = document.getElementById('btn-generar-reporte-contable');
    const btnImprimir = document.getElementById('btn-imprimir-reporte-contable');
    const wrapper = document.getElementById('reporte-contable-wrapper');

    // Resetear vista
    wrapper.classList.add('hidden');
    btnImprimir.classList.add('hidden');
    showStatus(statusEl, 'Selecciona los filtros para generar un reporte.', 'info');
    
    // Poner fechas por defecto (mes actual)
    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    document.getElementById('reporte-contable-fecha-inicio').value = primerDiaMes.toISOString().split('T')[0];
    document.getElementById('reporte-contable-fecha-fin').value = hoy.toISOString().split('T')[0];

    // Aplicar segregación de oficina al dropdown de sucursal
    const userOffice = currentUserData?.office;
    const esAdminTotal = (currentUserData?.role === 'Super Admin' || currentUserData?.role === 'Gerencia');

    if (esAdminTotal && (!userOffice || userOffice === 'AMBAS')) {
        selectSucursal.disabled = false;
        selectSucursal.value = ''; // Permitir seleccionar
    } else if (userOffice && userOffice !== 'AMBAS') {
        selectSucursal.value = userOffice;
        selectSucursal.disabled = true;
    } else {
        // Caso raro (ej. Rol bajo sin oficina)
        selectSucursal.value = '';
        selectSucursal.disabled = true;
        showStatus(statusEl, 'No tienes una oficina asignada para generar reportes.', 'error');
    }
    
    // Cargar agentes basado en la sucursal seleccionada (o la forzada)
    await handleSucursalReporteContableChange();
}

/**
 * Carga los agentes en el dropdown de reporte contable según la sucursal seleccionada.
 */
async function handleSucursalReporteContableChange() {
    const statusEl = 'status_reporte_contable';
    const selectSucursal = document.getElementById('reporte-contable-sucursal');
    const selectAgente = document.getElementById('reporte-contable-agente');
    const office = selectSucursal.value;

    selectAgente.innerHTML = '<option value="">Cargando...</option>';
    selectAgente.disabled = true;

    if (!office) {
        selectAgente.innerHTML = '<option value="">Selecciona una sucursal</option>';
        return;
    }

    try {
        const resultado = await database.obtenerUsuarios(); // Obtiene todos
        if (!resultado.success) throw new Error(resultado.message);

        const agentes = resultado.data.filter(u =>
            u.role === 'Área comercial' && u.office === office
        ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const opciones = agentes.map(a => ({ value: a.id, text: a.name }));
        popularDropdown('reporte-contable-agente', opciones, 'Todos los Agentes', true);
        selectAgente.disabled = false;
        
    } catch (error) {
        console.error("Error cargando agentes para reporte:", error);
        showStatus(statusEl, `Error cargando agentes: ${error.message}`, 'error');
        selectAgente.innerHTML = '<option value="">Error al cargar</option>';
    }
}

/**
 * Genera el contenido del reporte contable basado en los filtros.
 */
async function handleGenerarReporteContable() {
    const statusEl = 'status_reporte_contable';
    const btnGenerar = document.getElementById('btn-generar-reporte-contable');
    const btnImprimir = document.getElementById('btn-imprimir-reporte-contable');
    const wrapper = document.getElementById('reporte-contable-wrapper');
    
    showButtonLoading(btnGenerar, true, 'Generando...');
    showStatus(statusEl, 'Buscando movimientos de efectivo...', 'info');
    wrapper.classList.add('hidden');
    btnImprimir.classList.add('hidden');

    // Cachear selectores de agentes
    const agenteOptions = Array.from(document.getElementById('reporte-contable-agente').options);
    const agenteMap = new Map(agenteOptions.map(opt => [opt.value, opt.text]));
    // Asegurar que el admin/agente actual esté (por si acaso)
    if(currentUserData) {
        agenteMap.set(currentUserData.id, currentUserData.name);
    }


    try {
        const filtros = {
            office: document.getElementById('reporte-contable-sucursal').value,
            userId: document.getElementById('reporte-contable-agente').value || null,
            fechaInicio: document.getElementById('reporte-contable-fecha-inicio').value,
            fechaFin: document.getElementById('reporte-contable-fecha-fin').value
        };

        if (!filtros.office) throw new Error("Debes seleccionar una sucursal.");
        if (!filtros.fechaInicio || !filtros.fechaFin) throw new Error("Debes seleccionar un rango de fechas.");

        // Usar la nueva función de database.js
        const resultado = await database.getMovimientosParaReporte(filtros);
        if (!resultado.success) throw new Error(resultado.message);

        const movimientos = resultado.data;

        // --- Procesar y Agrupar Datos ---
        let totalEntregas = 0; // ENTREGA_INICIAL (+)
        let totalColocacion = 0; // COLOCACION (-)
        let totalGastos = 0; // GASTO (-)
        let totalPagos = 0; // PAGO (Esto no existe en el flujo actual, pero lo dejamos por si acaso)
        let balanceFinal = 0;

        const movimientosPorAgente = {};

        movimientos.forEach(mov => {
            const agenteId = mov.userId || 'sin_agente';
            if (!movimientosPorAgente[agenteId]) {
                movimientosPorAgente[agenteId] = [];
            }
            movimientosPorAgente[agenteId].push(mov);

            const monto = mov.monto || 0;
            balanceFinal += monto; // Suma directa (positivos suman, negativos restan)

            switch (mov.tipo) {
                case 'ENTREGA_INICIAL':
                    totalEntregas += monto;
                    break;
                case 'COLOCACION':
                    totalColocacion += monto; // Es negativo, así que suma
                    break;
                case 'GASTO':
                    totalGastos += monto; // Es negativo, así que suma
                    break;
                // case 'PAGO': // Los pagos (entradas) no están en 'movimientos_efectivo'
                //     totalPagos += monto;
                //     break;
            }
        });

        // --- Renderizar HTML ---
        
        // Header
        const agenteSeleccionado = filtros.userId ? (agenteMap.get(filtros.userId) || filtros.userId) : 'Todos los Agentes';
        document.getElementById('reporte-contable-titulo').textContent = `Reporte de Flujo de Efectivo - ${filtros.office}`;
        document.getElementById('reporte-contable-subtitulo').textContent = 
            `Periodo: ${formatDateForDisplay(parsearFecha(filtros.fechaInicio))} al ${formatDateForDisplay(parsearFecha(filtros.fechaFin))} | Agente: ${agenteSeleccionado}`;

        // Resumen
        const resumenEl = document.getElementById('reporte-contable-resumen');
        resumenEl.innerHTML = `
            <div class="info-item"><span class="info-label">Total Entregado (Admin -> Agente):</span><span class="info-value" style="color: var(--success);">$${totalEntregas.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></div>
            <div class="info-item"><span class="info-label">Total Colocado (Agente -> Cliente):</span><span class="info-value" style="color: var(--danger);">$${totalColocacion.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></div>
            <div class="info-item"><span class="info-label">Total Gastos (Agente):</span><span class="info-value" style="color: var(--warning);">$${totalGastos.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></div>
            <div class="info-item"><span class="info-label">Balance Final (Entregas - Salidas):</span><span class="info-value" style="font-weight: bold; color: ${balanceFinal >= 0 ? 'var(--success)' : 'var(--danger)'};">$${balanceFinal.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></div>
        `;

        // Detalle
        const detalleEl = document.getElementById('reporte-contable-detalle');
        let detalleHtml = '';

        // Agrupar por Agente si 'Todos' fue seleccionado
        if (!filtros.userId) {
            for (const agenteId in movimientosPorAgente) {
                const nombreAgente = agenteMap.get(agenteId) || agenteId;
                detalleHtml += `<h5>Agente: ${nombreAgente}</h5>`;
                detalleHtml += renderTablaMovimientos(movimientosPorAgente[agenteId]);
            }
        } else {
            // Solo mostrar la tabla del agente seleccionado
            detalleHtml += renderTablaMovimientos(movimientos);
        }

        detalleEl.innerHTML = detalleHtml;

        wrapper.classList.remove('hidden');
        btnImprimir.classList.remove('hidden');
        showStatus(statusEl, `Reporte generado con ${movimientos.length} movimientos. Listo para imprimir.`, 'success');

    } catch (error) {
        console.error("Error generando reporte contable:", error);
        showStatus(statusEl, `Error: ${error.message}`, 'error');
        wrapper.classList.add('hidden');
        btnImprimir.classList.add('hidden');
    } finally {
        showButtonLoading(btnGenerar, false);
    }
}

/**
 * Helper para renderizar la tabla de movimientos del reporte contable.
 */
function renderTablaMovimientos(movimientos) {
    let rows = '';
    // Ordenar por fecha ASC para el reporte
    movimientos.sort((a, b) => (parsearFecha(a.fecha)?.getTime() || 0) - (parsearFecha(b.fecha)?.getTime() || 0));

    movimientos.forEach(mov => {
        const monto = mov.monto || 0;
        rows += `
            <tr>
                <td>${formatDateForDisplay(parsearFecha(mov.fecha))}</td>
                <td>${mov.tipo || 'N/A'}</td>
                <td class="monto" style="color: ${monto > 0 ? 'var(--success)' : 'var(--danger)'};">
                    $${monto.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                </td>
                <td>${mov.descripcion || ''}</td>
                <td>${mov.registradoPor || 'N/A'}</td>
            </tr>
        `;
    });

    return `
        <table class="reporte-contable-tabla">
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Monto</th>
                    <th>Descripción</th>
                    <th>Registrado Por (Admin)</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="5">No se encontraron movimientos.</td></tr>'}
            </tbody>
        </table>
    `;
}
/**
 * Extrae los números de teléfono de la tabla de clientes visible y los muestra en un modal.
 */
function handleExportarTelefonos() {
    const tbody = document.getElementById('tabla-clientes');
    if (!tbody) {
        alert("Error: No se encontró la tabla de clientes.");
        return;
    }

    const rows = tbody.querySelectorAll('tr');
    const telefonos = new Set();
    let clientesSinTelefono = 0;
    let clientesEncontrados = 0;

    rows.forEach(row => {
        const editButton = row.querySelector('button[onclick^="editCliente"]');
        if (editButton) {
            clientesEncontrados++;
            try {
                // 1. Extraer el string JSON del atributo onclick
                const onclickAttr = editButton.getAttribute('onclick');
                const jsonString = onclickAttr.substring(
                    onclickAttr.indexOf('(') + 1, 
                    onclickAttr.lastIndexOf(')')
                )
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'");
                
                // 2. Parsear el JSON
                const cliente = JSON.parse(jsonString);

                // 3. Obtener y limpiar el teléfono
                if (cliente && cliente.telefono) {
                    let telefonoLimpio = cliente.telefono.replace(/\D/g, '');
                    if (telefonoLimpio.length > 10) {
                        if (telefonoLimpio.startsWith('521')) {
                            telefonoLimpio = telefonoLimpio.substring(3);
                        } else if (telefonoLimpio.startsWith('52')) {
                            telefonoLimpio = telefonoLimpio.substring(2);
                        }
                    }

                    if (telefonoLimpio.length === 10) {
                        telefonos.add(telefonoLimpio);
                    } else if (telefonoLimpio.length > 0) {
                        console.warn(`Teléfono no estándar (se omite): ${cliente.telefono} (Limpio: ${telefonoLimpio})`);
                        clientesSinTelefono++;
                    } else {
                        clientesSinTelefono++;
                    }
                } else {
                    clientesSinTelefono++;
                }
            } catch (e) {
                console.error("Error parseando JSON del cliente en la fila:", e, row);
            }
        }
    });

    if (telefonos.size === 0) {
        alert(`No se encontraron números de teléfono válidos en los ${clientesEncontrados} clientes de la búsqueda actual.`);
        return;
    }

    const modal = document.getElementById('generic-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    modalTitle.textContent = `Exportar Teléfonos (${telefonos.size} números únicos)`;
    modalBody.innerHTML = `
        <p>Se encontraron <strong>${telefonos.size}</strong> números de teléfono únicos de los <strong>${clientesEncontrados}</strong> clientes en la tabla.</p>
        <p>(${clientesSinTelefono} clientes no tenían un número de teléfono válido registrado).</p>
        <p>Copia esta lista para usarla en una lista de difusión de WhatsApp:</p>
        <textarea id="telefonos-export-textarea" rows="10" style="width: 100%; font-size: 14px; padding: 10px; margin-top: 15px;" readonly>${Array.from(telefonos).join('\n')}</textarea>
        <button id="btn-copiar-telefonos" class="btn btn-primary" style="margin-top: 15px;"><i class="fas fa-copy"></i> Copiar al Portapapeles</button>
    `;
    modal.classList.remove('hidden');

    const btnCopiar = document.getElementById('btn-copiar-telefonos');
    if (btnCopiar) {
        btnCopiar.replaceWith(btnCopiar.cloneNode(true));
        document.getElementById('btn-copiar-telefonos').addEventListener('click', () => {
            const textarea = document.getElementById('telefonos-export-textarea');
            textarea.select();
            
            try {
                navigator.clipboard.writeText(textarea.value).then(() => {
                    const btn = document.getElementById('btn-copiar-telefonos');
                    btn.innerHTML = '<i class="fas fa-check"></i> Copiado';
                    setTimeout(() => {
                        btn.innerHTML = '<i class="fas fa-copy"></i> Copiar al Portapapeles';
                    }, 2000);
                }).catch(err => {
                    console.error('Error al copiar (API Clipboard): ', err);
                    document.execCommand('copy');
                    const btn = document.getElementById('btn-copiar-telefonos');
                    btn.innerHTML = '<i class="fas fa-check"></i> Copiado (Fallback)';
                    setTimeout(() => {
                        btn.innerHTML = '<i class="fas fa-copy"></i> Copiar al Portapapeles';
                    }, 2000);
                });
            } catch (err) {
                console.error('Error al copiar: ', err);
                alert('No se pudo copiar automáticamente. Por favor, copia el texto manualmente.');
            }
        });
    }
}

// =============================================
// CONFIGURACIÓN DE EVENT LISTENERS PARA CONFIGURACIÓN
// =============================================

function configurarEventListenersConfiguracion() {
    console.log("🔧 Configurando event listeners para configuración...");
    
    // Delegación de eventos para los botones de poblaciones
    document.addEventListener('click', function(e) {
        // Botón "Asignar Ruta" en poblaciones
        if (e.target.closest('.btn-asignar-ruta')) {
            const button = e.target.closest('.btn-asignar-ruta');
            const poblacionId = button.getAttribute('data-id');
            const poblacionNombre = button.getAttribute('data-nombre');
            const poblacionOffice = button.getAttribute('data-office');
            
            console.log("📍 Asignar ruta a población:", { poblacionId, poblacionNombre, poblacionOffice });
            asignarRutaPoblacion(poblacionId, poblacionNombre, poblacionOffice);
        }
        
        // Botón "Eliminar" en poblaciones
        if (e.target.closest('.btn-eliminar-poblacion')) {
            const button = e.target.closest('.btn-eliminar-poblacion');
            const poblacionId = button.getAttribute('data-id');
            const poblacionNombre = button.getAttribute('data-nombre');
            
            console.log("🗑️ Eliminar población:", { poblacionId, poblacionNombre });
            eliminarPoblacion(poblacionId, poblacionNombre);
        }
    });

    // Configurar búsqueda en poblaciones
    const searchPoblaciones = document.getElementById('search-poblaciones');
    if (searchPoblaciones) {
        searchPoblaciones.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase().trim();
            const cards = document.querySelectorAll('#tab-poblaciones .poblacion-card');
            const activeFilter = document.querySelector('#tab-poblaciones .filter-tab.active')?.getAttribute('data-office') || 'all';
            
            let visibleCount = 0;
            cards.forEach(card => {
                const nombre = card.getAttribute('data-nombre');
                const office = card.getAttribute('data-office');
                const matchesSearch = !searchTerm || nombre.includes(searchTerm);
                const matchesFilter = activeFilter === 'all' || office === activeFilter;
                
                if (matchesSearch && matchesFilter) {
                    card.style.display = 'flex';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });

            // Ocultar secciones vacías
            document.querySelectorAll('#tab-poblaciones .office-section').forEach(section => {
                const visibleCards = section.querySelectorAll('.poblacion-card[style*="display: flex"]').length;
                section.style.display = visibleCards > 0 ? 'block' : 'none';
            });
        });
    }

    // Configurar filtros por oficina en poblaciones
    document.querySelectorAll('#tab-poblaciones .filter-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('#tab-poblaciones .filter-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Disparar búsqueda para re-filtrar
            const searchInput = document.getElementById('search-poblaciones');
            if (searchInput) searchInput.dispatchEvent(new Event('input'));
        });
    });

    // Configurar búsqueda en rutas
    const searchRutas = document.getElementById('search-rutas');
    if (searchRutas) {
        searchRutas.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase().trim();
            const cards = document.querySelectorAll('#tab-rutas .ruta-card');
            
            cards.forEach(card => {
                const nombre = card.getAttribute('data-nombre');
                const matchesSearch = !searchTerm || nombre.includes(searchTerm);
                card.style.display = matchesSearch ? 'flex' : 'none';
            });

            // Ocultar secciones vacías
            document.querySelectorAll('#tab-rutas .office-section').forEach(section => {
                const visibleCards = section.querySelectorAll('.ruta-card[style*="display: flex"]').length;
                section.style.display = visibleCards > 0 ? 'block' : 'none';
            });
        });
    }

    console.log("✅ Event listeners de configuración configurados");
}

// Modifica la función loadConfiguracion para llamar a esta configuración
async function loadConfiguracion() {
    console.log("🚀 EJECUTANDO loadConfiguracion - INICIO");
    const statusEl = 'status_configuracion';
    
    // 1. Verificar permisos de acceso
    if (!currentUserData || !['Super Admin', 'Gerencia', 'Administrador'].includes(currentUserData.role)) {
        showStatus(statusEl, 'No tienes permisos para acceder a esta sección.', 'error');
        return;
    }

    // Determinar filtro de oficina
    let officeFiltro = null;
    if (currentUserData.role === 'Administrador' && currentUserData.office && currentUserData.office !== 'AMBAS') {
        officeFiltro = currentUserData.office;
    }
    
    console.log(`📍 Filtro oficina: ${officeFiltro || 'TODAS'}`);
    showStatus(statusEl, 'Cargando catálogos...', 'info');

    try {
        console.log("📋 Cargando interfaz de poblaciones...");
        await cargarInterfazPoblaciones(officeFiltro);
        
        console.log("🛣️ Cargando interfaz de rutas...");
        await cargarInterfazRutas(officeFiltro);
        
        console.log("🔧 Configurando tabs y event listeners...");
        setupNuevosTabsConfiguracion();
        configurarEventListenersConfiguracion(); // ← AÑADIR ESTA LÍNEA
        
        showStatus(statusEl, '✅ Catálogos cargados correctamente', 'success');
        console.log("🎉 loadConfiguracion - COMPLETADO EXITOSAMENTE");
        
    } catch (error) {
        console.error("❌ Error en loadConfiguracion:", error);
        showStatus(statusEl, `❌ Error al cargar: ${error.message}`, 'error');
    }
}

// =============================================
// INICIALIZACIÓN Y EVENT LISTENERS PRINCIPALES
// =============================================

document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM cargado, inicializando aplicación...');
    // NO llamar inicializarDropdowns aquí
    setupEventListeners();
    setupSecurityListeners();

    auth.onAuthStateChanged(async user => {
        console.log('Estado de autenticación cambiado:', user ? user.uid : 'No user');
        const loadingOverlay = document.getElementById('loading-overlay');
        const loginScreen = document.getElementById('login-screen');
        const mainApp = document.getElementById('main-app');

        loadingOverlay.classList.add('hidden');

        if (user) {
            currentUser = user;
            try {
                currentUserData = await database.obtenerUsuarioPorId(user.uid);

                if (currentUserData && !currentUserData.error) { // Asegurarse que no hubo error al cargar
                    document.getElementById('user-name').textContent = currentUserData.name || user.email;
                    document.getElementById('user-role-display').textContent = currentUserData.role || 'Rol Desconocido';

                    // *** LLAMAR A inicializarDropdowns AQUÍ ***
                    await inicializarDropdowns(); // Esperar a que terminen de cargarse

                    // Aplicar permisos y filtros DESPUÉS de inicializar dropdowns
                    aplicarPermisosUI(currentUserData.role);

                } else {
                    console.warn(`No se encontraron datos válidos en Firestore para el usuario ${user.uid} o faltan campos requeridos.`);
                    document.getElementById('user-name').textContent = user.email;
                    document.getElementById('user-role-display').textContent = 'Datos Incompletos';
                    aplicarPermisosUI('default'); // Aplicar permisos por defecto
                    // No llamar a inicializarDropdowns si los datos del usuario fallaron
                }

                loginScreen.classList.add('hidden');
                mainApp.classList.remove('hidden');
                showView('view-main-menu');
                updateConnectionStatus();
                resetInactivityTimer();

            } catch (error) {
                console.error("Error crítico al obtener datos del usuario:", error);
                document.getElementById('user-name').textContent = user.email;
                document.getElementById('user-role-display').textContent = 'Error al cargar datos';
                // Quizás mostrar vista de error o intentar logout
            }

        } else {
            currentUser = null;
            currentUserData = null;
            clearTimeout(inactivityTimer);
            mainApp.classList.add('hidden');
            loginScreen.classList.remove('hidden');

            // *** CORRECCIÓN: Habilitar botón de login al cerrar sesión ***
            const loginButton = document.querySelector('#login-form button[type="submit"]');
            if (loginButton) {
                showButtonLoading(loginButton, false);
            }

            const authStatus = document.getElementById('auth-status');
            if (authStatus) {
                authStatus.textContent = '';
                authStatus.classList.add('hidden');
            }
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
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('¿Estás seguro de que deseas cerrar la sesión?')) {
                auth.signOut();
            }
        });
    }

    document.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', function () {
            if (this.type === 'button' && this.closest('#form-cliente') && !editingClientId) {
                // No resetear si es un botón 'Cancelar' dentro del form de edición
            } else if (this.closest('.menu-card')) {
                if (this.getAttribute('data-view') === 'view-cliente') {
                    resetClientForm(); // Resetear SIEMPRE al ir a registrar nuevo desde menú
                }
            }
            showView(this.getAttribute('data-view'));
        });
    });

    // Gestión Clientes
    const btnAplicarFiltros = document.getElementById('btn-aplicar-filtros');
    if (btnAplicarFiltros) btnAplicarFiltros.addEventListener('click', loadClientesTable);
    const btnLimpiarFiltros = document.getElementById('btn-limpiar-filtros');
    if (btnLimpiarFiltros) btnLimpiarFiltros.addEventListener('click', limpiarFiltrosClientes);
    const sucursalFiltroClientes = document.getElementById('sucursal_filtro');
    if (sucursalFiltroClientes) {
        sucursalFiltroClientes.addEventListener('change', (e) => _actualizarDropdownGrupo('grupo_filtro', e.target.value, 'Todos'));
    }

    // Gestión Usuarios
    const btnAplicarFiltrosUsuarios = document.getElementById('btn-aplicar-filtros-usuarios');
    if (btnAplicarFiltrosUsuarios) btnAplicarFiltrosUsuarios.addEventListener('click', loadUsersTable);
    const btnLimpiarFiltrosUsuarios = document.getElementById('btn-limpiar-filtros-usuarios');
    if (btnLimpiarFiltrosUsuarios) btnLimpiarFiltrosUsuarios.addEventListener('click', limpiarFiltrosUsuarios);
    const btnNuevoUsuario = document.getElementById('btn-nuevo-usuario');
    if (btnNuevoUsuario) btnNuevoUsuario.addEventListener('click', () => mostrarFormularioUsuario());
    const btnVerificarDuplicados = document.getElementById('btn-verificar-duplicados');
    if (btnVerificarDuplicados) btnVerificarDuplicados.addEventListener('click', handleVerificarDuplicados);
    const btnCancelarUsuario = document.getElementById('btn-cancelar-usuario');
    if (btnCancelarUsuario) btnCancelarUsuario.addEventListener('click', ocultarFormularioUsuario);
    const formUsuario = document.getElementById('form-usuario');
    if (formUsuario) formUsuario.addEventListener('submit', handleUserForm);
    const officeUsuarioForm = document.getElementById('nuevo-sucursal'); // <-- CAMBIO DE sucursalUsuarioForm A officeUsuarioForm
    if (officeUsuarioForm) {
        officeUsuarioForm.addEventListener('change', (e) => _cargarRutasParaUsuario(e.target.value));
    }
    // const btnDiagnosticarPagos = document.getElementById('btn-diagnosticar-pagos'); // Ya eliminado

    // Importar
    const officeSelect = document.getElementById('office-select');
    if (officeSelect) officeSelect.addEventListener('change', handleOfficeChange);
    document.querySelectorAll('.import-tab').forEach(tab => tab.addEventListener('click', handleTabClick));
    const btnProcesarImportacion = document.getElementById('btn-procesar-importacion');
    if (btnProcesarImportacion) btnProcesarImportacion.addEventListener('click', handleImport);
    // const btnLimpiarDatos = document.getElementById('btn-limpiar-datos'); // Sin cambios

    // Registrar Cliente
    const formCliente = document.getElementById('form-cliente');
    if (formCliente) formCliente.addEventListener('submit', handleClientForm);
    const curpCliente = document.getElementById('curp_cliente');
    if (curpCliente) curpCliente.addEventListener('input', () => validarCURP(curpCliente));
    const officeCliente = document.getElementById('office_cliente'); // Listener ya existente y correcto
    if (officeCliente) officeCliente.addEventListener('change', handleOfficeChangeForClientForm);

    // Generar Crédito
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

    // Registrar Pago
    const btnBuscarCreditoCobranza = document.getElementById('btnBuscarCredito_cobranza');
    if (btnBuscarCreditoCobranza) btnBuscarCreditoCobranza.addEventListener('click', handleSearchCreditForPayment);
    const formPagoSubmit = document.getElementById('form-pago-submit');
    if (formPagoSubmit) formPagoSubmit.addEventListener('submit', handlePaymentForm);
    const montoCobranza = document.getElementById('monto_cobranza');
    if (montoCobranza) montoCobranza.addEventListener('input', handleMontoPagoChange);

    // Pago Grupal
    // *** NUEVOS LISTENERS PARA COBRANZA RUTA ***
    const btnCalcularRuta = document.getElementById('btn-calcular-cobranza-ruta');
    if (btnCalcularRuta) btnCalcularRuta.addEventListener('click', handleCalcularCobranzaRuta);

    const btnGuardarOffline = document.getElementById('btn-guardar-cobranza-offline');
    if (btnGuardarOffline) btnGuardarOffline.addEventListener('click', handleGuardarCobranzaOffline);

    const btnRegistrarOffline = document.getElementById('btn-registrar-pagos-offline');
     // O se podría añadir aquí y llamar a handleRegistroPagoGrupal directamente
     if (btnRegistrarOffline) btnRegistrarOffline.addEventListener('click', handleRegistroPagoGrupal); // Llamar a la función existente

    // Reportes Básicos
    const btnActualizarReportes = document.getElementById('btn-actualizar-reportes');
    if (btnActualizarReportes) btnActualizarReportes.addEventListener('click', () => loadBasicReports(currentUserData?.office));

    // Reportes Avanzados
    const btnAplicarFiltrosReportes = document.getElementById('btn-aplicar-filtros-reportes');
    if (btnAplicarFiltrosReportes) btnAplicarFiltrosReportes.addEventListener('click', loadAdvancedReports);
    const btnExportarCsv = document.getElementById('btn-exportar-csv');
    if (btnExportarCsv) btnExportarCsv.addEventListener('click', exportToCSV);
    const btnExportarPdf = document.getElementById('btn-exportar-pdf');
    if (btnExportarPdf) btnExportarPdf.addEventListener('click', exportToPDF);
    const btnLimpiarFiltrosReportes = document.getElementById('btn-limpiar-filtros-reportes');
    if (btnLimpiarFiltrosReportes) btnLimpiarFiltrosReportes.addEventListener('click', limpiarFiltrosReportes);
    const sucursalFiltroReportes = document.getElementById('sucursal_filtro_reporte');
    if (sucursalFiltroReportes) {
        sucursalFiltroReportes.addEventListener('change', (e) => {
             _actualizarDropdownGrupo('grupo_filtro_reporte', e.target.value, 'Todos');
        });
    }

    // Reportes Gráficos
    const btnGenerarGrafico = document.getElementById('btn-generar-grafico');
    if (btnGenerarGrafico) btnGenerarGrafico.addEventListener('click', handleGenerarGrafico);
    const sucursalGrafico = document.getElementById('grafico_sucursal');
    if (sucursalGrafico) {
        sucursalGrafico.addEventListener('change', (e) => _actualizarDropdownGrupo('grafico_grupo', e.target.value, 'Todos'));
    }

    // ---- Configuración ----
        const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => document.getElementById('generic-modal').classList.add('hidden'));
    const modalOverlay = document.getElementById('generic-modal');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (event) => {
            if (event.target === modalOverlay) {
                modalOverlay.classList.add('hidden');
            }
        });
    }

    const formRegistrarGasto = document.getElementById('form-registrar-gasto');
    if (formRegistrarGasto) {
        formRegistrarGasto.addEventListener('submit', handleRegistrarGasto);
    }

    const formRegistrarEntrega = document.getElementById('form-registrar-entrega');
    if (formRegistrarEntrega) {
        formRegistrarEntrega.addEventListener('submit', handleRegistrarEntregaInicial);
    }

    const btnBuscarMovimientos = document.getElementById('btn-buscar-movimientos');
    if (btnBuscarMovimientos) {
        btnBuscarMovimientos.addEventListener('click', handleBuscarMovimientos);
    }

    const btnGenerarReporteContable = document.getElementById('btn-generar-reporte-contable');
    if (btnGenerarReporteContable) btnGenerarReporteContable.addEventListener('click', handleGenerarReporteContable);

    const btnImprimirReporteContable = document.getElementById('btn-imprimir-reporte-contable');
    if (btnImprimirReporteContable) btnImprimirReporteContable.addEventListener('click', () => window.print());

    const sucursalReporteContable = document.getElementById('reporte-contable-sucursal');
    if (sucursalReporteContable) sucursalReporteContable.addEventListener('change', handleSucursalReporteContableChange);

    const btnExportarTelefonos = document.getElementById('btn-exportar-telefonos');
    if (btnExportarTelefonos) btnExportarTelefonos.addEventListener('click', handleExportarTelefonos);    
}

console.log('app.js cargado correctamente y listo.');














