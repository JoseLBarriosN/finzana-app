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

/**
 * Parsea de forma robusta una fecha que puede ser un string (ISO 8601, yyyy-mm-dd, etc.)
 * o un objeto Timestamp de Firestore. Esta función es la clave para corregir las fechas existentes en la DB.
 * @param {string|object} fechaInput La cadena de texto o el objeto de fecha.
 * @returns {Date|null} Un objeto Date válido o null si el formato es incorrecto.
 */
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
    // Habilitar/deshabilitar filtros que dependen de queries más complejos online
    const filtrosOnline = document.querySelectorAll('#sucursal_filtro, #estado_credito_filtro, #plazo_filtro, #curp_aval_filtro, #grupo_filtro, #tipo_colocacion_filtro');
    const botonesOnline = document.querySelectorAll('#btn-aplicar-filtros-reportes, #btn-exportar-csv, #btn-exportar-pdf, #btn-generar-grafico, #btn-verificar-duplicados, #btn-diagnosticar-pagos, #btn-agregar-poblacion, #btn-agregar-ruta'); // Añadir más si aplica

    if (isOnline) {
        statusDiv.textContent = 'Conexión restablecida. Sincronizando datos...';
        statusDiv.className = 'connection-status online';
        statusDiv.classList.remove('hidden'); // Asegurar que sea visible
        logoutBtn.disabled = false;
        logoutBtn.title = 'Cerrar Sesión';
        filtrosOnline.forEach(el => { if (el) el.disabled = false; });
        botonesOnline.forEach(el => { if (el) el.disabled = false; });
        // Re-aplicar permisos de sucursal (algunos filtros pueden estar deshabilitados por rol)
        if (currentUserData) aplicarPermisosUI(currentUserData.role);

        // Mensaje temporal de sincronización
        setTimeout(() => {
            // Verificar si sigue online antes de mostrar "sincronizado"
            if (navigator.onLine) {
                statusDiv.textContent = 'Datos sincronizados correctamente.';
                // Ocultar después de un tiempo
                setTimeout(() => {
                    // Solo ocultar si sigue online
                    if (navigator.onLine) {
                        statusDiv.classList.add('hidden');
                    }
                }, 2500);
            }
        }, 3000);
    } else {
        statusDiv.textContent = 'Modo sin conexión. Búsquedas por CURP, Nombre e ID Crédito habilitadas.';
        statusDiv.className = 'connection-status offline';
        statusDiv.classList.remove('hidden'); // Asegurar que sea visible
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
    // El saldo en la DB (credito.saldo) puede estar desactualizado por importaciones.
    // Debemos confiar en la suma de los pagos para determinar el estado LIQUIDADO.
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
    // Usar el saldo RECALCULADO (saldoRestante), no el de la DB (credito.saldo).
    if (saldoRestante === 0) { // Chequeo estricto de 0, ya que lo forzamos arriba
        
        let semanasPagadasCalc = 0;
        if (pagoSemanal > 0.01) {
            const montoPagadoTotal = totalPagado; // Usar el totalPagado calculado
            const epsilon = 0.001;
            semanasPagadasCalc = Math.floor((montoPagadoTotal / pagoSemanal) + epsilon);
            semanasPagadasCalc = Math.min(Math.max(0, semanasPagadasCalc), credito.plazo);
        }
        
        // Si está liquidado por saldo, forzar al plazo completo
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
    // Si llegamos aquí, el crédito NO está liquidado y SÍ tiene saldo pendiente.
    // Ahora aplicamos la Regla #2 (estado por fecha de último pago).
    const fechaCreacion = parsearFecha(credito.fechaCreacion);
    if (!fechaCreacion) {
        console.warn("Fecha de creación de crédito inválida:", credito.fechaCreacion, "ID:", credito.id || credito.historicalIdCredito);
        return null; // Fecha inválida
    }

    // Encontrar la fecha de referencia (último pago o fecha de creación)
    // Asume que 'pagos' viene ordenado DESC (el más reciente primero)
    let fechaReferencia;
    if (pagos && pagos.length > 0) {
        // Ya están ordenados DESC en loadClientesTable, tomamos el primero
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
    // Aplicar las reglas del usuario (Regla #2):
    if (diasDesdeReferencia <= 7) {
        estadoDisplay = 'al corriente';
    } else if (diasDesdeReferencia > 7 && diasDesdeReferencia <= 30) { // > 1 semana y <= 1 mes (aprox)
        estadoDisplay = 'atrasado';
    } else if (diasDesdeReferencia > 30 && diasDesdeReferencia <= 180) { // > 1 mes y <= 6 meses (aprox)
        estadoDisplay = 'cobranza';
    } else { // Más de 180 días (6 meses)
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

    // Si ya pasó la fecha teórica de finalización y aún hay saldo (ya verificado que no es liquidado)
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
 * Muestra/oculta elementos del menú y ajusta filtros según el rol y sucursal del usuario.
 * @param {string} role El rol del usuario (ej. 'admin', 'Gerencia', 'Área comercial').
 */
function aplicarPermisosUI(role) {
    if (!currentUserData) return;

    // 1. Definir permisos del menú
    const permisosMenu = {
        'Super Admin': ['all'],
        'Gerencia': ['all'],
        'Administrador': [
            'view-gestion-clientes', 'view-cliente', 'view-colocacion', 'view-cobranza',
            'view-pago-grupo', 'view-reportes', 'view-reportes-avanzados',
            'view-usuarios', 'view-importar', 'view-configuracion'
            // Excluye 'view-reportes-graficos'
        ],
        'Área comercial': [
            'view-gestion-clientes', 'view-cliente', 'view-colocacion',
            'view-cobranza', 'view-pago-grupo'
        ],
        'default': [] // Para roles no definidos (como 'consulta', 'cobrador')
    };

    // Mapeo para roles que no se llamen igual que en la lista de permisos
    const userRoleKey = role === 'admin' ? 'Administrador' : role;
    const userPerms = permisosMenu[userRoleKey] || permisosMenu['default'];

    document.querySelectorAll('.menu-card').forEach(card => {
        const view = card.getAttribute('data-view');
        if (userPerms.includes('all') || userPerms.includes(view)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }

        // Excepción específica para Administrador
        if (userRoleKey === 'Administrador' && view === 'view-reportes-graficos') {
            card.style.display = 'none';
        }
    });

    // 2. Ajustar filtros y UI basados en la SUCURSAL del usuario
    const sucursalUsuario = currentUserData.sucursal;
    const filtrosSucursal = [
        '#sucursal_filtro', '#sucursal_filtro_reporte', '#grafico_sucursal',
        '#office_cliente', '#nueva-poblacion-sucursal', '#nueva-ruta-sucursal'
    ];

    if (sucursalUsuario && sucursalUsuario !== 'AMBAS') {
        filtrosSucursal.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) {
                el.value = sucursalUsuario;
                el.disabled = true;

                // Disparar 'change' para que los dropdowns dependientes se actualicen
                if (selector === '#office_cliente') {
                    handleOfficeChangeForClientForm.call(el);
                }
                if (selector === '#grafico_sucursal') {
                    handleSucursalGraficoChange.call(el);
                }
            }
        });
    } else {
        // Habilitar filtros si es AMBAS o no tiene sucursal definida
        filtrosSucursal.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) {
                el.disabled = false;
            }
        });
    }

    // 3. Ajustar UI específica (ej. CURP editable)
    const curpInput = document.getElementById('curp_cliente');
    if (curpInput) {
        // Permitir edición de CURP a Super Admin, Gerencia y Administrador
        const puedeEditarCURP = ['Super Admin', 'Gerencia', 'Administrador'].includes(userRoleKey);
        curpInput.readOnly = !puedeEditarCURP;

        // --- Corrección del Selector ---
        const curpFieldNote = curpInput.closest('.form-group')?.querySelector('.field-note'); // Busca el div.field-note dentro del .form-group padre
        if (curpFieldNote) {
            curpFieldNote.style.display = puedeEditarCURP ? 'block' : 'none';
        }
        // --- Fin Corrección ---
    }
}


// =============================================
// FUNCIONES MOVIDAS ANTES DE DOMContentLoaded
// =============================================

// --- Funciones de Gestión de Clientes ---
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
        const filtros = {
            sucursal: document.getElementById('sucursal_filtro')?.value || '',
            curp: document.getElementById('curp_filtro')?.value?.trim() || '',
            nombre: document.getElementById('nombre_filtro')?.value?.trim() || '',
            idCredito: document.getElementById('id_credito_filtro')?.value?.trim() || '',
            estado: document.getElementById('estado_credito_filtro')?.value || '',
            curpAval: document.getElementById('curp_aval_filtro')?.value?.trim() || '',
            plazo: document.getElementById('plazo_filtro')?.value || '',
            grupo: document.getElementById('grupo_filtro')?.value || '',
            userSucursal: currentUserData?.sucursal // <-- APLICAR SEGREGACIÓN
        };

        const hayFiltros = Object.values(filtros).some((val, key) => val && val.trim() !== '' && key !== 'userSucursal');
        if (!hayFiltros) {
            tbody.innerHTML = '<tr><td colspan="6">Por favor, especifica al menos un criterio de búsqueda.</td></tr>';
            throw new Error("Búsqueda vacía");
        }

        let creditosAMostrar = [];
        const clientesMap = new Map(); // Cache para client data

        showFixedProgress(25, 'Obteniendo datos base...');

        if (filtros.idCredito) {
            // --- PATH 1: Search by Credit ID (Historical ID) ---
            creditosAMostrar = await database.buscarCreditosPorHistoricalId(filtros.idCredito, { userSucursal: filtros.userSucursal });
        } else if (filtros.curp || filtros.nombre || filtros.grupo || filtros.sucursal) {
            // --- PATH 2: Search by Client Filters ---
            const clientesIniciales = await database.buscarClientes(filtros); // filtros ya incluye userSucursal

            if (operationId !== currentSearchOperation) throw new Error("Búsqueda cancelada");
            if (clientesIniciales.length === 0) throw new Error("No se encontraron clientes.");

            showFixedProgress(40, `Buscando créditos para ${clientesIniciales.length} clientes...`);

            let progress = 40;
            for (const [index, cliente] of clientesIniciales.entries()) {
                if (operationId !== currentSearchOperation) throw new Error("Búsqueda cancelada");
                clientesMap.set(cliente.curp, cliente);
                const creditosDelCliente = await database.buscarCreditosPorCliente(cliente.curp); // No necesita filtro sucursal, es por CURP
                creditosAMostrar.push(...creditosDelCliente);

                progress = 40 + Math.round((index / clientesIniciales.length) * 30);
                showFixedProgress(progress, `Revisando cliente ${index + 1} de ${clientesIniciales.length}`);
            }
        } else if (filtros.curpAval || filtros.plazo || filtros.estado) {
            // --- PATH 3: Search by Credit-Only Filters ---
            showFixedProgress(40, `Buscando créditos por filtros...`);
            creditosAMostrar = await database.buscarCreditos(filtros); // filtros ya incluye userSucursal
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
                cliente = await database.buscarClientePorCURP(credito.curpCliente, filtros.userSucursal); // Aplicar filtro sucursal aquí también
                if (cliente) {
                    clientesMap.set(cliente.curp, cliente);
                } else {
                    cliente = { id: null, nombre: 'Cliente no encontrado', curp: credito.curpCliente, poblacion_grupo: credito.poblacion_grupo || 'N/A', office: credito.office || 'N/A', isComisionista: false };
                    console.warn(`No se encontró cliente para CURP ${credito.curpCliente} asociado al crédito ID Firestore ${credito.id}`);
                }
            }

            // 2. Get Payments & Calculate Status
            const historicalId = credito.historicalIdCredito || credito.id;

            // *** CORRECCIÓN IMPORTANTE: Obtener pagos para el cálculo de estado ***
            const pagos = await database.getPagosPorCredito(historicalId, credito.office);
            // Ordenar pagos DESC (más reciente primero) para _calcularEstadoCredito
            pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0));
            const ultimoPago = pagos.length > 0 ? pagos[0] : null;

            const estadoCalculado = _calcularEstadoCredito(credito, pagos); // <-- Pasa los pagos

            if (!estadoCalculado) {
                console.warn(`No se pudo calcular el estado para el crédito ID Firestore ${credito.id} (Histórico: ${historicalId})`);
                continue;
            }

            // 3. Apply secondary filters
            if (filtros.estado && estadoCalculado.estado !== filtros.estado) continue;
            if (filtros.plazo && credito.plazo != filtros.plazo) continue;
            if (filtros.curpAval && (!credito.curpAval || !credito.curpAval.toUpperCase().includes(filtros.curpAval.toUpperCase()))) continue;
            // Filtros de cliente (nombre, curp, grupo, sucursal) ya se aplicaron en la búsqueda inicial (PATH 2) o se verifican aquí
            if (filtros.sucursal && cliente.office !== filtros.sucursal) continue; // Doble chequeo
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

            // Usar semanasPagadas del objeto estadoCalculado
            const semanasPagadas = estadoCalculado.semanasPagadas || 0;

            // Usar saldoRestante del objeto estadoCalculado
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

            // Pasar el objeto cliente completo a editCliente
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
            if (!el.disabled) { // No limpiar filtros deshabilitados (como sucursal)
                el.value = '';
            }
        });
    }
    inicializarVistaGestionClientes();
    showStatus('status_gestion_clientes', 'Filtros limpiados. Ingresa nuevos criterios para buscar.', 'info');
}

// --- Funciones de Reportes Avanzados ---
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
            sucursal: document.getElementById('sucursal_filtro_reporte')?.value || '',
            grupo: document.getElementById('grupo_filtro_reporte')?.value || '',
            ruta: document.getElementById('ruta_filtro_reporte')?.value || '',
            tipoCredito: document.getElementById('tipo_credito_filtro_reporte')?.value || '',
            estadoCredito: document.getElementById('estado_credito_filtro_reporte')?.value || '',
            tipoPago: document.getElementById('tipo_pago_filtro_reporte')?.value || '',
            fechaInicio: document.getElementById('fecha_inicio_reporte')?.value || '',
            fechaFin: document.getElementById('fecha_fin_reporte')?.value || '',
            curpCliente: document.getElementById('curp_filtro_reporte')?.value.trim().toUpperCase() || '',
            idCredito: document.getElementById('id_credito_filtro_reporte')?.value.trim() || '',
            userSucursal: currentUserData?.sucursal // <-- APLICAR SEGREGACIÓN
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
// INICIALIZACIÓN Y EVENT LISTENERS PRINCIPALES
// =============================================

document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM cargado, inicializando aplicación...');
    inicializarDropdowns();
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

                if (currentUserData) {
                    document.getElementById('user-name').textContent = currentUserData.name || user.email;
                    document.getElementById('user-role-display').textContent = currentUserData.role || 'Rol Desconocido';
                    // Aplicar permisos y filtros de sucursal
                    aplicarPermisosUI(currentUserData.role);
                } else {
                    console.warn(`No se encontraron datos en Firestore para el usuario ${user.uid}`);
                    document.getElementById('user-name').textContent = user.email;
                    document.getElementById('user-role-display').textContent = 'Datos no encontrados';
                    // Aplicar permisos por defecto (ninguno)
                    aplicarPermisosUI('default');
                }

                loginScreen.classList.add('hidden');
                mainApp.classList.remove('hidden');
                showView('view-main-menu');
                updateConnectionStatus();
                resetInactivityTimer();

            } catch (error) {
                console.error("Error al obtener datos del usuario:", error);
                document.getElementById('user-name').textContent = user.email;
                document.getElementById('user-role-display').textContent = 'Error al cargar datos';
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
    if (logoutBtn) logoutBtn.addEventListener('click', () => auth.signOut());

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
    const sucursalFiltroClientes = document.getElementById('sucursal_filtro'); // <-- Listener añadido
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
    const sucursalUsuarioForm = document.getElementById('nuevo-sucursal'); // <-- Listener añadido
    if (sucursalUsuarioForm) {
        sucursalUsuarioForm.addEventListener('change', (e) => _cargarRutasParaUsuario(e.target.value));
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
    const btnBuscarGrupoPago = document.getElementById('btn-buscar-grupo-pago');
    if (btnBuscarGrupoPago) btnBuscarGrupoPago.addEventListener('click', handleBuscarGrupoParaPago);
    const btnRegistrarPagoGrupal = document.getElementById('btn-registrar-pago-grupal');
    if (btnRegistrarPagoGrupal) btnRegistrarPagoGrupal.addEventListener('click', handleRegistroPagoGrupal);

    // Reportes Básicos
    const btnActualizarReportes = document.getElementById('btn-actualizar-reportes');
    if (btnActualizarReportes) btnActualizarReportes.addEventListener('click', () => loadBasicReports(currentUserData?.sucursal));

    // Reportes Avanzados
    const btnAplicarFiltrosReportes = document.getElementById('btn-aplicar-filtros-reportes');
    if (btnAplicarFiltrosReportes) btnAplicarFiltrosReportes.addEventListener('click', loadAdvancedReports);
    const btnExportarCsv = document.getElementById('btn-exportar-csv');
    if (btnExportarCsv) btnExportarCsv.addEventListener('click', exportToCSV);
    const btnExportarPdf = document.getElementById('btn-exportar-pdf');
    if (btnExportarPdf) btnExportarPdf.addEventListener('click', exportToPDF);
    const btnLimpiarFiltrosReportes = document.getElementById('btn-limpiar-filtros-reportes');
    if (btnLimpiarFiltrosReportes) btnLimpiarFiltrosReportes.addEventListener('click', limpiarFiltrosReportes);
    const sucursalFiltroReportes = document.getElementById('sucursal_filtro_reporte'); // <-- Listener añadido
    if (sucursalFiltroReportes) {
        sucursalFiltroReportes.addEventListener('change', (e) => {
             _actualizarDropdownGrupo('grupo_filtro_reporte', e.target.value, 'Todos');
             // Podrías filtrar rutas aquí también si lo necesitas en el futuro
        });
    }

    // Reportes Gráficos
    const btnGenerarGrafico = document.getElementById('btn-generar-grafico');
    if (btnGenerarGrafico) btnGenerarGrafico.addEventListener('click', handleGenerarGrafico);
    const sucursalGrafico = document.getElementById('grafico_sucursal'); // <-- Listener añadido/modificado
    if (sucursalGrafico) {
        sucursalGrafico.addEventListener('change', (e) => _actualizarDropdownGrupo('grafico_grupo', e.target.value, 'Todos'));
    }

   // Configuración
    const btnAgregarPoblacion = document.getElementById('btn-agregar-poblacion');
    if (btnAgregarPoblacion) btnAgregarPoblacion.addEventListener('click', () => handleAgregarConfig('poblacion'));
    const btnAgregarRuta = document.getElementById('btn-agregar-ruta');
    if (btnAgregarRuta) btnAgregarRuta.addEventListener('click', () => handleAgregarConfig('ruta'));
    const listaPoblaciones = document.getElementById('lista-poblaciones');
    if (listaPoblaciones) listaPoblaciones.addEventListener('click', (e) => { /* ... (sin cambios) ... */ });
    const listaRutas = document.getElementById('lista-rutas');
    if (listaRutas) listaRutas.addEventListener('click', (e) => { /* ... (sin cambios) ... */ });

    // Modal
    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => document.getElementById('generic-modal').classList.add('hidden'));
    const modalOverlay = document.getElementById('generic-modal');
    if (modalOverlay) {
        // El addEventListener DEBE estar DENTRO del bloque if
        modalOverlay.addEventListener('click', (event) => {
            // Si se hace clic en el fondo oscuro (el overlay mismo)
            if (event.target === modalOverlay) {
                modalOverlay.classList.add('hidden'); // Ocultar el modal
            }
        });
        // La llave de cierre del 'if' va AQUÍ, después del addEventListener
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
async function mostrarFormularioUsuario(usuario = null) { // Añadir async
    const formContainer = document.getElementById('form-usuario-container');
    const formTitulo = document.getElementById('form-usuario-titulo');
    const form = document.getElementById('form-usuario');
    const passwordInput = document.getElementById('nuevo-password');
    const emailInput = document.getElementById('nuevo-email');
    const sucursalSelect = document.getElementById('nuevo-sucursal'); // <-- Obtener selector de sucursal
    const rutaSelect = document.getElementById('nuevo-ruta'); // <-- Obtener selector de ruta

    if (!formContainer || !formTitulo || !form || !sucursalSelect || !rutaSelect) return;

    form.reset();
    let sucursalUsuario = ''; // <-- Variable para guardar la sucursal

    if (usuario) {
        editingUserId = usuario.id;
        formTitulo.textContent = 'Editar Usuario';
        document.getElementById('nuevo-nombre').value = usuario.name || '';
        emailInput.value = usuario.email || '';
        emailInput.readOnly = true;
        document.getElementById('nuevo-rol').value = usuario.role || '';
        sucursalUsuario = usuario.sucursal || ''; // <-- Guardar sucursal
        sucursalSelect.value = sucursalUsuario;
        passwordInput.required = false;
        passwordInput.placeholder = "Dejar en blanco para no cambiar";
    } else {
        editingUserId = null;
        formTitulo.textContent = 'Nuevo Usuario';
        emailInput.readOnly = false;
        passwordInput.required = true;
        passwordInput.placeholder = "Mínimo 6 caracteres";
        sucursalUsuario = ''; // <-- Vacío para nuevo
        sucursalSelect.value = ''; // Resetear sucursal
    }

    // Cargar rutas DESPUÉS de establecer la sucursal
    await _cargarRutasParaUsuario(sucursalUsuario);

    // Si estamos editando, intentar seleccionar la ruta guardada
    if (usuario && usuario.ruta) {
         // Esperar un instante por si la carga fue muy rápida
         setTimeout(() => {
            rutaSelect.value = usuario.ruta;
            if(rutaSelect.value !== usuario.ruta) {
                console.warn(`La ruta guardada "${usuario.ruta}" no se encontró en la lista para la sucursal ${sucursalUsuario}.`);
                // Opcional: Añadir la opción si no existe? Podría ser confuso.
                // const option = new Option(usuario.ruta, usuario.ruta, false, true);
                // rutaSelect.add(option);
            }
         }, 50); // Pequeña espera
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
                sucursal: document.getElementById('nuevo-sucursal').value,
                ruta: document.getElementById('nuevo-ruta').value || null // <-- AÑADIR RUTA (null si está vacía)
            };
            if (!userData.name || !userData.role || !userData.sucursal) { // Ruta es opcional
                throw new Error('Nombre, Rol y Sucursal son obligatorios.');
            }
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
            const sucursal = document.getElementById('nuevo-sucursal').value;
            const ruta = document.getElementById('nuevo-ruta').value || null; // <-- OBTENER RUTA

            if (!email || !password || !nombre || !rol || !sucursal) { // Ruta es opcional
                throw new Error('Email, Contraseña, Nombre, Rol y Sucursal son obligatorios para crear un usuario.');
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
                id: user.uid,
                email,
                name: nombre,
                role: rol,
                sucursal: sucursal,
                ruta: ruta, // <-- AÑADIR RUTA AL GUARDAR
                createdAt: new Date().toISOString(),
                status: 'active'
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
    if (cargaEnProgreso) {
        showStatus('status_usuarios', 'Ya hay una búsqueda en progreso, por favor espera.', 'warning');
        return;
    }
    cargaEnProgreso = true;
    const tbody = document.getElementById('tabla-usuarios');
    tbody.innerHTML = '<tr><td colspan="7"><div class="spinner" style="margin: 20px auto; border-top-color: var(--primary);"></div></td></tr>'; // <-- COLSPAN 7
    showButtonLoading('#btn-aplicar-filtros-usuarios', true, 'Buscando...');
    showStatus('status_usuarios', '', 'info');

    try {
        const resultado = await database.obtenerUsuarios();
        if (!resultado.success) throw new Error(resultado.message);
        let usuarios = resultado.data || [];

        const filtroEmail = (document.getElementById('filtro-email-usuario')?.value || '').trim().toLowerCase();
        const filtroNombre = (document.getElementById('filtro-nombre-usuario')?.value || '').trim().toLowerCase();
        const filtroRol = document.getElementById('filtro-rol-usuario')?.value || '';
        const filtroSucursalUsuario = document.getElementById('filtro-sucursal-usuario')?.value || ''; // <-- Filtro de sucursal de la UI

        const usuariosFiltrados = usuarios.filter(usuario => {
            const emailMatch = !filtroEmail || (usuario.email && usuario.email.toLowerCase().includes(filtroEmail));
            const nombreMatch = !filtroNombre || (usuario.name && usuario.name.toLowerCase().includes(filtroNombre));
            const rolMatch = !filtroRol || usuario.role === filtroRol;
            const sucursalUiMatch = !filtroSucursalUsuario || usuario.sucursal === filtroSucursalUsuario || (filtroSucursalUsuario === 'AMBAS' && usuario.sucursal === 'AMBAS'); // <-- Match con filtro UI

            // Filtrar por sucursal del admin logueado (seguridad)
            const sucursalAdmin = currentUserData?.sucursal;
            const sucursalAdminMatch = !sucursalAdmin || sucursalAdmin === 'AMBAS' || usuario.sucursal === sucursalAdmin || !usuario.sucursal;

            return emailMatch && nombreMatch && rolMatch && sucursalUiMatch && sucursalAdminMatch;
        });

        tbody.innerHTML = '';

        if (usuariosFiltrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">No se encontraron usuarios que coincidan con los filtros.</td></tr>'; // <-- COLSPAN 7
            showStatus('status_usuarios', 'No se encontraron usuarios.', 'info');
        } else {
            usuariosFiltrados.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            usuariosFiltrados.forEach(usuario => {
                const tr = document.createElement('tr');
                if (usuario.status === 'disabled') {
                    tr.style.opacity = '0.5';
                    tr.title = 'Usuario deshabilitado';
                }
                const roleBadgeClass = `role-${(usuario.role || 'default').toLowerCase().replace(/\s/g, '-')}`; // Asegurar clase CSS válida
                const usuarioJsonString = JSON.stringify(usuario).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

                tr.innerHTML = `
                    <td>${usuario.email || 'N/A'}</td>
                    <td>${usuario.name || 'N/A'}</td>
                    <td><span class="role-badge ${roleBadgeClass}">${usuario.role || 'Sin Rol'}</span></td>
                    <td>${usuario.sucursal || 'N/A'}</td>
                    <td>${usuario.ruta || '--'}</td> <td>${usuario.status === 'disabled' ? 'Deshabilitado' : 'Activo'}</td>
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
        tbody.innerHTML = `<tr><td colspan="7">Error al cargar usuarios: ${error.message}</td></tr>`; // <-- COLSPAN 7
        showStatus('status_usuarios', `Error: ${error.message}`, 'error');
    } finally {
        cargaEnProgreso = false;
        showButtonLoading('#btn-aplicar-filtros-usuarios', false);
    }
}

function limpiarFiltrosUsuarios() {
    if (cargaEnProgreso) {
        console.warn("Intento de limpiar filtros mientras carga estaba en progreso. Cancelando carga.");
        cancelarCarga();
    }
    document.getElementById('filtro-email-usuario').value = '';
    document.getElementById('filtro-nombre-usuario').value = '';
    document.getElementById('filtro-rol-usuario').value = '';
    loadUsersTable();
    showStatus('status_usuarios', 'Filtros limpiados.', 'info');
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
 * Carga las rutas en el dropdown del formulario de usuario, filtradas por sucursal.
 * @param {string} sucursal La sucursal seleccionada ('GDL', 'LEON', 'AMBAS', o '').
 */
async function _cargarRutasParaUsuario(sucursal) {
    const rutaSelect = document.getElementById('nuevo-ruta');
    if (!rutaSelect) return;

    rutaSelect.innerHTML = '<option value="">Cargando rutas...</option>';
    rutaSelect.disabled = true;

    try {
        // Si es 'AMBAS' o vacía, no asignamos ruta específica de sucursal
        if (sucursal === 'AMBAS' || !sucursal) {
             popularDropdown('nuevo-ruta', [], '-- Sin asignar --');
             rutaSelect.disabled = true; // No se puede asignar ruta si es de ambas o no tiene sucursal
             return;
        }

        const rutas = await database.obtenerRutas(sucursal);
        const rutasNombres = rutas.map(r => r.nombre).sort();
        popularDropdown('nuevo-ruta', rutasNombres, '-- Sin asignar --');
        rutaSelect.disabled = false;
    } catch (error) {
        console.error("Error cargando rutas para usuario:", error);
        popularDropdown('nuevo-ruta', [], 'Error al cargar');
    }
}
/**
 * Actualiza un dropdown de Grupo/Población filtrando por sucursal.
 * @param {string} selectId ID del elemento <select> a actualizar.
 * @param {string} sucursal Sucursal seleccionada ('GDL', 'LEON', '' para todas).
 * @param {string} placeholder Texto para la opción por defecto.
 */
async function _actualizarDropdownGrupo(selectId, sucursal, placeholder) {
    const selectElement = document.getElementById(selectId);
    if (!selectElement) return;

    const currentValue = selectElement.value; // Guardar valor actual si existe
    selectElement.innerHTML = `<option value="">Cargando...</option>`;
    selectElement.disabled = true;

    try {
        const poblaciones = await database.obtenerPoblaciones(sucursal || null); // null para obtener todas si sucursal es ''
        const nombres = [...new Set(poblaciones.map(p => p.nombre))].sort(); // Usar Set para evitar duplicados si se piden todas
        popularDropdown(selectId, nombres, placeholder);

        // Intentar restaurar el valor previo si aún es válido
        if (nombres.includes(currentValue)) {
            selectElement.value = currentValue;
        } else {
             selectElement.value = ""; // Resetear si el valor anterior ya no está
        }

    } catch (error) {
        console.error(`Error actualizando dropdown ${selectId}:`, error);
        popularDropdown(selectId, [], 'Error al cargar');
    } finally {
        selectElement.disabled = false;
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
        const cliente = await database.buscarClientePorCURP(curp, currentUserData?.sucursal); // Aplicar segregación

        if (!cliente) {
            showFixedProgress(100, 'Cliente no encontrado');
            throw new Error('Cliente no encontrado en la base de datos para tu sucursal. Por favor, regístrelo primero.');
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
        const creditosEncontrados = await database.buscarCreditosPorHistoricalId(historicalIdCredito, { userSucursal: currentUserData?.sucursal }); // Aplicar segregación

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
        const cliente = await database.buscarClientePorCURP(creditoActual.curpCliente, currentUserData?.sucursal); // Aplicar segregación
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
async function handleBuscarGrupoParaPago() {
    const grupoSelect = document.getElementById('grupo_pago_grupal');
    const grupo = grupoSelect.value;
    const statusPagoGrupo = document.getElementById('status_pago_grupo');
    const btnBuscar = document.getElementById('btn-buscar-grupo-pago');
    const tablaDetalleBody = document.getElementById('tabla-pago-grupal-detalle-body'); // <-- Elemento para la nueva tabla
    const resumenDiv = document.getElementById('grupo-pago-resumen'); // <-- Nuevo div para resumen

    if (!grupo) {
        showStatus('status_pago_grupo', 'Por favor, selecciona un grupo.', 'warning');
        detailsDiv.classList.add('hidden');
        return;
    }
    if (!tablaDetalleBody || !resumenDiv) {
        return;
    }

    showButtonLoading(btnBuscar, true, 'Calculando...');
    showProcessingOverlay(true, `Buscando créditos activos en el grupo ${grupo}...`);
    statusPagoGrupo.innerHTML = 'Calculando cobranza para el grupo...';
    statusPagoGrupo.className = 'status-message status-info';
    tablaDetalleBody.innerHTML = '<tr><td colspan="5">Buscando...</td></tr>'; // <-- Limpiar tabla
    resumenDiv.innerHTML = ''; // Limpiar resumen
    grupoDePagoActual = null;

    try {
        // *** NUEVO: Determinar si hay que filtrar por ruta ***
        let filtroRuta = null;
        if (currentUserData?.role === 'Área comercial' && currentUserData.ruta) {
            filtroRuta = currentUserData.ruta;
            console.log(`Filtrando pago grupal por ruta asignada: ${filtroRuta}`);
        }

        // *** Pasar filtroRuta a buscarClientes ***
        const clientesDelGrupo = await database.buscarClientes({
            grupo: grupo,
            ruta: filtroRuta, // <-- AÑADIR FILTRO RUTA
            userSucursal: currentUserData?.sucursal // Aplicar segregación de sucursal
        });

        if (clientesDelGrupo.length === 0) {
             throw new Error(`No se encontraron clientes en el grupo '${grupo}' ${filtroRuta ? `y ruta '${filtroRuta}'` : ''} (en tu sucursal).`);
        }
        
        let totalClientesConPago = 0;
        let totalACobrarSemanal = 0;
        let creditosParaPagar = []; // Array para guardar datos detallados
        let clientesConErrores = [];
        tablaDetalleBody.innerHTML = ''; // Limpiar tabla antes de llenar

        for (const cliente of clientesDelGrupo) {
            const creditoActivo = await database.buscarCreditoActivoPorCliente(cliente.curp);

            // *** CORRECCIÓN: Usar la lógica de _calcularEstadoCredito para asegurar que no esté liquidado por pagos ***
            if (creditoActivo) {
                 const pagos = await database.getPagosPorCredito(creditoActivo.historicalIdCredito || creditoActivo.id, creditoActivo.office);
                 pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0));
                 const estadoCalc = _calcularEstadoCredito(creditoActivo, pagos);

                // Solo incluir si NO está liquidado y tiene pago semanal > 0
                if (estadoCalc && estadoCalc.estado !== 'liquidado' && estadoCalc.pagoSemanal > 0.01) {
                    // *** OPCIONAL: Lógica para "Pago Pendiente" ***
                     // Comprobar si ya pagó esta semana o si está muy atrasado
                     // Esta lógica puede ser compleja (definir "esta semana", etc.)
                     // Por ahora, incluimos a todos los activos con pago > 0
                     let esPagoPendiente = true; // Simplificación: asumimos pendiente si está activo
                     // A FUTURO: const diasDesdeUltimoPago = ... calcular ...; if (diasDesdeUltimoPago < 7) esPagoPendiente = false;

                     if (esPagoPendiente) {
                        totalClientesConPago++;
                        totalACobrarSemanal += estadoCalc.pagoSemanal;
                        const creditoDetalle = {
                            firestoreId: creditoActivo.id,
                            historicalIdCredito: creditoActivo.historicalIdCredito || creditoActivo.id,
                            curpCliente: cliente.curp,
                            nombreCliente: cliente.nombre,
                            pagoSemanal: estadoCalc.pagoSemanal,
                            saldoRestante: estadoCalc.saldoRestante, // <-- Guardar saldo restante
                            office: creditoActivo.office // Guardar sucursal para el pago
                        };
                        creditosParaPagar.push(creditoDetalle);

                        // *** Añadir fila a la tabla ***
                        const row = tablaDetalleBody.insertRow();
                        row.innerHTML = `
                            <td>${cliente.nombre}</td>
                            <td>${cliente.curp}</td>
                            <td>${creditoDetalle.historicalIdCredito}</td>
                            <td class="monto-pago">$${estadoCalc.pagoSemanal.toFixed(2)}</td>
                            <td>
                                <input type="checkbox" class="pago-grupal-check" data-firestore-id="${creditoActivo.id}" checked>
                                <input type="number" class="pago-grupal-monto-individual" value="${estadoCalc.pagoSemanal.toFixed(2)}" step="0.01" style="width: 80px; display: none;">
                            </td>
                        `;
                     }

                } else if (!estadoCalc) {
                    clientesConErrores.push(`${cliente.nombre} (${cliente.curp}) - Datos inconsistentes`);
                } else if (estadoCalc.pagoSemanal <= 0.01) {
                     clientesConErrores.push(`${cliente.nombre} (${cliente.curp}) - Pago semanal 0`);
                }
            }
        } // Fin del bucle for clientes

        if (totalClientesConPago === 0) {
             let msg = `No se encontraron créditos activos con pago semanal > 0 en el grupo '${grupo}' ${filtroRuta ? `y ruta '${filtroRuta}'` : ''}.`;
             if (clientesConErrores.length > 0) msg += ` (${clientesConErrores.length} clientes con datos inconsistentes omitidos).`;
             throw new Error(msg);
        }

        // Guardar datos para el registro
        grupoDePagoActual = {
            grupo: grupo,
            ruta: filtroRuta, // Guardar la ruta filtrada
            creditos: creditosParaPagar // Guardar la lista detallada
        };

        // Mostrar resumen
        resumenDiv.innerHTML = `
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Clientes con Pago Semanal > $0.01:</span>
                    <span class="info-value">${totalClientesConPago}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Total Cobranza Esperada:</span>
                    <span class="info-value" id="total-calculado-grupal">$${totalACobrarSemanal.toFixed(2)}</span>
                </div>
            </div>
            <div class="form-group" style="margin-top: 15px;">
                 <label for="monto-recibido-grupo">Monto Total Recibido HOY:</label>
                 <input type="number" id="monto-recibido-grupo" step="0.01" value="${totalACobrarSemanal.toFixed(2)}">
                 <div class="field-note">Ajusta si el total recibido es diferente. El sistema registrará los pagos individuales marcados.</div>
            </div>
            <button id="btn-registrar-pago-grupal" class="btn btn-success"><i class="fas fa-check-circle"></i> Registrar Pagos Marcados</button>
         `;
         // Re-asociar listener al botón recién creado
         const btnRegistrar = document.getElementById('btn-registrar-pago-grupal');
         if(btnRegistrar) btnRegistrar.addEventListener('click', handleRegistroPagoGrupal);


        // Mostrar tabla y resumen
        document.getElementById('grupo-pago-tabla-container').classList.remove('hidden'); // <-- Mostrar contenedor de tabla/resumen

        let successMsg = `Se encontraron ${totalClientesConPago} créditos para cobrar en '${grupo}' ${filtroRuta ? ` / ruta '${filtroRuta}'` : ''}. Verifica la lista.`;
        if (clientesConErrores.length > 0) {
             successMsg += ` (${clientesConErrores.length} omitidos).`;
             showStatus('status_pago_grupo', successMsg, 'warning');
        } else {
             showStatus('status_pago_grupo', successMsg, 'success');
        }

    } catch (error) {
        console.error("Error al buscar grupo para pago:", error);
        showStatus('status_pago_grupo', `Error: ${error.message}`, 'error');
        // Ocultar tabla y resumen en caso de error
        document.getElementById('grupo-pago-tabla-container').classList.add('hidden');
        tablaDetalleBody.innerHTML = `<tr><td colspan="5">Error al buscar: ${error.message}</td></tr>`;
        resumenDiv.innerHTML = '';
        grupoDePagoActual = null;
    } finally {
        showButtonLoading(btnBuscar, false);
        showProcessingOverlay(false);
    }
}


async function handleRegistroPagoGrupal() {
    const btnRegistrar = document.getElementById('btn-registrar-pago-grupal');
    const statusPagoGrupo = document.getElementById('status_pago_grupo');
    const montoRecibidoInput = document.getElementById('monto-recibido-grupo');

    if (!grupoDePagoActual || !grupoDePagoActual.creditos || grupoDePagoActual.creditos.length === 0) {
        showStatus('status_pago_grupo', 'Error: No hay un grupo calculado o no hay créditos para registrar.', 'error');
        return;
    }

    const montoRecibido = parseFloat(montoRecibidoInput.value);
    const { creditos, totalCalculado, grupo } = grupoDePagoActual;

    if (isNaN(montoRecibido) || montoRecibido <= 0) {
        showStatus('status_pago_grupo', 'Error: El monto total recibido debe ser un número positivo.', 'error');
        montoRecibidoInput.classList.add('input-error');
        return;
    } else {
        montoRecibidoInput.classList.remove('input-error');
    }

    const tolerancia = 0.015;
    if (montoRecibido < totalCalculado - tolerancia) {
        showStatus('status_pago_grupo', `Advertencia: El monto recibido ($${montoRecibido.toFixed(2)}) es menor al total calculado ($${totalCalculado.toFixed(2)}). El pago grupal solo registra el pago semanal completo. Registra faltantes individualmente.`, 'warning');
        return;
    }
    if (montoRecibido > totalCalculado + tolerancia) {
        showStatus('status_pago_grupo', `Advertencia: El monto recibido ($${montoRecibido.toFixed(2)}) es mayor al total calculado ($${totalCalculado.toFixed(2)}). Solo se registrará el pago semanal ($${totalCalculado.toFixed(2)}). Registra pagos extraordinarios individualmente.`, 'warning');
    }

    showButtonLoading(btnRegistrar, true, 'Registrando...');
    showProcessingOverlay(true, `Registrando ${creditos.length} pagos para el grupo ${grupo}...`);
    statusPagoGrupo.innerHTML = 'Registrando pagos grupales...';
    statusPagoGrupo.className = 'status-message status-info';

    try {
        let pagosRegistrados = 0;
        const erroresRegistro = [];
        const MAX_BATCH_SIZE = 100; // Reducir el tamaño del lote para evitar timeouts de transacción

        for (let i = 0; i < creditos.length; i += MAX_BATCH_SIZE) {
            const chunk = creditos.slice(i, i + MAX_BATCH_SIZE);
            showProcessingOverlay(true, `Procesando lote ${Math.floor(i / MAX_BATCH_SIZE) + 1} de ${Math.ceil(creditos.length / MAX_BATCH_SIZE)}...`);

            // Usar transacciones individuales por lote
            await db.runTransaction(async (transaction) => {
                const creditosRefs = chunk.map(c => db.collection('creditos').doc(c.firestoreId));
                const creditosDocs = await Promise.all(creditosRefs.map(ref => transaction.get(ref)));

                for (let j = 0; j < chunk.length; j++) {
                    const creditoInfo = chunk[j];
                    const creditoDoc = creditosDocs[j];
                    
                    if (creditoDoc.exists) {
                        const creditoActualData = creditoDoc.data();
                        
                        // Validar saldo *dentro* de la transacción
                        // Nota: getPagosPorCredito no puede estar en la transacción,
                        //       así que confiamos en que el estado calculado en handleBuscarGrupoParaPago
                        //       sigue siendo mayormente válido. La transacción protege contra concurrencia.
                        const estadoCalc = _calcularEstadoCredito(creditoActualData, []); // Usamos un array vacío aquí, la validación principal ya se hizo.
                                                                                       // La transacción se basa en creditoActualData.saldo que sí lee.
                        
                        if (creditoActualData.saldo > 0.01) { // Validar con el saldo leído en la transacción
                            const pagoMonto = creditoInfo.pagoSemanal;
                            // Asegurarse de no sobrepagar con el saldo de la transacción
                            const montoAPagar = Math.min(pagoMonto, creditoActualData.saldo);
                            const nuevoSaldo = creditoActualData.saldo - montoAPagar;
                            
                            const creditoRef = creditoDoc.ref;
                            transaction.update(creditoRef, {
                                saldo: (nuevoSaldo <= 0.01) ? 0 : nuevoSaldo,
                                estado: (nuevoSaldo <= 0.01) ? 'liquidado' : creditoActualData.estado, // Marcar liquidado si saldo llega a 0
                                modificadoPor: currentUser.email,
                                fechaModificacion: new Date().toISOString()
                            });

                            const pagoRef = db.collection('pagos').doc();
                            transaction.set(pagoRef, {
                                idCredito: creditoInfo.historicalIdCredito,
                                monto: montoAPagar,
                                tipoPago: 'grupal',
                                fecha: new Date().toISOString(),
                                saldoDespues: (nuevoSaldo <= 0.01) ? 0 : nuevoSaldo,
                                registradoPor: currentUser.email,
                                office: creditoInfo.office,
                                curpCliente: creditoActualData.curpCliente,
                                grupo: grupo
                            });
                            pagosRegistrados++;
                        } else {
                            console.log(`Crédito ${creditoInfo.historicalIdCredito} ya liquidado (saldo DB: ${creditoActualData.saldo}), omitiendo pago grupal.`);
                        }
                    } else {
                        erroresRegistro.push(`Crédito Doc ${creditoInfo.firestoreId} no existe.`);
                    }
                }
            }); // Fin de la transacción

            console.log(`Lote de ${chunk.length} pagos grupales procesado.`);
            if (i + MAX_BATCH_SIZE < creditos.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }


        let finalMessage = `¡Éxito! Se registraron ${pagosRegistrados} pagos grupales para el grupo '${grupo}'.`;
        let finalStatusType = 'success';

        if (erroresRegistro.length > 0) {
            finalMessage += ` Se encontraron ${erroresRegistro.length} errores: ${erroresRegistro.join(', ')}`;
            finalStatusType = 'warning';
            console.error("Errores durante registro de pago grupal:", erroresRegistro);
        }

        showStatus('status_pago_grupo', finalMessage, finalStatusType);

        document.getElementById('grupo-pago-details').classList.add('hidden');
        document.getElementById('grupo_pago_grupal').value = '';
        montoRecibidoInput.value = '';
        grupoDePagoActual = null;

    } catch (error) {
        console.error("Error crítico al registrar pago grupal:", error);
        showStatus('status_pago_grupo', `Error crítico al registrar los pagos: ${error.message}. Es posible que algunos pagos no se hayan completado.`, 'error');
    } finally {
        showButtonLoading(btnRegistrar, false);
        showProcessingOverlay(false);
    }
}

/**
 * Carga y muestra las estadísticas básicas del sistema.
 * @param {string} userSucursal La sucursal del usuario (opcional).
 */
async function loadBasicReports(userSucursal = null) {
    console.log(`Cargando reportes básicos para sucursal: ${userSucursal || 'Todas'}...`);
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
        const reportes = await database.generarReportes(userSucursal); // Aplicar segregación

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

// =============================================
// SECCIÓN DE REPORTES GRÁFICOS (MODIFICADA)
// =============================================

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
        const sucursal = document.getElementById('grafico_sucursal').value;
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
            sucursal,
            grupo,
            fechaInicio,
            fechaFin,
            userSucursal: currentUserData?.sucursal // Aplicar segregación
        });

        statusGraficos.textContent = 'Procesando datos para el gráfico...';

        let datasets = [];
        let labels = [];
        let labelPrefix = '';

        const colores = {
            GDL: 'rgba(46, 139, 87, 0.7)', // --primary
            LEON: 'rgba(30, 144, 255, 0.7)', // --secondary
            GDL_border: 'rgba(46, 139, 87, 1)',
            LEON_border: 'rgba(30, 144, 255, 1)',
            default: 'rgba(46, 139, 87, 0.7)',
            default_border: 'rgba(46, 139, 87, 1)'
        };

        const agruparDatos = (data, campoFecha, campoValor, filtroSucursal = null) => {
            const agrupados = {};
            const datosFiltrados = filtroSucursal ? data.filter(item => item.office === filtroSucursal) : data;

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
            // Comportamiento no se agrupa por fecha, sino por tipo
            labelPrefix = 'Monto por Tipo de Pago';
        }

        // *** LÓGICA DE MÚLTIPLES DATASETS ***
        if (tipoReporte === 'comportamiento') {
            // Agrupar por tipo de pago, separado por sucursal si "Ambas" está seleccionado
            const sucursalesAProcesar = (sucursal === '') ? ['GDL', 'LEON'] : [sucursal];
            let datosAgrupados = {};

            sucursalesAProcesar.forEach(suc => {
                const pagosSucursal = (sucursal === '') ? pagos.filter(p => p.office === suc) : pagos;
                pagosSucursal.forEach(pago => {
                    const tipo = (pago.tipoPago || 'normal').toLowerCase();
                    const clave = tipo.charAt(0).toUpperCase() + tipo.slice(1);
                    if (!datosAgrupados[clave]) datosAgrupados[clave] = {};
                    if (!datosAgrupados[clave][suc]) datosAgrupados[clave][suc] = 0;
                    datosAgrupados[clave][suc] += parseFloat(pago.monto || 0);
                });
            });

            labels = Object.keys(datosAgrupados).sort();

            datasets = sucursalesAProcesar.map(suc => ({
                label: `${labelPrefix} (${suc})`,
                data: labels.map(label => datosAgrupados[label][suc] || 0),
                backgroundColor: colores[suc],
                borderColor: colores[`${suc}_border`],
                borderWidth: (tipoGrafico === 'line') ? 2 : 1,
                fill: (tipoGrafico === 'line') ? false : true,
                tension: (tipoGrafico === 'line') ? 0.1 : 0
            }));

        } else {
            // Lógica para Colocación y Recuperación (agrupados por fecha)
            if (sucursal === '') { // AMBAS SUCURSALES
                const datosGDL = agruparDatos(dataToProcess, campoFecha, campoValor, 'GDL');
                const datosLEON = agruparDatos(dataToProcess, campoFecha, campoValor, 'LEON');
                labels = [...new Set([...Object.keys(datosGDL), ...Object.keys(datosLEON)])].sort();

                datasets.push({
                    label: `${labelPrefix} (GDL)`,
                    data: labels.map(label => datosGDL[label] || 0),
                    backgroundColor: colores.GDL,
                    borderColor: colores.GDL_border,
                    borderWidth: (tipoGrafico === 'line') ? 2 : 1,
                    fill: (tipoGrafico === 'line') ? false : true,
                    tension: (tipoGrafico === 'line') ? 0.1 : 0
                });
                datasets.push({
                    label: `${labelPrefix} (LEON)`,
                    data: labels.map(label => datosLEON[label] || 0),
                    backgroundColor: colores.LEON,
                    borderColor: colores.LEON_border,
                    borderWidth: (tipoGrafico === 'line') ? 2 : 1,
                    fill: (tipoGrafico === 'line') ? false : true,
                    tension: (tipoGrafico === 'line') ? 0.1 : 0
                });

            } else { // UNA SOLA SUCURSAL
                const datosAgrupados = agruparDatos(dataToProcess, campoFecha, campoValor);
                labels = Object.keys(datosAgrupados).sort();
                datasets.push({
                    label: `${labelPrefix}${sucursal ? ` (${sucursal})` : ''}${grupo ? ` [${grupo}]` : ''}`,
                    data: labels.map(label => datosAgrupados[label]),
                    backgroundColor: colores.default,
                    borderColor: colores.default_border,
                    borderWidth: (tipoGrafico === 'line') ? 2 : 1,
                    fill: (tipoGrafico === 'line') ? false : true,
                    tension: (tipoGrafico === 'line') ? 0.1 : 0
                });
            }
        }

        // Asignar colores dinámicos para Pie/Doughnut si solo hay un dataset
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


// =============================================
// SECCIÓN DE CONFIGURACIÓN (NUEVA)
// =============================================

async function loadConfiguracion() {
    const statusEl = document.getElementById('status_configuracion');
    const listaPob = document.getElementById('lista-poblaciones');
    const listaRut = document.getElementById('lista-rutas');

    if (!listaPob || !listaRut) return;

    listaPob.innerHTML = '<div class="spinner-small"></div>';
    listaRut.innerHTML = '<div class="spinner-small"></div>';
    showStatus('status_configuracion', 'Cargando listas...', 'info');

    try {
        const [poblaciones, rutas] = await Promise.all([
            database.obtenerPoblaciones(), // Cargar todas para el admin
            database.obtenerRutas()        // Cargar todas para el admin
        ]);

        // Renderizar Poblaciones
        if (poblaciones.length === 0) {
            listaPob.innerHTML = '<li class="config-list-item">No hay poblaciones registradas.</li>';
        } else {
            listaPob.innerHTML = poblaciones
                .sort((a, b) => `${a.sucursal}-${a.nombre}`.localeCompare(`${b.sucursal}-${b.nombre}`))
                .map(p => `
                <li class="config-list-item">
                    <span><strong>${p.nombre}</strong> (${p.sucursal})</span>
                    <button class="btn btn-sm btn-danger btn-eliminar-config" data-id="${p.id}" data-nombre="${p.nombre}">
                        <i class="fas fa-trash"></i>
                    </button>
                </li>
            `).join('');
        }

        // Renderizar Rutas
        if (rutas.length === 0) {
            listaRut.innerHTML = '<li class="config-list-item">No hay rutas registradas.</li>';
        } else {
            listaRut.innerHTML = rutas
                .sort((a, b) => `${a.sucursal}-${a.nombre}`.localeCompare(`${b.sucursal}-${b.nombre}`))
                .map(r => `
                <li class="config-list-item">
                    <span><strong>${r.nombre}</strong> (${r.sucursal})</span>
                    <button class="btn btn-sm btn-danger btn-eliminar-config" data-id="${r.id}" data-nombre="${r.nombre}">
                        <i class="fas fa-trash"></i>
                    </button>
                </li>
            `).join('');
        }

        showStatus('status_configuracion', 'Listas cargadas.', 'success');
    } catch (error) {
        console.error("Error cargando configuración:", error);
        showStatus('status_configuracion', `Error al cargar: ${error.message}`, 'error');
        listaPob.innerHTML = '<li class="config-list-item error">Error al cargar</li>';
        listaRut.innerHTML = '<li class="config-list-item error">Error al cargar</li>';
    }
}

async function handleAgregarConfig(tipo) {
    const nombreInput = document.getElementById(`nueva-${tipo}-nombre`);
    const sucursalInput = document.getElementById(`nueva-${tipo}-sucursal`);
    const button = document.getElementById(`btn-agregar-${tipo}`);

    const nombre = nombreInput.value.trim().toUpperCase();
    const sucursal = sucursalInput.value;

    if (!nombre || !sucursal) {
        showStatus('status_configuracion', 'El nombre y la sucursal son obligatorios.', 'warning');
        return;
    }

    showButtonLoading(button, true, 'Agregando...');
    showStatus('status_configuracion', `Agregando ${tipo}...`, 'info');

    try {
        let resultado;
        if (tipo === 'poblacion') {
            resultado = await database.agregarPoblacion(nombre, sucursal);
        } else {
            resultado = await database.agregarRuta(nombre, sucursal);
        }

        if (resultado.success) {
            showStatus('status_configuracion', `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} agregada exitosamente.`, 'success');
            nombreInput.value = '';
            await loadConfiguracion(); // Recargar listas
            await inicializarDropdowns(); // Actualizar todos los dropdowns de la app
        } else {
            throw new Error(resultado.message);
        }

    } catch (error) {
        console.error(`Error agregando ${tipo}:`, error);
        showStatus('status_configuracion', `Error: ${error.message}`, 'error');
    } finally {
        showButtonLoading(button, false);
    }
}

async function handleEliminarConfig(tipo, id, nombre) {
    if (!id) return;

    if (confirm(`¿Estás seguro de que deseas eliminar ${tipo} "${nombre}"?\nEsta acción no se puede deshacer.`)) {
        showProcessingOverlay(true, `Eliminando ${tipo}...`);
        showStatus('status_configuracion', `Eliminando ${tipo}...`, 'info');

        try {
            let resultado;
            if (tipo === 'poblacion') {
                resultado = await database.eliminarPoblacion(id);
            } else {
                resultado = await database.eliminarRuta(id);
            }

            if (resultado.success) {
                showStatus('status_configuracion', `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} "${nombre}" eliminada.`, 'success');
                await loadConfiguracion(); // Recargar listas
                await inicializarDropdowns(); // Actualizar todos los dropdowns de la app
            } else {
                throw new Error(resultado.message);
            }
        } catch (error) {
            console.error(`Error eliminando ${tipo}:`, error);
            showStatus('status_configuracion', `Error: ${error.message}`, 'error');
        } finally {
            showProcessingOverlay(false);
        }
    }
}


// =============================================
// FUNCIONES DE VISTA Y AUXILIARES GENERALES
// =============================================

function showView(viewId) {
    console.log(`Navegando a vista: ${viewId}`);
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
        const event = new CustomEvent('viewshown', { detail: { viewId } });
        targetView.dispatchEvent(event);
        console.log(`Vista ${viewId} mostrada.`);
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

    const progressBar = document.getElementById('progress-bar-fixed');
    const progressText = document.getElementById('progress-text-fixed');
    const validPercentage = Math.max(0, Math.min(100, percentage));

    if (progressBar) progressBar.style.width = validPercentage + '%';
    if (progressText) progressText.textContent = message;

    progressContainer.classList.remove('hidden');
    progressContainer.style.display = 'flex';
    document.body.classList.add('has-progress');
}

function hideFixedProgress() {
    const progressContainer = document.getElementById('progress-container-fixed');
    if (progressContainer) {
        progressContainer.classList.add('hidden');
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
};


async function handleOfficeChangeForClientForm() {
    const office = this.value || document.getElementById('office_cliente')?.value;

    // Cargar dinámicamente desde la DB
    const [poblaciones, rutas] = await Promise.all([
        database.obtenerPoblaciones(office),
        database.obtenerRutas(office)
    ]);

    const poblacionesNombres = poblaciones.map(p => p.nombre).sort();
    const rutasNombres = rutas.map(r => r.nombre).sort();

    // Si estamos editando, las listas deben incluir todas las opciones
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
}


async function handleSucursalGraficoChange() {
    const office = this.value;

    // Cargar dinámicamente
    const poblaciones = await database.obtenerPoblaciones(office || null); // null para "Ambas"
    const poblacionesNombres = [...new Set(poblaciones.map(p => p.nombre))].sort();

    popularDropdown('grafico_grupo', poblacionesNombres, 'Todos');
}

/**
 * Inicializa todos los dropdowns estáticos y dinámicos al cargar la app.
 */
async function inicializarDropdowns() {
    console.log('Inicializando dropdowns...');
    const userSucursal = currentUserData?.sucursal; // Obtener sucursal del usuario logueado

    // Cargar dinámicamente desde la DB (rutas ya se obtienen aquí)
    const [poblaciones, rutas] = await Promise.all([
        database.obtenerPoblaciones(),
        database.obtenerRutas()
    ]);
    // const todasLasPoblaciones = [...new Set(poblaciones.map(p => p.nombre))].sort(); // Ya no se necesita globalmente aquí
    const todasLasRutas = [...new Set(rutas.map(r => r.nombre))].sort();

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
        // Otros roles como consulta, cobrador, se pueden añadir si es necesario
    ];
    const tiposReporteGrafico = [
        { value: 'colocacion', text: 'Colocación (Monto)' },
        { value: 'recuperacion', text: 'Recuperación (Pagos)' },
        { value: 'comportamiento', text: 'Comportamiento de Pago (Tipos)' },
    ];

    // --- Dropdowns de Grupo/Población (AHORA USAN LA FUNCIÓN AUXILIAR) ---
    // Usar la sucursal del usuario como filtro inicial si está definida y no es 'AMBAS'
    const filtroSucursalInicial = (userSucursal && userSucursal !== 'AMBAS') ? userSucursal : '';

    // Customer Management Filters
    await _actualizarDropdownGrupo('grupo_filtro', filtroSucursalInicial, 'Todos');
    // Group Payment
    await _actualizarDropdownGrupo('grupo_pago_grupal', filtroSucursalInicial, 'Selecciona un Grupo');
    // Advanced Reports Filters
    await _actualizarDropdownGrupo('grupo_filtro_reporte', filtroSucursalInicial, 'Todos');
    // Graphic Reports Filters
    await _actualizarDropdownGrupo('grafico_grupo', filtroSucursalInicial, 'Todos');

    // Rutas (Cargar todas inicialmente para filtros, se filtran dinámicamente en form usuario)
    popularDropdown('ruta_filtro_reporte', todasLasRutas, 'Todas');
    // Para el formulario de cliente, las rutas se cargan con handleOfficeChangeForClientForm


    // --- Dropdowns estáticos --- (SIN CAMBIOS)
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

    // Dropdowns de Cliente (poblacion/ruta) se cargan con handleOfficeChangeForClientForm
    popularDropdown('poblacion_grupo_cliente', [], 'Selecciona Oficina primero');
    popularDropdown('ruta_cliente', [], 'Selecciona Oficina primero');

}


function actualizarPlazosSegunCliente(esComisionista) {
    // CORRECCIÓN: Un comisionista puede elegir 10, 13 o 14.
    const plazosDisponibles = esComisionista ? [10, 13, 14] : [13, 14];
    popularDropdown('plazo_colocacion', plazosDisponibles.map(p => ({ value: p, text: `${p} semanas` })), 'Selecciona plazo', true);
}


document.addEventListener('viewshown', async function (e) {
    const viewId = e.detail.viewId;
    console.log(`Evento viewshown disparado para: ${viewId}`);

    document.querySelectorAll('.status-message').forEach(el => {
        if (el.id !== 'connection-status' && !el.closest('#generic-modal:not(.hidden)')) {
            el.innerHTML = '';
            el.className = 'status-message hidden';
        }
    });

    switch (viewId) {
        case 'view-reportes':
            loadBasicReports(currentUserData?.sucursal); // Cargar al entrar con filtro
            break;
        case 'view-reportes-avanzados':
            inicializarVistaReportesAvanzados();
            break;
        case 'view-configuracion':
            loadConfiguracion(); // Cargar al entrar
            break;
        case 'view-gestion-clientes':
            inicializarVistaGestionClientes();
            break;
        case 'view-cliente':
            if (!editingClientId) {
                resetClientForm();
            }
            break;
        case 'view-colocacion':
            document.getElementById('curp_colocacion').value = '';
            document.getElementById('form-colocacion').classList.add('hidden');
            showStatus('status_colocacion', 'Ingresa la CURP del cliente para buscar.', 'info');
            // Asegurar que los selectores de plazo/tipo no estén deshabilitados
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
            document.getElementById('grupo_pago_grupal').value = '';
            document.getElementById('grupo-pago-details').classList.add('hidden');
            document.getElementById('monto-recibido-grupo').value = '';
            showStatus('status_pago_grupo', 'Selecciona un grupo para calcular la cobranza.', 'info');
            grupoDePagoActual = null;
            // Actualizar dropdown de grupos según sucursal del usuario
            const userSucursalPago = (currentUserData?.sucursal && currentUserData.sucursal !== 'AMBAS') ? currentUserData.sucursal : '';
            await _actualizarDropdownGrupo('grupo_pago_grupal', userSucursalPago, 'Selecciona un Grupo');
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
        case 'view-main-menu':
            break;
    }
});


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
        const creditosAsociados = await database.buscarCreditosPorHistoricalId(historicalIdCredito, { userSucursal: null }); // Buscar en todas las sucursales

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

console.log('app.js cargado correctamente y listo.');

